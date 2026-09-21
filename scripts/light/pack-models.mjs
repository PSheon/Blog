// Packs Sketchbook's car, helicopter, aeroplane (Jan Blaha / swift502, MIT) for the light series' playground.
//
//   node scripts/light/pack-models.mjs <folder with car.glb heli.glb airplane.glb> [out.bin]
//
// The models' textures are baked lighting in grey (the very thing a path tracer computes for itself), so none of it is
// copied. It is read once, as a classifier: a triangle whose texel is near black is a window. Everything else gets the
// vehicle's paint; wheels are tyres. The colours are ours (lib/rt/models.ts).
//
// A model is a list of PARTS. The body holds everything that does not move by itself; wheels and rotors are parts of
// their own (so are doors, which swing about their hinge), stored about their own origin, with the 3 × 4 rest transform that puts them on the body. Also kept: the
// colliders (boxes and spheres, for the physics), seats and the camera anchor.
//
// Layout (little endian): u32 jsonBytes, json (padded to 4), f32 positions[9·triangles], u8 kind[triangles]
// kind: 0 paint, 1 window, 2 tyre, 3 interior (a triangle that the vehicle's own shell hides from nearly every side: seats,
// floor, dashboard).
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let sharp;
try { sharp = require("sharp"); } catch { const { readdirSync } = await import("node:fs"); const dir = readdirSync("node_modules/.pnpm").find((d) => d.startsWith("sharp@")); sharp = require(join(process.cwd(), "node_modules/.pnpm", dir, "node_modules/sharp")); }

const [folder, out = "public/posts/light-playground/models.bin"] = process.argv.slice(2);
if (!folder) { console.error("usage: node scripts/light/pack-models.mjs <folder> [out.bin]"); process.exit(1); }

const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const trs = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
/** The inverse of a rigid-with-uniform-scale 4 × 4, general enough for these files: full 3 × 3 inverse. */
const invert = (m) => {
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10], det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  const t = [-(r[0] * m[12] + r[1] * m[13] + r[2] * m[14]), -(r[3] * m[12] + r[4] * m[13] + r[5] * m[14]), -(r[6] * m[12] + r[7] * m[13] + r[8] * m[14])];
  return [r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, t[0], t[1], t[2], 1];
};
const apply = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const round = (v) => +v.toFixed(5);

const positions = [], kinds = [], models = {};
for (const name of ["car", "heli", "airplane"]) {
  const file = readFileSync(join(folder, `${name}.glb`)), buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), dv = new DataView(buf);
  const jsonBytes = dv.getUint32(12, true), gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonBytes))), bin = 20 + jsonBytes + 8;
  const accessor = (i) => {
    const a = gltf.accessors[i], view = gltf.bufferViews[a.bufferView], offset = bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    const stride = view.byteStride ? view.byteStride / T.BYTES_PER_ELEMENT : width, data = new T(buf.slice(offset, offset + ((a.count - 1) * stride + width) * T.BYTES_PER_ELEMENT));
    return { count: a.count, get: (k, c) => data[k * stride + c] };
  };
  // the baked-light texture of each material, as grey levels, to find the windows
  const grey = [];
  for (const material of gltf.materials) {
    const t = material.pbrMetallicRoughness?.baseColorTexture;
    if (!t) { grey.push(null); continue; }
    const image = gltf.images[gltf.textures[t.index].source], view = gltf.bufferViews[image.bufferView], bytes = Buffer.from(buf, bin + (view.byteOffset ?? 0), view.byteLength);
    const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
    grey.push({ data, w: info.width, h: info.height, tyre: /wheel/i.test(material.name) });
  }

  const parts = [{ name: "body", role: "body", rest: null, first: positions.length / 9, count: 0 }], colliders = [], seats = [], anchors = {}, entries = {};
  const movers = [], shell = [], bodyTriangles = [];
  const visit = (index, parent, part) => {
    const node = gltf.nodes[index], world = mul(parent, trs(node)), data = node.extras?.data;
    if (data === "collision") { const p = accessor(gltf.meshes[node.mesh].primitives[0].attributes.POSITION); let r = 0; const half = [0, 0, 0]; for (let k = 0; k < p.count; k++) { const v = [p.get(k, 0), p.get(k, 1), p.get(k, 2)].map((x, c) => Math.abs(x * Math.hypot(world[c * 4], world[c * 4 + 1], world[c * 4 + 2]))); r = Math.max(r, Math.hypot(...v)); for (let c = 0; c < 3; c++) half[c] = Math.max(half[c], v[c]); } colliders.push(node.extras.shape === "sphere" ? { shape: "sphere", at: [world[12], world[13], world[14]].map(round), radius: round(r) } : { shape: "box", at: [world[12], world[13], world[14]].map(round), half: half.map(round), rest: world.slice(0, 12).map(round) }); return; }
    if (data === "seat") seats.push({ name: node.name, type: node.extras.seat_type, at: [world[12], world[13], world[14]].map(round), door: node.extras.door_object ?? null, connected: (node.extras.connected_seats ?? "").split(";").filter(Boolean), entries: (node.extras.entry_points ?? "").split(";").filter(Boolean) });
    if (/^entrance/.test(node.name)) entries[node.name] = [world[12], world[13], world[14]].map(round);
    if (data === "camera") anchors.camera = [world[12], world[13], world[14]].map(round);
    let target = part;
    const door = /^door/.test(node.name);
    if (data === "wheel" || data === "rotor" || data === "aileron" || data === "elevator" || data === "rudder" || data === "steering_wheel" || door) movers.push(target = { name: node.name, role: door ? "door" : data, side: node.extras?.side ?? null, steering: node.extras?.steering === "true", drive: node.extras?.drive ?? null, rest: world, inverse: invert(world), triangles: [] });
    if (node.mesh != null) for (const primitive of gltf.meshes[node.mesh].primitives) {
      const p = accessor(primitive.attributes.POSITION), uv = primitive.attributes.TEXCOORD_0 != null ? accessor(primitive.attributes.TEXCOORD_0) : null, ix = primitive.indices != null ? accessor(primitive.indices) : null, count = ix ? ix.count : p.count, tex = grey[primitive.material ?? 0];
      for (let t = 0; t + 2 < count; t += 3) {
        const corners = [0, 1, 2].map((k) => (ix ? ix.get(t + k, 0) : t + k)), tri = corners.flatMap((k) => apply(world, [p.get(k, 0), p.get(k, 1), p.get(k, 2)]));
        let kind = tex?.tyre ? 2 : 0;
        if (tex && !tex.tyre && uv) { let sum = 0; for (const [a, b, c] of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) { const u = a * uv.get(corners[0], 0) + b * uv.get(corners[1], 0) + c * uv.get(corners[2], 0), v = a * uv.get(corners[0], 1) + b * uv.get(corners[1], 1) + c * uv.get(corners[2], 1); const x = Math.min(tex.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * tex.w))), y = Math.min(tex.h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * tex.h))); sum += tex.data[y * tex.w + x]; } if (sum / 4 < 24) kind = 1; }
        const record = { tri, kind }; shell.push(record);
        if (target === part) { bodyTriangles.push(record); parts[0].count++; } else target.triangles.push(record);
      }
    }
    for (const child of node.children ?? []) visit(child, world, target);
  };
  for (const rootNode of gltf.scenes[gltf.scene ?? 0].nodes) visit(rootNode, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], parts[0]);
  // Interior: from a triangle's middle, look along its own normal and five other ways; if the vehicle itself is in the way nearly
  // everywhere, it is inside. (The baked texture cannot tell: it is grey everywhere.)
  const hits = (o, d, skip) => { for (const r of shell) { if (r === skip) continue; const t = r.tri, e1 = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], e2 = [t[6] - t[0], t[7] - t[1], t[8] - t[2]], p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) continue; const sv = [o[0] - t[0], o[1] - t[1], o[2] - t[2]], u = (sv[0] * p[0] + sv[1] * p[1] + sv[2] * p[2]) / det; if (u < 0 || u > 1) continue; const q = [sv[1] * e1[2] - sv[2] * e1[1], sv[2] * e1[0] - sv[0] * e1[2], sv[0] * e1[1] - sv[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det; if (v < 0 || u + v > 1) continue; if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 1e-4) return true; } return false; };
  let interior = 0;
  for (const r of bodyTriangles) {
    if (r.kind !== 0) continue;
    const t = r.tri, c = [(t[0] + t[3] + t[6]) / 3, (t[1] + t[4] + t[7]) / 3, (t[2] + t[5] + t[8]) / 3], e1 = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], e2 = [t[6] - t[0], t[7] - t[1], t[8] - t[2]], n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n) || 1, N = n.map((x) => x / l);
    const from = c.map((x, k) => x + N[k] * 0.01); let blocked = 0;
    for (const d of [N, [1, 0.12, 0.07], [-1, 0.12, 0.07], [0.07, 0.12, 1], [0.07, 0.12, -1], [0.05, 1, 0.08]]) { const dl = Math.hypot(...d); if (hits(from, d.map((x) => x / dl), r)) blocked++; }
    if (blocked >= (name === "heli" ? 4 : 5) && name !== "airplane") { r.kind = 3; interior++; } // the helicopter's cabin is a bubble with no glass in it: more of the sky gets in // (the aeroplane's cockpit is open to the sky and small; its wings would fool this)
  }
  for (const r of bodyTriangles) { positions.push(...r.tri); kinds.push(r.kind); }
  for (const m of movers) { // a mover's triangles go about its own origin
    const first = positions.length / 9;
    for (const { tri, kind } of m.triangles) { for (let k = 0; k < 3; k++) positions.push(...apply(m.inverse, tri.slice(k * 3, k * 3 + 3))); kinds.push(m.role === "rotor" ? 2 : kind); } // rotor blades are dark, like tyres
    parts.push({ name: m.name, role: m.role, side: m.side, steering: m.steering, drive: m.drive, rest: m.rest.slice(0, 3).concat(m.rest.slice(4, 7), m.rest.slice(8, 11), m.rest.slice(12, 15)).map(round), first, count: m.triangles.length });
  }
  const windows = kinds.slice(parts[0].first, parts[0].first + parts[0].count).filter((k) => k === 1).length;
  for (const seat of seats) seat.entries = seat.entries.map((e) => ({ name: e, at: entries[e] })).filter((e) => e.at);
  models[name] = { parts, colliders, seats, anchors };
  console.log(`  ${interior} interior triangles`);
  console.log(`${name}: ${parts.map((p) => `${p.name}(${p.role}) ${p.count}`).join(", ")}; ${windows} window triangles; ${colliders.length} colliders; seats ${seats.map((s) => s.type).join("/")}`);
}

const header = { triangles: kinds.length, models, credit: "Models: Sketchbook by Jan Blaha (swift502), MIT. Geometry only; colours are not the original's." };
let json = JSON.stringify(header); while ((4 + Buffer.byteLength(json)) % 4) json += " ";
const head = Buffer.alloc(4); head.writeUInt32LE(Buffer.byteLength(json));
writeFileSync(out, Buffer.concat([head, Buffer.from(json), Buffer.from(new Float32Array(positions).buffer), Buffer.from(new Uint8Array(kinds).buffer)]));
console.log(`${out}: ${kinds.length} triangles, ${(4 + Buffer.byteLength(json) + positions.length * 4 + kinds.length)} bytes`);
