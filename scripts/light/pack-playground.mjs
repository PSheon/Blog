// Packs the GEOMETRY of Sketchbook's world.glb (Jan Blaha / swift502, MIT) into a small binary for the light series.
//
//   node scripts/light/pack-playground.mjs <path to world.glb> [out.bin]
//
// world.glb must never enter this repository: it embeds Textures.com photographs, which may not be redistributed.
// This script reads positions, indices and material NAMES only. No image, no UV, no texture reference is copied; the
// colours the playground is drawn with are a palette of ours (lib/rt/playground.ts). Collider meshes are left out.
//
// Layout (little endian): u32 jsonBytes, json (padded to 4), f32 positions[3·vertices], u16|u32 indices[3·triangles],
// u8 material[triangles].
import { readFileSync, writeFileSync } from "node:fs";

const [source, out = "public/posts/light-playground/playground.bin"] = process.argv.slice(2);
if (!source) { console.error("usage: node scripts/light/pack-playground.mjs <world.glb> [out.bin]"); process.exit(1); }
const file = readFileSync(source), buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), dv = new DataView(buf);
const jsonBytes = dv.getUint32(12, true), gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonBytes))), bin = 20 + jsonBytes + 8;

const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const trs = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
const accessor = (i) => {
  const a = gltf.accessors[i], view = gltf.bufferViews[a.bufferView], offset = bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const stride = view.byteStride ? view.byteStride / T.BYTES_PER_ELEMENT : width, data = new T(buf.slice(offset, offset + ((a.count - 1) * stride + width) * T.BYTES_PER_ELEMENT));
  return { count: a.count, get: (k, c) => data[k * stride + c] };
};

const positions = [], indices = [], material = [], seen = new Map(), spawns = [], perMaterial = new Map();
const vertex = (x, y, z) => {
  const key = `${Math.fround(x)},${Math.fround(y)},${Math.fround(z)}`;
  let id = seen.get(key);
  if (id === undefined) { id = positions.length / 3; positions.push(x, y, z); seen.set(key, id); }
  return id;
};
const visit = (index, parent) => {
  const node = gltf.nodes[index], m = mul(parent, trs(node));
  if (node.extras?.data === "spawn") spawns.push({ type: node.extras.type, at: [m[12], m[13], m[14]].map((v) => +v.toFixed(2)), basis: [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]].map((v) => +v.toFixed(4)) });
  if (node.mesh != null && node.extras?.data !== "physics") for (const primitive of gltf.meshes[node.mesh].primitives) {
    const p = accessor(primitive.attributes.POSITION), ix = primitive.indices != null ? accessor(primitive.indices) : null, count = ix ? ix.count : p.count;
    const world = Array.from({ length: p.count }, (_, k) => { const x = p.get(k, 0), y = p.get(k, 1), z = p.get(k, 2); return vertex(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); });
    for (let t = 0; t + 2 < count; t += 3) {
      const a = world[ix ? ix.get(t, 0) : t], b = world[ix ? ix.get(t + 1, 0) : t + 1], c = world[ix ? ix.get(t + 2, 0) : t + 2];
      if (a === b || b === c || a === c) continue; // degenerate
      indices.push(a, b, c); material.push(primitive.material ?? 0);
      perMaterial.set(primitive.material ?? 0, (perMaterial.get(primitive.material ?? 0) ?? 0) + 1);
    }
  }
  for (const child of node.children ?? []) visit(child, m);
};
for (const rootNode of gltf.scenes[gltf.scene ?? 0].nodes) visit(rootNode, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const vertices = positions.length / 3, triangles = material.length, wide = vertices > 65535;
const header = { vertices, triangles, indexBytes: wide ? 4 : 2, materials: gltf.materials.map((m) => m.name), spawns, credit: "Geometry: Sketchbook by Jan Blaha (swift502), MIT. Textures removed; colours are not the original's." };
let json = JSON.stringify(header); while ((4 + Buffer.byteLength(json)) % 4) json += " ";
const head = Buffer.alloc(4); head.writeUInt32LE(Buffer.byteLength(json));
const pad = Buffer.alloc((4 - ((triangles * 3 * (wide ? 4 : 2)) % 4)) % 4);
writeFileSync(out, Buffer.concat([head, Buffer.from(json), Buffer.from(new Float32Array(positions).buffer), Buffer.from((wide ? new Uint32Array(indices) : new Uint16Array(indices)).buffer), pad, Buffer.from(new Uint8Array(material).buffer)]));
console.log(`${out}: ${vertices} vertices, ${triangles} triangles, ${spawns.length} spawns`);
for (const [id, n] of [...perMaterial].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${gltf.materials[id].name}`);
