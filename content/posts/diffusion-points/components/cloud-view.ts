/** A slowly turning WebGL view of a few thousand points. The scene is z-up, like the shapes. */
export class CloudView {
  private angle = 0.6;
  private constructor(
    private readonly three: typeof import("three"),
    private readonly renderer: import("three").WebGLRenderer,
    private readonly scene: import("three").Scene,
    private readonly camera: import("three").PerspectiveCamera,
    private readonly geometry: import("three").BufferGeometry,
    private readonly positions: Float32Array,
    private readonly colors: Float32Array,
  ) {}

  static async create(canvas: HTMLCanvasElement, count: number): Promise<CloudView> {
    const three = await import("three");
    const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const scene = new three.Scene(), camera = new three.PerspectiveCamera(35, 1, 0.1, 50);
    camera.up.set(0, 0, 1);
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    const geometry = new three.BufferGeometry();
    geometry.setAttribute("position", new three.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new three.BufferAttribute(colors, 3));
    // Round, soft-edged sprites: square points look like dust on a screen.
    const dot = document.createElement("canvas");
    dot.width = dot.height = 64;
    const pen = dot.getContext("2d")!, fade = pen.createRadialGradient(32, 32, 0, 32, 32, 32);
    fade.addColorStop(0, "rgba(255,255,255,1)");
    fade.addColorStop(0.6, "rgba(255,255,255,0.9)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    pen.fillStyle = fade;
    pen.fillRect(0, 0, 64, 64);
    const material = new three.PointsMaterial({ size: 0.05, map: new three.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    scene.add(new three.Points(geometry, material));
    return new CloudView(three, renderer, scene, camera, geometry, positions, colors);
  }

  /** Show these points, coloured along the palette by height so the shape reads in 3-D. */
  set(points: ArrayLike<number>) {
    const n = Math.min(points.length, this.positions.length), c = new this.three.Color();
    // cyan → violet → pink, the site's gradient
    const stops = [new this.three.Color("#79dafa"), new this.three.Color("#b9a5ff"), new this.three.Color("#ff6e96")];
    for (let i = 0; i < n; i += 3) {
      this.positions[i] = points[i];
      this.positions[i + 1] = points[i + 1];
      this.positions[i + 2] = points[i + 2];
      const h = Math.max(0, Math.min(1, (points[i + 2] + 0.7) / 1.4)) * 2;
      c.copy(stops[Math.min(1, Math.floor(h))]).lerp(stops[Math.min(2, Math.floor(h) + 1)], h - Math.floor(h));
      this.colors[i] = c.r; this.colors[i + 1] = c.g; this.colors[i + 2] = c.b;
    }
    this.geometry.setDrawRange(0, n / 3);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  render(dt: number, spin = true) {
    const canvas = this.renderer.domElement, w = canvas.clientWidth, h = canvas.clientHeight, ratio = this.renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (spin) this.angle += dt * 0.35;
    this.camera.position.set(Math.cos(this.angle) * 3.1, Math.sin(this.angle) * 3.1, 1.1);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.renderer.dispose();
  }
}
