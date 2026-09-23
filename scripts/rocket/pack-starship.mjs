// Packs a Starship model for article 015: geometry only, no textures, small enough to ship.
//
//   npx @gltf-transform/cli weld <sketchfab>/scene.gltf tmp/welded.glb
//   npx @gltf-transform/cli join tmp/welded.glb tmp/joined.glb
//   npx @gltf-transform/cli simplify tmp/joined.glb tmp/ship-raw.glb --ratio 0.04 --error 0.01
//   node scripts/rocket/pack-starship.mjs tmp/ship-raw.glb [public/posts/rocket-landing/starship.bin]
//
// The source is "Spacex Starship Ship 24 & Booster 7 V4" by clarence365 (Sketchfab, CC BY 4.0): attribution is
// required and lives in the README and the article. Only the SHIP is kept — the booster is not what lands here — and
// the textures are dropped: the page paints the stage in the site's own colours, as the light series does.
//
// Layout (little endian): u32 jsonBytes, json (padded to 4), i16 positions[3·vertices], i8 normals[3·vertices],
// padding to a multiple of 4, u32 indices[3·triangles], u8 kind[triangles]. Positions are quantised: metres = i16 / 32767 * json.extent + centre.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [source, out = "public/posts/rocket-landing/starship.bin", fromArg = "0.55"] = process.argv.slice(2);
const FROM = Number(fromArg); // where the ship starts, as a fraction of the whole model's height
if (!source) { console.error("usage: node scripts/rocket/pack-starship.mjs <glb> [out.bin]"); process.exit(1); }

const glb = readFileSync(source);
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLength));
const binOffset = 20 + jsonLength + 8; // skip the BIN chunk header
const bin = glb.subarray(binOffset);

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function read(index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const Type = COMPONENT[accessor.componentType], per = COUNT[accessor.type];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? 0;
  // Interleaved attributes: a tool's output often packs POSITION and NORMAL into one buffer view, and reading it as
  // if it were tight silently scrambles every triangle. (It did: 73,000 of 84,000 triangles came out with edges
  // longer than the rocket.)
  if (stride && stride !== per * Type.BYTES_PER_ELEMENT) {
    const out = new Type(accessor.count * per);
    const bytes = new DataView(bin.buffer, bin.byteOffset + start);
    const readOne = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[accessor.componentType];
    for (let i = 0; i < accessor.count; i++)
      for (let k = 0; k < per; k++) out[i * per + k] = bytes[readOne](i * stride + k * Type.BYTES_PER_ELEMENT, true);
    return out;
  }
  return new Type(bin.buffer, bin.byteOffset + start, accessor.count * per);
}

/** A node's world matrix, walking down from the scene's roots. */
const multiply = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function local(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
  return [r[0] * sx, r[1] * sx, r[2] * sx, 0, r[3] * sy, r[4] * sy, r[5] * sy, 0, r[6] * sz, r[7] * sz, r[8] * sz, 0, tx, ty, tz, 1];
}
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const rotate = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];

/** Which paint a triangle gets, from the material's name. */
function kindOf(name = "") {
  const n = name.toLowerCase();
  if (n.includes("heatshield") || n.includes("tile")) return 1;
  if (n.includes("engine") || n.includes("raptor") || n.includes("nozzle")) return 2;
  if (n.includes("flap") || n.includes("fin")) return 3;
  return 0;
}

const triangles = [];
const walk = (index, parent) => {
  const node = gltf.nodes[index];
  const world = multiply(parent, local(node));
  if (node.mesh !== undefined) {
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const position = read(primitive.attributes.POSITION);
      const normal = primitive.attributes.NORMAL !== undefined ? read(primitive.attributes.NORMAL) : null;
      const indices = read(primitive.indices);
      const kind = kindOf(gltf.materials?.[primitive.material]?.name);
      for (let i = 0; i < indices.length; i += 3) {
        const corners = [];
        for (let k = 0; k < 3; k++) {
          const v = indices[i + k];
          corners.push({
            p: apply(world, position[v * 3], position[v * 3 + 1], position[v * 3 + 2]),
            n: normal ? rotate(world, normal[v * 3], normal[v * 3 + 1], normal[v * 3 + 2]) : [0, 1, 0],
          });
        }
        triangles.push({ corners, kind });
      }
    }
  }
  for (const child of node.children ?? []) walk(child, world);
};
for (const root of gltf.scenes[gltf.scene ?? 0].nodes) walk(root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// The stack stands along its longest axis. Ship 24 is the top 50.3 m of a 120 m stack, so everything above 57 % of
// the height is the ship; the booster is dropped.
const axisRange = [0, 1, 2].map((axis) => {
  let lo = Infinity, hi = -Infinity;
  for (const t of triangles) for (const c of t.corners) { lo = Math.min(lo, c.p[axis]); hi = Math.max(hi, c.p[axis]); }
  return { axis, lo, hi, span: hi - lo };
});
const up = axisRange.reduce((a, b) => (a.span > b.span ? a : b));
const across = [0, 1, 2].filter((a) => a !== up.axis);

// The scene holds the launch tower and the pad as well as the rocket, so a height cut alone keeps the tower's top.
// The rocket is the one tall column: find it as the peak of a map of the ground plane, then keep what stands within
// a rocket's radius of that line.
const CELL = (axisRange[across[0]].span + axisRange[across[1]].span) / 120;
const column = new Map();
for (const t of triangles) {
  const c = t.corners[0].p;
  const key = `${Math.round(c[across[0]] / CELL)},${Math.round(c[across[1]] / CELL)}`;
  const seen = column.get(key) ?? { n: 0, lo: Infinity, hi: -Infinity, x: 0, z: 0 };
  seen.n++;
  seen.lo = Math.min(seen.lo, c[up.axis]);
  seen.hi = Math.max(seen.hi, c[up.axis]);
  seen.x += c[across[0]]; seen.z += c[across[1]];
  column.set(key, seen);
}
const tallest = [...column.values()].sort((a, b) => (b.hi - b.lo) * Math.log(1 + b.n) - (a.hi - a.lo) * Math.log(1 + a.n))[0];
const axisPoint = [tallest.x / tallest.n, tallest.z / tallest.n];
// A Starship is 9 m across; in this model's units that is the stack's own width, so measure it from the column itself.
const RADIUS = Number(process.env.RADIUS ?? up.span * 0.06); // in the model's own units, unless overridden
const cut = up.lo + up.span * FROM;
const ship = triangles.filter((t) => {
  const c = [0, 1, 2].map((a) => t.corners.reduce((s, x) => s + x.p[a], 0) / 3);
  return c[up.axis] > cut && Math.hypot(c[across[0]] - axisPoint[0], c[across[1]] - axisPoint[1]) < RADIUS;
});
console.log(`rocket axis at ${axisPoint.map((v) => v.toFixed(2)).join(", ")}, keeping everything within ${RADIUS.toFixed(2)} units of it`);
console.log(`${triangles.length.toLocaleString()} triangles, up axis ${["x", "y", "z"][up.axis]} spanning ${up.span.toFixed(1)} units; ${ship.length.toLocaleString()} above the interstage`);

// Rebuild about the ship's own middle, scaled so that the model is 50.3 m tall (Ship 24's real height).
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const t of ship) for (const c of t.corners) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], c.p[a]); hi[a] = Math.max(hi[a], c.p[a]); }
const scale = 50.3 / (hi[up.axis] - lo[up.axis]);
const centre = [0, 1, 2].map((a) => (a === up.axis ? lo[a] : (lo[a] + hi[a]) / 2));

const vertices = new Map(); // welded by position, to 5 mm
const positions = [], normals = [], indices = [], kinds = [];
for (const t of ship) {
  for (const c of t.corners) {
    // Model space: Y up, origin at the engines.
    const p = [0, 1, 2].map((a) => (c.p[a] - centre[a]) * scale);
    const q = [p[(up.axis + 1) % 3], p[up.axis], p[(up.axis + 2) % 3]];
    const key = q.map((v) => Math.round(v * 200)).join(",");
    let index = vertices.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      vertices.set(key, index);
      positions.push(...q);
      const n = [c.n[(up.axis + 1) % 3], c.n[up.axis], c.n[(up.axis + 2) % 3]];
      const len = Math.hypot(...n) || 1;
      normals.push(n[0] / len, n[1] / len, n[2] / len);
    }
    indices.push(index);
  }
  kinds.push(t.kind);
}

// With GLB=<path> the extracted ship is written back out as a model, so the simplifier can work on it alone. (The
// whole scene cannot be simplified first: the launch tower and the pad share meshes with the rocket, and the result
// is torn apart.)
if (process.env.GLB) {
  const vertexBytes = positions.length * 4, normalBytes = normals.length * 4, indexBytes = indices.length * 4;
  const body = Buffer.alloc(vertexBytes + normalBytes + indexBytes);
  Buffer.from(Float32Array.from(positions).buffer).copy(body, 0);
  Buffer.from(Float32Array.from(normals).buffer).copy(body, vertexBytes);
  Buffer.from(Uint32Array.from(indices).buffer).copy(body, vertexBytes + normalBytes);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < positions.length; v += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], positions[v + a]); max[a] = Math.max(max[a], positions[v + a]); }
  const doc = {
    asset: { version: "2.0", generator: "pack-starship" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: positions.length / 3, type: "VEC3", min, max },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5125, count: indices.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: vertexBytes, target: 34962 },
      { buffer: 0, byteOffset: vertexBytes, byteLength: normalBytes, target: 34962 },
      { buffer: 0, byteOffset: vertexBytes + normalBytes, byteLength: indexBytes, target: 34963 },
    ],
    buffers: [{ byteLength: body.length }],
  };
  const text = JSON.stringify(doc);
  const jsonChunk = Buffer.from(text.padEnd(Math.ceil(text.length / 4) * 4, " "), "utf8");
  const header = Buffer.alloc(12 + 8 + jsonChunk.length + 8);
  header.write("glTF", 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(header.length + body.length, 8);
  header.writeUInt32LE(jsonChunk.length, 12); header.write("JSON", 16); jsonChunk.copy(header, 20);
  header.writeUInt32LE(body.length, 20 + jsonChunk.length); header.write("BIN\u0000", 24 + jsonChunk.length);
  mkdirSync(dirname(process.env.GLB), { recursive: true });
  writeFileSync(process.env.GLB, Buffer.concat([header, body]));
  console.log(`${process.env.GLB}: the extracted ship, ${(indices.length / 3).toLocaleString()} triangles`);
}

let extent = 0;
for (const v of positions) extent = Math.max(extent, Math.abs(v)); // spread would blow the stack on 60k values
const json = JSON.stringify({ source: "Spacex Starship Ship 24 & Booster 7 V4 by clarence365, CC BY 4.0", height: 50.3, extent, vertices: positions.length / 3, triangles: kinds.length });
const jsonBytes = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, " "), "utf8");
const p16 = Int16Array.from(positions, (v) => Math.max(-32767, Math.min(32767, Math.round((v / extent) * 32767))));
const n8 = Int8Array.from(normals, (v) => Math.max(-127, Math.min(127, Math.round(v * 127))));
const idx = Uint32Array.from(indices);
const kind = Uint8Array.from(kinds);

// The indices are u32, so everything before them has to end on a 4-byte boundary.
const pad = (4 - ((4 + jsonBytes.length + p16.byteLength + n8.byteLength) % 4)) % 4;
const size = 4 + jsonBytes.length + p16.byteLength + n8.byteLength + pad + idx.byteLength + kind.byteLength;
const buffer = Buffer.alloc(size);
let at = 0;
buffer.writeUInt32LE(jsonBytes.length, at); at += 4;
jsonBytes.copy(buffer, at); at += jsonBytes.length;
Buffer.from(p16.buffer, p16.byteOffset, p16.byteLength).copy(buffer, at); at += p16.byteLength;
Buffer.from(n8.buffer, n8.byteOffset, n8.byteLength).copy(buffer, at); at += n8.byteLength + pad;
Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength).copy(buffer, at); at += idx.byteLength;
Buffer.from(kind.buffer, kind.byteOffset, kind.byteLength).copy(buffer, at);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buffer);
console.log(`${out}: ${(size / 1024).toFixed(0)} KB — ${(positions.length / 3).toLocaleString()} vertices, ${kinds.length.toLocaleString()} triangles`);

// A sanity check the eye cannot do in a terminal: a Starship is a 9 m tube with a nose, so the radius about its own
// axis should sit near 4.5 m for most of the height and fall away at the top.
const bands = Array.from({ length: 10 }, () => ({ r: 0, n: 0 }));
for (let v = 0; v < positions.length; v += 3) {
  const band = Math.min(9, Math.floor((positions[v + 1] / 50.3) * 10));
  bands[band].r += Math.hypot(positions[v], positions[v + 2]);
  bands[band].n++;
}
console.log("radius by height:", bands.map((b, i) => `${i * 5}m ${(b.r / Math.max(1, b.n)).toFixed(1)}`).join("  "));
