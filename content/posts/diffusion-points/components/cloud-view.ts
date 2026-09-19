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
    const material = new three.PointsMaterial({ size: 0.045, map: new three.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    scene.add(new three.Points(geometry, material));
    return new CloudView(three, renderer, scene, camera, geometry, positions, colors);
  }

  /** Show these points: `stride` numbers each, position first, then (if there are six) the colour as −1…1. */
  set(points: ArrayLike<number>, stride = 6) {
    const n = Math.min(points.length / stride, this.positions.length / 3);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        this.positions[i * 3 + k] = points[i * stride + k];
        // Stored colours are sRGB; three.js expects linear values in a colour attribute.
        const c = Math.max(0, Math.min(1, (points[i * stride + 3 + k] + 1) / 2));
        this.colors[i * 3 + k] = c ** 2.2;
      }
    }
    this.geometry.setDrawRange(0, n);
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
    this.camera.position.set(Math.cos(this.angle) * 4, Math.sin(this.angle) * 4, 1.5);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.renderer.dispose();
  }
}
