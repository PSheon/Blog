/// <reference types="@webgpu/types" />
/**
 * The WebGPU half of the engine, stage-0 size: the kernels that carry almost all of a Transformer's arithmetic, each
 * with its backward pass. f32 throughout. `lib/ml` (f64, itself checked against finite differences) is the reference
 * every kernel is compared with.
 *
 * This file imports nothing, on purpose: the parity script strips its types and hands it to a browser as it is.
 */

const TILE = 16, ROW = 64;

const MATMUL = /* wgsl */ `
struct Dims { m: u32, k: u32, n: u32, ta: u32, tb: u32, batchB: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> a: array<f32>;
@group(0) @binding(2) var<storage, read> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> c: array<f32>;
var<workgroup> tileA: array<array<f32, ${TILE}>, ${TILE}>;
var<workgroup> tileB: array<array<f32, ${TILE}>, ${TILE}>;
// C[z] = op(A[z]) · op(B[z]); op is a transpose when ta / tb is set, and B is shared by every z unless batchB is set.
@compute @workgroup_size(${TILE}, ${TILE}, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
  let row = gid.y; let col = gid.x; let baseA = gid.z * dims.m * dims.k; let baseB = select(0u, gid.z * dims.k * dims.n, dims.batchB == 1u);
  var sum = 0.0;
  for (var t = 0u; t < (dims.k + ${TILE - 1}u) / ${TILE}u; t++) {
    let p = t * ${TILE}u + lid.x; let q = t * ${TILE}u + lid.y;
    tileA[lid.y][lid.x] = select(0.0, a[baseA + select(row * dims.k + p, p * dims.m + row, dims.ta == 1u)], row < dims.m && p < dims.k);
    tileB[lid.y][lid.x] = select(0.0, b[baseB + select(q * dims.n + col, col * dims.k + q, dims.tb == 1u)], q < dims.k && col < dims.n);
    workgroupBarrier();
    for (var i = 0u; i < ${TILE}u; i++) { sum += tileA[lid.y][i] * tileB[i][lid.x]; }
    workgroupBarrier();
  }
  if (row < dims.m && col < dims.n) { c[gid.z * dims.m * dims.n + row * dims.n + col] = sum; }
}`;

const LAYER_NORM = /* wgsl */ `
struct Dims { rows: u32, d: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> x: array<f32>;
@group(0) @binding(2) var<storage, read> gain: array<f32>;
@group(0) @binding(3) var<storage, read> bias: array<f32>;
@group(0) @binding(4) var<storage, read_write> y: array<f32>;
@compute @workgroup_size(${ROW})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let r = gid.x; if (r >= dims.rows) { return; }
  let base = r * dims.d; var mean = 0.0; var variance = 0.0;
  for (var j = 0u; j < dims.d; j++) { mean += x[base + j]; }
  mean /= f32(dims.d);
  for (var j = 0u; j < dims.d; j++) { let v = x[base + j] - mean; variance += v * v; }
  let inv = inverseSqrt(variance / f32(dims.d) + 1e-5);
  for (var j = 0u; j < dims.d; j++) { y[base + j] = (x[base + j] - mean) * inv * gain[j] + bias[j]; }
}`;

/** dx for every row. The mean and the scale are worked out again rather than kept: cheaper than the memory. */
const LAYER_NORM_DX = /* wgsl */ `
struct Dims { rows: u32, d: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> x: array<f32>;
@group(0) @binding(2) var<storage, read> gain: array<f32>;
@group(0) @binding(3) var<storage, read> dy: array<f32>;
@group(0) @binding(4) var<storage, read_write> dx: array<f32>;
@group(0) @binding(5) var<storage, read_write> xhatOut: array<f32>;
@compute @workgroup_size(${ROW})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let r = gid.x; if (r >= dims.rows) { return; }
  let base = r * dims.d; let n = f32(dims.d); var mean = 0.0; var variance = 0.0;
  for (var j = 0u; j < dims.d; j++) { mean += x[base + j]; }
  mean /= n;
  for (var j = 0u; j < dims.d; j++) { let v = x[base + j] - mean; variance += v * v; }
  let inv = inverseSqrt(variance / n + 1e-5);
  var sumD = 0.0; var sumDX = 0.0;
  for (var j = 0u; j < dims.d; j++) { let g = dy[base + j] * gain[j]; sumD += g; sumDX += g * (x[base + j] - mean) * inv; }
  for (var j = 0u; j < dims.d; j++) { let xhat = (x[base + j] - mean) * inv; xhatOut[base + j] = xhat; dx[base + j] = inv / n * (n * dy[base + j] * gain[j] - sumD - xhat * sumDX); }
}`;

/**
 * dgain and dbias: one thread per column, summing down the rows. It reads the normalised input the dx kernel has just
 * written: the first version worked the mean and variance out again for every row in every one of the d threads, and
 * that one kernel took nine tenths of a training step.
 */
const LAYER_NORM_DPARAMS = /* wgsl */ `
struct Dims { rows: u32, d: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> xhat: array<f32>;
@group(0) @binding(2) var<storage, read> dy: array<f32>;
@group(0) @binding(3) var<storage, read_write> dgain: array<f32>;
@group(0) @binding(4) var<storage, read_write> dbias: array<f32>;
@compute @workgroup_size(${ROW})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let j = gid.x; if (j >= dims.d) { return; }
  var g = 0.0; var b = 0.0;
  for (var r = 0u; r < dims.rows; r++) { let at = r * dims.d + j; g += dy[at] * xhat[at]; b += dy[at]; }
  dgain[j] = g; dbias[j] = b;
}`;

/** Row i may look at column j when j ≤ i, or when both are in the prefix (pictures and words see each other freely). */
const SOFTMAX = /* wgsl */ `
struct Dims { rows: u32, t: u32, prefix: u32, pad: u32 };
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> scores: array<f32>;
@group(0) @binding(2) var<storage, read_write> y: array<f32>;
@compute @workgroup_size(${ROW})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let r = gid.x; if (r >= dims.rows) { return; }
  let i = r % dims.t; let base = r * dims.t; let last = select(i, max(i, dims.prefix - 1u), dims.prefix > 0u && i < dims.prefix);
  var top = -3.4e38;
  for (var j = 0u; j <= last; j++) { top = max(top, scores[base + j]); }
  var sum = 0.0;
  for (var j = 0u; j <= last; j++) { sum += exp(scores[base + j] - top); }
  for (var j = 0u; j < dims.t; j++) { y[base + j] = select(0.0, exp(scores[base + j] - top) / sum, j <= last); }
}`;

const SOFTMAX_BACKWARD = /* wgsl */ `
struct Dims { rows: u32, t: u32, prefix: u32, pad: u32 };
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> y: array<f32>;
@group(0) @binding(2) var<storage, read> dy: array<f32>;
@group(0) @binding(3) var<storage, read_write> dx: array<f32>;
@compute @workgroup_size(${ROW})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let r = gid.x; if (r >= dims.rows) { return; }
  let base = r * dims.t; var inner = 0.0;
  for (var j = 0u; j < dims.t; j++) { inner += y[base + j] * dy[base + j]; }
  for (var j = 0u; j < dims.t; j++) { dx[base + j] = y[base + j] * (dy[base + j] - inner); }
}`;

/** mode 0: c = a + b; 1: c = relu(a); 2: c = b where a > 0 (relu backward: a is the input, b the gradient). */
const ELEMENTWISE = /* wgsl */ `
struct Dims { n: u32, mode: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> a: array<f32>;
@group(0) @binding(2) var<storage, read> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> c: array<f32>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  let i = gid.y * groups.x * 256u + gid.x; if (i >= dims.n) { return; }
  if (dims.mode == 0u) { c[i] = a[i] + b[i]; } else if (dims.mode == 1u) { c[i] = max(a[i], 0.0); } else { c[i] = select(0.0, b[i], a[i] > 0.0); }
}`;

const ADAM = /* wgsl */ `
struct Dims { n: u32, pad0: u32, lr: f32, correction1: f32, correction2: f32, pad1: f32, pad2: f32, pad3: f32 };
@group(0) @binding(0) var<uniform> dims: Dims;
@group(0) @binding(1) var<storage, read> grad: array<f32>;
@group(0) @binding(2) var<storage, read_write> weight: array<f32>;
@group(0) @binding(3) var<storage, read_write> m: array<f32>;
@group(0) @binding(4) var<storage, read_write> v: array<f32>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) groups: vec3<u32>) {
  let i = gid.y * groups.x * 256u + gid.x; if (i >= dims.n) { return; }
  m[i] = 0.9 * m[i] + 0.1 * grad[i]; v[i] = 0.999 * v[i] + 0.001 * grad[i] * grad[i];
  weight[i] -= dims.lr * (m[i] / dims.correction1) / (sqrt(v[i] / dims.correction2) + 1e-8);
}`;

export type Tensor = { buffer: GPUBuffer; size: number };
export type MatmulShape = { m: number; k: number; n: number; transposeA?: boolean; transposeB?: boolean; batch?: number; batchedB?: boolean };

/** Thin wrapper over a device: tensors are storage buffers, ops are encoded into one command encoder until `flush()`. */
export class Gpu {
  private readonly pipelines = new Map<string, GPUComputePipeline>();
  private encoder: GPUCommandEncoder | null = null;
  private readonly scratch: GPUBuffer[] = [];

  readonly device: GPUDevice;
  readonly adapterName: string;

  // Written out rather than as parameter properties: the parity script only strips types, and those are not just types.
  private constructor(device: GPUDevice, adapterName: string) { this.device = device; this.adapterName = adapterName; }

  /** null when the browser has no WebGPU or no adapter: the caller falls back to a checkpoint. */
  static async create(): Promise<Gpu | null> {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) return null;
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize } });
    return new Gpu(device, `${adapter.info?.vendor ?? ""} ${adapter.info?.architecture ?? ""}`.trim());
  }

  tensor(size: number, data?: Float32Array): Tensor {
    const buffer = this.device.createBuffer({ size: Math.max(4, size * 4), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    if (data) this.device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
    return { buffer, size };
  }

  async read(t: Tensor): Promise<Float32Array> {
    await this.flush();
    const staging = this.device.createBuffer({ size: t.size * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(t.buffer, 0, staging, 0, t.size * 4);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(staging.getMappedRange().slice(0));
    staging.destroy();
    return out;
  }

  /** Submits what has been encoded and waits until the GPU has done it. */
  async flush(): Promise<void> {
    if (this.encoder) { this.device.queue.submit([this.encoder.finish()]); this.encoder = null; }
    await this.device.queue.onSubmittedWorkDone();
    for (const b of this.scratch.splice(0)) b.destroy();
  }

  private run(name: string, code: string, uniforms: ArrayBuffer, tensors: Tensor[], groups: [number, number, number]): void {
    let pipeline = this.pipelines.get(name);
    if (!pipeline) { pipeline = this.device.createComputePipeline({ layout: "auto", compute: { module: this.device.createShaderModule({ code }), entryPoint: "main" } }); this.pipelines.set(name, pipeline); }
    const uniform = this.device.createBuffer({ size: uniforms.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(uniform, 0, uniforms); this.scratch.push(uniform);
    const bind = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }, ...tensors.map((t, i) => ({ binding: i + 1, resource: { buffer: t.buffer } }))] });
    this.encoder ??= this.device.createCommandEncoder();
    const pass = this.encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bind); pass.dispatchWorkgroups(...groups); pass.end();
  }

  /** `out` = op(a) · op(b) for every batch; the result is m × n. With transposeA, `a` is stored k × m; with transposeB, `b` is stored n × k. */
  matmul(a: Tensor, b: Tensor, out: Tensor, s: MatmulShape): void {
    const batch = s.batch ?? 1;
    this.run("matmul", MATMUL, new Uint32Array([s.m, s.k, s.n, s.transposeA ? 1 : 0, s.transposeB ? 1 : 0, s.batchedB ? 1 : 0, 0, 0]).buffer, [a, b, out], [Math.ceil(s.n / TILE), Math.ceil(s.m / TILE), batch]);
  }

  layerNorm(x: Tensor, gain: Tensor, bias: Tensor, y: Tensor, rows: number, d: number): void {
    this.run("ln", LAYER_NORM, new Uint32Array([rows, d, 0, 0]).buffer, [x, gain, bias, y], [Math.ceil(rows / ROW), 1, 1]);
  }

  /** `xhat` is scratch of the same size as `x`: the normalised input, written by the first kernel and read by the second. */
  layerNormBackward(x: Tensor, gain: Tensor, dy: Tensor, dx: Tensor, dgain: Tensor, dbias: Tensor, xhat: Tensor, rows: number, d: number): void {
    const dims = new Uint32Array([rows, d, 0, 0]).buffer;
    this.run("ln-dx", LAYER_NORM_DX, dims, [x, gain, dy, dx, xhat], [Math.ceil(rows / ROW), 1, 1]);
    this.run("ln-dparams", LAYER_NORM_DPARAMS, dims, [xhat, dy, dgain, dbias], [Math.ceil(d / ROW), 1, 1]);
  }

  /** `scores` is [batch × t × t]; `prefix` positions see each other freely, the rest are causal. prefix 0 is a plain causal mask. */
  softmax(scores: Tensor, y: Tensor, batch: number, t: number, prefix: number): void {
    this.run("softmax", SOFTMAX, new Uint32Array([batch * t, t, prefix, 0]).buffer, [scores, y], [Math.ceil((batch * t) / ROW), 1, 1]);
  }

  softmaxBackward(y: Tensor, dy: Tensor, dx: Tensor, batch: number, t: number): void {
    this.run("softmax-bwd", SOFTMAX_BACKWARD, new Uint32Array([batch * t, t, 0, 0]).buffer, [y, dy, dx], [Math.ceil((batch * t) / ROW), 1, 1]);
  }

  private spread(n: number): [number, number, number] { const groups = Math.ceil(n / 256), x = Math.min(groups, 32768); return [x, Math.ceil(groups / x), 1]; }
  add(a: Tensor, b: Tensor, out: Tensor): void { this.run("elementwise", ELEMENTWISE, new Uint32Array([out.size, 0, 0, 0]).buffer, [a, b, out], this.spread(out.size)); }
  relu(a: Tensor, out: Tensor): void { this.run("elementwise", ELEMENTWISE, new Uint32Array([out.size, 1, 0, 0]).buffer, [a, a, out], this.spread(out.size)); }
  reluBackward(input: Tensor, dy: Tensor, dx: Tensor): void { this.run("elementwise", ELEMENTWISE, new Uint32Array([dx.size, 2, 0, 0]).buffer, [input, dy, dx], this.spread(dx.size)); }

  adam(grad: Tensor, weight: Tensor, m: Tensor, v: Tensor, lr: number, step: number): void {
    const dims = new ArrayBuffer(32), u = new Uint32Array(dims), f = new Float32Array(dims);
    u[0] = weight.size; f[2] = lr; f[3] = 1 - 0.9 ** step; f[4] = 1 - 0.999 ** step;
    this.run("adam", ADAM, dims, [grad, weight, m, v], this.spread(weight.size));
  }
}

/**
 * How long one training step's worth of kernels takes for a decoder of this shape: every matmul, layer norm, softmax,
 * element-wise op and optimiser update of the forward and backward pass, in order, on tensors of the right sizes.
 * The values are noise — this measures the machine, not the model — so it can run before the rest of the engine exists.
 */
export async function timeTrainingStep(gpu: Gpu, shape: { batch: number; tokens: number; d: number; heads: number; layers: number; prefix: number; vocab: number }, steps = 5): Promise<{ msPerStep: number; flopsPerStep: number }> {
  const { batch, tokens: T, d, heads, layers, prefix, vocab } = shape, rows = batch * T, dh = d / heads, H = batch * heads;
  const noise = (n: number) => gpu.tensor(n, Float32Array.from({ length: Math.min(n, 1 << 16) }, (_, i) => Math.sin(i) * 0.1));
  const x = noise(rows * d), x2 = noise(rows * d), x3 = noise(rows * d), x4 = noise(rows * d), wide3 = noise(rows * 4 * d), att3 = noise(H * T * T), wide = noise(rows * 4 * d), wide2 = noise(rows * 4 * d), att = noise(H * T * T), att2 = noise(H * T * T), headed = noise(H * T * dh), headed2 = noise(H * T * dh);
  const w = noise(d * d), wUp = noise(d * 4 * d), gain = noise(d), bias = noise(d), dw = noise(d * d), dwUp = noise(d * 4 * d), dg = noise(d), db = noise(d), logits = noise(rows * vocab), wOut = noise(d * vocab);
  const params = [w, w, w, w, wUp, wUp], grads = [dw, dw, dw, dw, dwUp, dwUp], moments = params.map((p) => [gpu.tensor(p.size), gpu.tensor(p.size)]);
  const step = (n: number) => {
    for (let l = 0; l < layers; l++) {
      gpu.layerNorm(x, gain, bias, x2, rows, d);
      for (let k = 0; k < 3; k++) gpu.matmul(x2, w, x, { m: rows, k: d, n: d });                                 // q, k, v
      gpu.matmul(headed, headed2, att, { m: T, k: dh, n: T, transposeB: true, batch: H, batchedB: true });       // q · kᵀ
      gpu.softmax(att, att2, H, T, prefix);
      gpu.matmul(att2, headed, headed2, { m: T, k: T, n: dh, batch: H, batchedB: true });                        // · v
      gpu.matmul(x2, w, x, { m: rows, k: d, n: d }); gpu.add(x, x2, x3);                                         // out projection, residual
      gpu.layerNorm(x, gain, bias, x2, rows, d);
      gpu.matmul(x2, wUp, wide, { m: rows, k: d, n: 4 * d }); gpu.relu(wide, wide2);
      gpu.matmul(wide2, wUp, x2, { m: rows, k: 4 * d, n: d, transposeB: true }); gpu.add(x, x2, x3);
    }
    gpu.matmul(x, wOut, logits, { m: rows, k: d, n: vocab });
    gpu.matmul(logits, wOut, x, { m: rows, k: vocab, n: d, transposeB: true });                                  // back through the head
    for (let l = 0; l < layers; l++) {
      gpu.matmul(x, wUp, wide, { m: rows, k: d, n: 4 * d }); gpu.matmul(wide2, x, dwUp, { m: 4 * d, k: rows, n: d, transposeA: true });   // FFN down: dX, dW
      gpu.reluBackward(wide2, wide, wide3);
      gpu.matmul(wide, wUp, x2, { m: rows, k: 4 * d, n: d, transposeB: true }); gpu.matmul(x2, wide, dwUp, { m: d, k: rows, n: 4 * d, transposeA: true }); // FFN up
      gpu.layerNormBackward(x, gain, x2, x3, dg, db, x4, rows, d);
      gpu.matmul(x, w, x2, { m: rows, k: d, n: d, transposeB: true }); gpu.matmul(x2, x, dw, { m: d, k: rows, n: d, transposeA: true });   // out projection
      gpu.matmul(headed2, headed, att, { m: T, k: dh, n: T, transposeB: true, batch: H, batchedB: true });       // d(attention) = dOut · vᵀ
      gpu.matmul(att2, headed2, headed, { m: T, k: T, n: dh, transposeA: true, batch: H, batchedB: true });      // dv = attentionᵀ · dOut
      gpu.softmaxBackward(att2, att, att3, H, T);
      gpu.matmul(att, headed, headed2, { m: T, k: T, n: dh, batch: H, batchedB: true });                         // dq
      gpu.matmul(att, headed2, headed, { m: T, k: T, n: dh, transposeA: true, batch: H, batchedB: true });       // dk
      for (let k = 0; k < 3; k++) { gpu.matmul(x, w, x2, { m: rows, k: d, n: d, transposeB: true }); gpu.matmul(x2, x, dw, { m: d, k: rows, n: d, transposeA: true }); }
      gpu.layerNormBackward(x, gain, x2, x3, dg, db, x4, rows, d);
    }
    for (let l = 0; l < layers; l++) params.forEach((p, i) => gpu.adam(grads[i], p, moments[i][0], moments[i][1], 1e-3, n));
  };
  step(1); await gpu.flush();
  const started = performance.now();
  for (let n = 0; n < steps; n++) { step(n + 2); await gpu.flush(); }
  const perLayer = 2 * rows * d * d * 4 + 2 * rows * d * 4 * d * 2 + 2 * H * T * T * dh * 2;
  return { msPerStep: (performance.now() - started) / steps, flopsPerStep: 3 * (layers * perLayer + 2 * rows * d * vocab) };
}
