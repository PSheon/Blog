/**
 * The path tracer as one WGSL compute kernel ("megakernel": a whole path per invocation). It is `cpu.ts` again, in f32:
 * the same hash, the same traversal, the same bounce. One dispatch is one sample per pixel.
 *
 * Samples alternate between two accumulation buffers, A (even samples) and B (odd). Shown together they are the
 * picture; compared with each other they are two independent estimates of it, so half their difference is the error of
 * the picture, measured with no reference image at all. `measure` reduces that to one number per workgroup.
 *
 * Three switches, for the figures that take the renderer apart:
 *   quad   the picture four times over in a 2 × 2 grid, with bounce limits 0, 1, 2 and `bounces`
 *   view   1 = do not shade at all: store how many BVH nodes the camera ray visited (a heat map of the hierarchy's work)
 *   brute  1 = no hierarchy: every ray tests every triangle. For small scenes only; this is what the BVH is for.
 */
export const WORKGROUP = 8;

export const KERNEL = /* wgsl */ `
struct Node { mn: vec3f, a: u32, mx: vec3f, b: u32 };
struct Tri { v0: vec3f, m: u32, v1: vec3f, p1: u32, v2: vec3f, p2: u32 };
struct Material { albedo: vec3f, p0: f32, emit: vec3f, p1: f32 };
struct Params { size: vec2u, sample: u32, bounces: u32, eye: vec4f, forward: vec4f, right: vec4f, up: vec4f, view: u32, quad: u32, brute: u32, heatMax: u32 };

@group(0) @binding(0) var<storage, read> nodes: array<Node>;
@group(0) @binding(1) var<storage, read> tris: array<Tri>;
@group(0) @binding(2) var<storage, read> materials: array<Material>;
@group(0) @binding(3) var<storage, read_write> accum: array<vec4f>;     // A then B, size.x · size.y each
@group(0) @binding(4) var<storage, read_write> counters: array<atomic<u32>, 4>; // rays, node visits, stack overflows
@group(0) @binding(5) var<uniform> params: Params;

var<workgroup> tally: array<atomic<u32>, 3>;
var<private> state: u32;

fn pcg(v: u32) -> u32 { let s = v * 747796405u + 2891336453u; let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
fn rnd() -> f32 { state = pcg(state); return f32(state) * (1.0 / 4294967296.0); }

fn slab(mn: vec3f, mx: vec3f, o: vec3f, inv: vec3f, tmax: f32) -> f32 {
  let t0 = (mn - o) * inv; let t1 = (mx - o) * inv; let lo = min(t0, t1); let hi = max(t0, t1);
  let near = max(max(lo.x, lo.y), max(lo.z, 0.0)); let far = min(min(hi.x, hi.y), min(hi.z, tmax));
  return select(1e30, near, near <= far);
}

struct Hit { t: f32, tri: u32, steps: u32, overflow: u32 };
const MISS = 0xffffffffu;
const INNER = 0x80000000u;

fn trace(o: vec3f, d: vec3f, eps: f32) -> Hit {
  let inv = 1.0 / d;
  var h = Hit(1e30, MISS, 0u, 0u);
  var stack: array<u32, 32>; var sp = 0u; var cur = 0u;
  loop {
    h.steps++;
    let n = nodes[cur];
    if ((n.b & INNER) == 0u) {
      for (var i = n.a; i < n.a + n.b; i++) {
        let t = tris[i]; let e1 = t.v1 - t.v0; let e2 = t.v2 - t.v0; let p = cross(d, e2); let det = dot(e1, p);
        if (abs(det) < 1e-12) { continue; }
        let f = 1.0 / det; let s = o - t.v0; let u = dot(s, p) * f;
        if (u < 0.0 || u > 1.0) { continue; }
        let q = cross(s, e1); let v = dot(d, q) * f;
        if (v < 0.0 || u + v > 1.0) { continue; }
        let tt = dot(e2, q) * f;
        if (tt > eps && tt < h.t) { h.t = tt; h.tri = i; }
      }
    } else {
      let left = n.a; let right = n.b & 0x7fffffffu;
      let nl = nodes[left]; let nr = nodes[right];
      let tl = slab(nl.mn, nl.mx, o, inv, h.t); let tr = slab(nr.mn, nr.mx, o, inv, h.t);
      if (tl < 1e30 || tr < 1e30) {
        var near = left; var far = right; var tfar = tr;
        if (tr < tl) { near = right; far = left; tfar = tl; }
        if (tfar < 1e30) { if (sp < 32u) { stack[sp] = far; sp++; } else { h.overflow = 1u; } }
        cur = near; continue;
      }
    }
    if (sp == 0u) { break; }
    sp--; cur = stack[sp];
  }
  return h;
}

fn traceBrute(o: vec3f, d: vec3f, eps: f32) -> Hit {
  var h = Hit(1e30, MISS, 0u, 0u);
  let count = arrayLength(&tris);
  for (var i = 0u; i < count; i++) {
    h.steps++;
    let t = tris[i]; let e1 = t.v1 - t.v0; let e2 = t.v2 - t.v0; let p = cross(d, e2); let det = dot(e1, p);
    if (abs(det) < 1e-12) { continue; }
    let f = 1.0 / det; let s = o - t.v0; let u = dot(s, p) * f;
    if (u < 0.0 || u > 1.0) { continue; }
    let q = cross(s, e1); let v = dot(d, q) * f;
    if (v < 0.0 || u + v > 1.0) { continue; }
    let tt = dot(e2, q) * f;
    if (tt > eps && tt < h.t) { h.t = tt; h.tri = i; }
  }
  return h;
}

fn nearest(o: vec3f, d: vec3f, eps: f32) -> Hit {
  if (params.brute == 1u) { return traceBrute(o, d, eps); }
  return trace(o, d, eps);
}

@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&tally[0], 0u); atomicStore(&tally[1], 0u); atomicStore(&tally[2], 0u); }
  workgroupBarrier();
  var rays = 0u; var steps = 0u; var overflow = 0u;
  if (gid.x < params.size.x && gid.y < params.size.y) {
    let pixel = gid.y * params.size.x + gid.x;
    state = pcg(pixel + pcg(params.sample));
    let jx = rnd(); let jy = rnd();
    // In the 2 × 2 grid every tile is the whole picture at half size, and the tile decides how far light may bounce.
    var px = vec2f(f32(gid.x), f32(gid.y)); var extent = vec2f(f32(params.size.x), f32(params.size.y)); var limit = params.bounces;
    if (params.quad == 1u) {
      extent = extent * 0.5;
      let tile = vec2u(u32(px.x >= extent.x), u32(px.y >= extent.y));
      px = px - vec2f(f32(tile.x), f32(tile.y)) * extent;
      let index = tile.y * 2u + tile.x;
      if (index < 3u) { limit = index; }
    }
    let u = ((px.x + jx) / extent.x) * 2.0 - 1.0; let v = 1.0 - ((px.y + jy) / extent.y) * 2.0;
    var o = params.eye.xyz; var d = normalize(params.forward.xyz + params.right.xyz * u + params.up.xyz * v);
    var through = vec3f(1.0); var rgb = vec3f(0.0); var scale = 1.0;
    for (var bounce = 0u; ; bounce++) {
      rays++;
      let h = nearest(o, d, 1e-5 * scale); steps += h.steps; overflow += h.overflow;
      if (params.view == 1u) { rgb = vec3f(f32(h.steps)); break; } // the heat map: the camera ray's node visits, nothing else
      if (h.tri == MISS) { break; }
      let t = tris[h.tri]; let m = materials[t.m];
      var n = normalize(cross(t.v1 - t.v0, t.v2 - t.v0));
      let front = dot(n, d) < 0.0;
      if (front) { rgb += through * m.emit; }
      if (bounce >= limit) { break; }
      if (!front) { n = -n; }
      var albedo = m.albedo;
      if (bounce > 2u) { let p = max(albedo.x, max(albedo.y, albedo.z)); if (rnd() >= p) { break; } albedo /= p; }
      through *= albedo;
      if (through.x + through.y + through.z == 0.0) { break; }
      let r1 = 6.2831853 * rnd(); let r2 = rnd(); let r = sqrt(r2);
      let tangent = normalize(cross(select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(n.x) > 0.1), n)); let bitangent = cross(n, tangent);
      let at = o + d * h.t;
      scale = max(1.0, max(abs(at.x), max(abs(at.y), abs(at.z))));
      o = at + n * (1e-4 * scale);
      d = normalize(tangent * cos(r1) * r + bitangent * sin(r1) * r + n * sqrt(1.0 - r2));
    }
    let half = params.size.x * params.size.y;
    accum[(params.sample & 1u) * half + pixel] += vec4f(rgb, 1.0);
  }
  atomicAdd(&tally[0], rays); atomicAdd(&tally[1], steps); atomicAdd(&tally[2], overflow);
  workgroupBarrier();
  if (li == 0u) { atomicAdd(&counters[0], atomicLoad(&tally[0])); atomicAdd(&counters[1], atomicLoad(&tally[1])); atomicAdd(&counters[2], atomicLoad(&tally[2])); }
}
`;

/**
 * Per workgroup: the sum over its pixels of the squared half-difference between the two estimates, and the sum of their
 * mean, both in LINEAR radiance. Linear on purpose. Measured after tone mapping, the curve rose before it fell: at two
 * samples most pixels are black in both pictures and agree by accident, and the clamp hides every bright hit.
 */
export const MEASURE = /* wgsl */ `
struct Params { size: vec2u, sample: u32, bounces: u32, eye: vec4f, forward: vec4f, right: vec4f, up: vec4f, view: u32, quad: u32, brute: u32, heatMax: u32 };
@group(0) @binding(0) var<storage, read> accum: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> tiles: array<vec2f>;
@group(0) @binding(2) var<uniform> params: Params;
var<workgroup> partial: array<vec2f, ${WORKGROUP * WORKGROUP}>;

@compute @workgroup_size(${WORKGROUP}, ${WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wid: vec3u) {
  var e = vec2f(0.0);
  if (gid.x < params.size.x && gid.y < params.size.y) {
    let half = params.size.x * params.size.y; let pixel = gid.y * params.size.x + gid.x;
    let a = accum[pixel]; let b = accum[half + pixel];
    if (a.w > 0.0 && b.w > 0.0) {
      let pa = a.rgb / a.w; let pb = b.rgb / b.w; let diff = (pa - pb) * 0.5;
      e = vec2f(dot(diff, diff) / 3.0, dot((pa + pb) * 0.5, vec3f(1.0 / 3.0)));
    }
  }
  partial[li] = e;
  workgroupBarrier();
  if (li == 0u) {
    var sum = vec2f(0.0);
    for (var i = 0u; i < ${WORKGROUP * WORKGROUP}u; i++) { sum += partial[i]; }
    let across = (params.size.x + ${WORKGROUP - 1}u) / ${WORKGROUP}u;
    tiles[wid.y * across + wid.x] = sum;
  }
}
`;

/** A full-screen triangle that shows A + B, tone-mapped (Narkowicz's ACES fit) and gamma-encoded. */
export const PRESENT = /* wgsl */ `
struct Params { size: vec2u, sample: u32, bounces: u32, eye: vec4f, forward: vec4f, right: vec4f, up: vec4f, view: u32, quad: u32, brute: u32, heatMax: u32 };
@group(0) @binding(0) var<storage, read> accum: array<vec4f>;
@group(0) @binding(1) var<uniform> params: Params;
struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let p = corners[i];
  return Out(vec4f(p, 0.0, 1.0), vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5));
}
@fragment fn fs(in: Out) -> @location(0) vec4f {
  let x = min(u32(in.uv.x * f32(params.size.x)), params.size.x - 1u); let y = min(u32(in.uv.y * f32(params.size.y)), params.size.y - 1u);
  let half = params.size.x * params.size.y; let pixel = y * params.size.x + x;
  let a = accum[pixel]; let b = accum[half + pixel]; let n = max(a.w + b.w, 1.0);
  let c = (a.rgb + b.rgb) / n;
  if (params.view == 1u) {
    // Node visits as heat: black → violet → pink → yellow → white, linear in the count up to heatMax.
    let t = clamp(c.x / f32(params.heatMax), 0.0, 1.0);
    let ramp = mix(mix(vec3f(0.03, 0.02, 0.10), vec3f(0.45, 0.20, 0.85), smoothstep(0.0, 0.35, t)), mix(vec3f(1.0, 0.43, 0.59), vec3f(1.0, 0.95, 0.70), smoothstep(0.6, 1.0, t)), smoothstep(0.3, 0.7, t));
    return vec4f(ramp, 1.0);
  }
  let mapped = clamp(c * (2.51 * c + 0.03) / (c * (2.43 * c + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
  return vec4f(pow(mapped, vec3f(1.0 / 2.2)), 1.0);
}
`;
