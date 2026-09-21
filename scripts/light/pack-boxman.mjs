// Packs Sketchbook's character, boxman (Jan Blaha / swift502, MIT), for the light series' playground.
//
//   node scripts/light/pack-boxman.mjs <boxman.glb> [out.bin]
//
// Kept: the mesh with its skin weights, the skeleton, and all 34 animation clips, sampled at 30 frames a second so the
// page needs no curve evaluation. Not kept: the texture (baked light, like the vehicles').
//
// Layout (little endian): u32 jsonBytes, json (padded to 4), f32 positions[3v], f32 weights[4v], f32 inverseBind[16j],
// f32 clips[...] (per frame, per joint: translation 3, rotation 4 (xyzw), scale 3), u8 joints[4v] (padded to 4),
// u16 indices[3t].
import { readFileSync, writeFileSync } from "node:fs";

const FPS = 30; // every clip the file has: Sketchbook's character states use all of them but two
const [source, out = "public/posts/light-playground/boxman.bin"] = process.argv.slice(2);
if (!source) { console.error("usage: node scripts/light/pack-boxman.mjs <boxman.glb> [out.bin]"); process.exit(1); }
const file = readFileSync(source), buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), dv = new DataView(buf);
const jsonBytes = dv.getUint32(12, true), gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonBytes))), bin = 20 + jsonBytes + 8;
const read = (i) => {
  const a = gltf.accessors[i], view = gltf.bufferViews[a.bufferView], offset = bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
  const stride = view.byteStride ? view.byteStride / T.BYTES_PER_ELEMENT : width, data = new T(buf.slice(offset, offset + ((a.count - 1) * stride + width) * T.BYTES_PER_ELEMENT)), flat = [];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < width; c++) flat.push(data[k * stride + c]);
  return { count: a.count, width, flat };
};
const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const trs = (n) => {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};

const skin = gltf.skins[0], jointNodes = skin.joints, parentOf = new Map();
gltf.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)));
const meshNode = gltf.nodes.find((n) => n.mesh != null && n.skin != null), primitive = gltf.meshes[meshNode.mesh].primitives[0];
const positions = read(primitive.attributes.POSITION).flat, weights = read(primitive.attributes.WEIGHTS_0).flat, joints4 = read(primitive.attributes.JOINTS_0).flat, indices = read(primitive.indices).flat, inverseBind = read(skin.inverseBindMatrices).flat;
// what sits above the skeleton's root (Blender's armature object): applied once, to every joint
let above = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
for (let n = parentOf.get(jointNodes.find((j) => !jointNodes.includes(parentOf.get(j)))); n !== undefined; n = parentOf.get(n)) above = mul(trs(gltf.nodes[n]), above);
const joints = jointNodes.map((node) => { const n = gltf.nodes[node]; return { name: n.name, parent: jointNodes.indexOf(parentOf.get(node)), rest: [...(n.translation ?? [0, 0, 0]), ...(n.rotation ?? [0, 0, 0, 1]), ...(n.scale ?? [1, 1, 1])] }; });
for (let j = 0; j < joints.length; j++) if (joints[j].parent >= j) throw new Error("joints are not parents-first");

const slerp = (a, b, t) => { let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; const s = d < 0 ? -1 : 1; d = Math.abs(d); if (d > 0.9995) { const o = a.map((v, k) => v + (s * b[k] - v) * t), l = Math.hypot(...o); return o.map((v) => v / l); } const th = Math.acos(d), wa = Math.sin((1 - t) * th) / Math.sin(th), wb = (s * Math.sin(t * th)) / Math.sin(th); return a.map((v, k) => v * wa + b[k] * wb); };
const clipData = [], clips = {};
for (const animation of gltf.animations) {
  const name = animation.name;
  const tracks = animation.channels.filter((c) => jointNodes.includes(c.target.node)).map((c) => { const s = animation.samplers[c.sampler], times = read(s.input).flat, values = read(s.output), cubic = s.interpolation === "CUBICSPLINE", width = values.width; return { joint: jointNodes.indexOf(c.target.node), path: c.target.path, times, step: s.interpolation === "STEP", at: (k) => values.flat.slice((cubic ? k * 3 + 1 : k) * width, (cubic ? k * 3 + 2 : k + 1) * width) }; });
  const duration = Math.max(...tracks.map((t) => t.times.at(-1))), frames = Math.max(1, Math.round(duration * FPS));
  clips[name] = { first: clipData.length / (joints.length * 10), frames, duration: +duration.toFixed(4) };
  for (let f = 0; f < frames; f++) {
    const time = (f / frames) * duration, pose = joints.map((j) => [...j.rest]);
    for (const tr of tracks) {
      let k = 0; while (k < tr.times.length - 2 && tr.times[k + 1] <= time) k++;
      const t0 = tr.times[k], t1 = tr.times[Math.min(k + 1, tr.times.length - 1)], u = tr.step || t1 === t0 ? 0 : Math.min(1, Math.max(0, (time - t0) / (t1 - t0))), a = tr.at(k), b = tr.at(Math.min(k + 1, tr.times.length - 1));
      const value = tr.path === "rotation" ? slerp(a, b, u) : a.map((v, i) => v + (b[i] - v) * u), at = tr.path === "translation" ? 0 : tr.path === "rotation" ? 3 : 7;
      for (let i = 0; i < value.length; i++) pose[tr.joint][at + i] = value[i];
    }
    for (const p of pose) clipData.push(...p);
  }
}

let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], positions[i + k]); hi[k] = Math.max(hi[k], positions[i + k]); }
const header = { vertices: positions.length / 3, triangles: indices.length / 3, joints, above: above.map((v) => +v.toFixed(6)), clips, fps: FPS, credit: "Boxman: Sketchbook by Jan Blaha (swift502), MIT. Mesh, skeleton and animations; the texture is not included." };
let json = JSON.stringify(header); while ((4 + Buffer.byteLength(json)) % 4) json += " ";
const head = Buffer.alloc(4); head.writeUInt32LE(Buffer.byteLength(json));
const j8 = Buffer.from(new Uint8Array(joints4)), pad = Buffer.alloc((4 - (j8.length % 4)) % 4);
writeFileSync(out, Buffer.concat([head, Buffer.from(json), Buffer.from(new Float32Array(positions).buffer), Buffer.from(new Float32Array(weights).buffer), Buffer.from(new Float32Array(inverseBind).buffer), Buffer.from(new Float32Array(clipData).buffer), j8, pad, Buffer.from(new Uint16Array(indices).buffer)]));
console.log(`${out}: ${header.vertices} vertices, ${header.triangles} triangles, ${joints.length} joints, clips ${Object.entries(clips).map(([n, c]) => `${n}:${c.frames}`).join(" ")}`);
console.log(`bind-pose bounds (mesh space) ${lo.map((v) => v.toFixed(2))} … ${hi.map((v) => v.toFixed(2))}; above = ${above.map((v) => +v.toFixed(3))}`);
console.log("joints:", joints.map((j) => `${j.name}<${j.parent}`).join(" "));
