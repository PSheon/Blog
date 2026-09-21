/// <reference types="@webgpu/types" />
import type { Bvh } from "./bvh";
import { cross, sub, unit } from "./cpu";
import { KERNEL, MEASURE, PRESENT, WORKGROUP } from "./kernel";
import type { Scene } from "./scene";

export interface Counters { rays: number; steps: number; overflow: number }

/** Why there is no picture. "no-webgpu": the browser has none. "no-adapter": it has, but no GPU would answer. */
export type Unavailable = "no-webgpu" | "no-adapter";

/**
 * The GPU half: buffers for one scene, the three pipelines of kernel.ts, and a canvas to show them on. Nothing here
 * decides when to draw; an instrument calls `sample()` as often as its frame budget allows and `present()` once a frame.
 */
export class Renderer {
  samples = 0;
  bounces = 16;
  /** See kernel.ts: the 2 × 2 grid of bounce limits, the node-visit heat map (and the count that maps to white), no hierarchy. */
  quad = false;
  heat = false;
  heatMax = 48;
  brute = false;
  private destroyed = false;

  private constructor(
    readonly device: GPUDevice, readonly adapterName: string, private readonly context: GPUCanvasContext, readonly width: number, readonly height: number,
    private readonly params: GPUBuffer, private readonly paramData: ArrayBuffer, private readonly accum: GPUBuffer, private readonly counters: GPUBuffer, private readonly tiles: GPUBuffer, private readonly tileCount: number,
    private readonly tracePipe: GPUComputePipeline, private readonly traceBind: GPUBindGroup, private readonly measurePipe: GPUComputePipeline, private readonly measureBind: GPUBindGroup,
    private readonly presentPipe: GPURenderPipeline, private readonly presentBind: GPUBindGroup, private readonly owned: GPUBuffer[],
  ) {}

  static async create(canvas: HTMLCanvasElement, scene: Scene, bvh: Bvh, width: number, height: number): Promise<Renderer | Unavailable> {
    if (!("gpu" in navigator)) return "no-webgpu";
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return "no-adapter";
    // A million triangles are 48 MB of triangles and 20 MB of nodes: more than the 128 MiB a binding gets by default only
    // beyond that, but ask for what the adapter has so the ceiling is the hardware's and not the default's.
    const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize } });
    const context = canvas.getContext("webgpu");
    if (!context) return "no-webgpu";
    const format = navigator.gpu.getPreferredCanvasFormat();
    canvas.width = width; canvas.height = height;
    context.configure({ device, format, alphaMode: "opaque" });

    const STORAGE = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC, owned: GPUBuffer[] = [];
    const make = (size: number, usage: number, data?: ArrayBuffer | ArrayBufferView) => { const b = device.createBuffer({ size: Math.max(16, Math.ceil(size / 4) * 4), usage }); if (data) device.queue.writeBuffer(b, 0, data as ArrayBuffer); owned.push(b); return b; };
    const materials = new Float32Array(scene.materials.length * 8);
    scene.materials.forEach((m, i) => { materials.set(m.albedo, i * 8); materials.set(m.emit, i * 8 + 4); });
    const across = Math.ceil(width / WORKGROUP), down = Math.ceil(height / WORKGROUP), tileCount = across * down;
    const nodes = make(bvh.nodes.byteLength, STORAGE, bvh.nodes), tris = make(bvh.triangles.byteLength, STORAGE, bvh.triangles), mats = make(materials.byteLength, STORAGE, materials);
    const accum = make(width * height * 16 * 2, STORAGE), counters = make(16, STORAGE), tiles = make(tileCount * 8, STORAGE);
    const paramData = new ArrayBuffer(96), params = make(96, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

    const { eye, target, fov } = scene.camera, f = unit(sub(target, eye)), right = unit(cross(f, [0, 1, 0])), up = cross(right, f), half = Math.tan((fov * Math.PI) / 360), aspect = width / height;
    new Uint32Array(paramData, 0, 4).set([width, height, 0, 16]);
    new Float32Array(paramData, 16, 16).set([...eye, 0, ...f, 0, right[0] * half * aspect, right[1] * half * aspect, right[2] * half * aspect, 0, up[0] * half, up[1] * half, up[2] * half, 0]);

    // A shader that does not compile only logs a warning, and the pipeline promise then rejects with little to say. Ask
    // each module for its messages, so a failure names the line.
    const compile = async (code: string, name: string) => {
      const shader = device.createShaderModule({ code, label: name }), problems = (await shader.getCompilationInfo()).messages.filter((m) => m.type === "error");
      if (problems.length) throw new Error(`${name}: ${problems.map((m) => `line ${m.lineNum}: ${m.message}`).join("; ")}`);
      return shader;
    };
    const entries = (buffers: GPUBuffer[]) => buffers.map((buffer, binding) => ({ binding, resource: { buffer } }));
    const [trace, measure, shader] = await Promise.all([compile(KERNEL, "path tracing kernel"), compile(MEASURE, "error measurement"), compile(PRESENT, "present")]);
    const [tracePipe, measurePipe] = await Promise.all([trace, measure].map((module) => device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } })));
    const presentPipe = await device.createRenderPipelineAsync({ layout: "auto", vertex: { module: shader, entryPoint: "vs" }, fragment: { module: shader, entryPoint: "fs", targets: [{ format }] }, primitive: { topology: "triangle-list" } });
    return new Renderer(device, adapter.info?.description || adapter.info?.architecture || adapter.info?.vendor || "GPU", context, width, height, params, paramData, accum, counters, tiles, tileCount,
      tracePipe, device.createBindGroup({ layout: tracePipe.getBindGroupLayout(0), entries: entries([nodes, tris, mats, accum, counters, params]) }),
      measurePipe, device.createBindGroup({ layout: measurePipe.getBindGroupLayout(0), entries: entries([accum, tiles, params]) }),
      presentPipe, device.createBindGroup({ layout: presentPipe.getBindGroupLayout(0), entries: entries([accum, params]) }), owned);
  }

  private writeParams(): void {
    new Uint32Array(this.paramData, 8, 2).set([this.samples, this.bounces]);
    new Uint32Array(this.paramData, 80, 4).set([this.heat ? 1 : 0, this.quad ? 1 : 0, this.brute ? 1 : 0, this.heatMax]);
    this.device.queue.writeBuffer(this.params, 0, this.paramData);
  }

  /** Forget everything accumulated: the scene, the camera or the bounce limit changed. */
  reset(): void {
    this.samples = 0;
    const e = this.device.createCommandEncoder();
    e.clearBuffer(this.accum); e.clearBuffer(this.counters);
    this.device.queue.submit([e.finish()]);
  }

  /** `count` more samples for every pixel. Each is its own submit: the sample index is a uniform. */
  sample(count = 1): void {
    for (let i = 0; i < count; i++) {
      this.writeParams();
      const e = this.device.createCommandEncoder(), pass = e.beginComputePass();
      pass.setPipeline(this.tracePipe); pass.setBindGroup(0, this.traceBind);
      pass.dispatchWorkgroups(Math.ceil(this.width / WORKGROUP), Math.ceil(this.height / WORKGROUP));
      pass.end();
      this.device.queue.submit([e.finish()]);
      this.samples++;
    }
  }

  present(): void {
    this.writeParams();
    const e = this.device.createCommandEncoder(), pass = e.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    pass.setPipeline(this.presentPipe); pass.setBindGroup(0, this.presentBind); pass.draw(3); pass.end();
    this.device.queue.submit([e.finish()]);
  }

  /** Resolves when the GPU has done everything submitted so far: how an instrument learns how long a sample takes. */
  idle(): Promise<undefined> { return this.device.queue.onSubmittedWorkDone(); }

  private async read(source: GPUBuffer, bytes: number): Promise<ArrayBuffer> {
    const staging = this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), e = this.device.createCommandEncoder();
    e.copyBufferToBuffer(source, 0, staging, 0, bytes);
    this.device.queue.submit([e.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const copy = staging.getMappedRange().slice(0);
    staging.unmap(); staging.destroy();
    return copy;
  }

  /** Rays cast, BVH nodes visited and traversal stacks that overflowed, since the last reset. (u32: wraps at 4.29 billion.) */
  async readCounters(): Promise<Counters> {
    const [rays, steps, overflow] = new Uint32Array(await this.read(this.counters, 16));
    return { rays, steps, overflow };
  }

  /**
   * The picture's error right now, with no reference image. Even and odd samples have built two pictures of their own;
   * half their difference is the error of their average. Returned relative to the picture's mean radiance: 0.1 means the
   * typical pixel is 10 % of the average brightness away from where it will settle. Needs at least two samples.
   */
  async error(): Promise<number> {
    this.writeParams();
    const e = this.device.createCommandEncoder(), pass = e.beginComputePass();
    pass.setPipeline(this.measurePipe); pass.setBindGroup(0, this.measureBind);
    pass.dispatchWorkgroups(Math.ceil(this.width / WORKGROUP), Math.ceil(this.height / WORKGROUP));
    pass.end();
    this.device.queue.submit([e.finish()]);
    const tiles = new Float32Array(await this.read(this.tiles, this.tileCount * 8));
    let squared = 0, mean = 0;
    for (let i = 0; i < tiles.length; i += 2) { squared += tiles[i]; mean += tiles[i + 1]; }
    const pixels = this.width * this.height;
    return mean > 0 ? Math.sqrt(squared / pixels) / (mean / pixels) : 0;
  }

  /** One pixel's linear radiance as accumulated so far (both buffers together), or null before any sample. */
  async readPixel(x: number, y: number): Promise<[number, number, number] | null> {
    const pixel = y * this.width + x, half = this.width * this.height;
    const [a, b] = await Promise.all([pixel, half + pixel].map(async (i) => { const staging = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), e = this.device.createCommandEncoder(); e.copyBufferToBuffer(this.accum, i * 16, staging, 0, 16); this.device.queue.submit([e.finish()]); await staging.mapAsync(GPUMapMode.READ); const v = new Float32Array(staging.getMappedRange().slice(0)); staging.unmap(); staging.destroy(); return v; }));
    const n = a[3] + b[3];
    return n ? [(a[0] + b[0]) / n, (a[1] + b[1]) / n, (a[2] + b[2]) / n] : null;
  }

  /** Both accumulation buffers as they are (rgb sums and sample counts): for tests, which compare numbers, not screenshots. */
  async readAccumulation(): Promise<Float32Array> { return new Float32Array(await this.read(this.accum, this.width * this.height * 32)); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const b of this.owned) b.destroy();
    this.device.destroy();
  }
}
