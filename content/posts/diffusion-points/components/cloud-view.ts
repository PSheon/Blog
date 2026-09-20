const ORIGIN = [0, 0] as const;

/**
 * A WebGL view of a few thousand coloured points. The camera stands still; the clouds turn about their own
 * vertical axes, so several can sit side by side. z is up, like the shapes.
 */
export class CloudView {
  angle = 0.6;
  /** True when the canvas is closer to square than to a banner; callers lay several clouds out differently then. */
  narrow = false;
  private constructor(
    private readonly renderer: import("three").WebGLRenderer,
    private readonly scene: import("three").Scene,
    private readonly camera: import("three").PerspectiveCamera,
    private readonly geometry: import("three").BufferGeometry,
    private readonly positions: Float32Array,
    private readonly colors: Float32Array,
    /** Half the width and half the height of what has to stay in frame, in scene units. */
    private readonly extent: [number, number],
    private readonly narrowExtent: [number, number],
  ) {}

  static async create(canvas: HTMLCanvasElement, count: number, extent: [number, number] = [1.3, 1.2], narrowExtent = extent): Promise<CloudView> {
    const three = await import("@/lib/three");
    const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    const scene = new three.Scene(), camera = new three.PerspectiveCamera(30, 1, 0.1, 80);
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
    fade.addColorStop(0.75, "rgba(255,255,255,1)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    pen.fillStyle = fade;
    pen.fillRect(0, 0, 64, 64);
    const material = new three.PointsMaterial({ size: 0.065, map: new three.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    scene.add(new three.Points(geometry, material));
    return new CloudView(renderer, scene, camera, geometry, positions, colors, extent, narrowExtent);
  }

  /**
   * Show these points: six numbers each, position then colour (−1…1). `shift(i)` moves point i sideways and up,
   * which is how several clouds share one view; each still turns about its own axis.
   */
  set(points: ArrayLike<number>, shift: (i: number) => readonly [number, number] = () => ORIGIN) {
    const n = Math.min(points.length / 6, this.positions.length / 3), cos = Math.cos(this.angle), sin = Math.sin(this.angle);
    for (let i = 0; i < n; i++) {
      const x = points[i * 6], y = points[i * 6 + 1], [dx, dz] = shift(i);
      this.positions[i * 3] = cos * x - sin * y + dx;
      this.positions[i * 3 + 1] = sin * x + cos * y;
      this.positions[i * 3 + 2] = points[i * 6 + 2] + dz;
      // Stored colours are sRGB; three.js wants linear values in a colour attribute.
      for (let k = 0; k < 3; k++) this.colors[i * 3 + k] = Math.max(0, Math.min(1, (points[i * 6 + 3 + k] + 1) / 2)) ** 2.2;
    }
    this.geometry.setDrawRange(0, n);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  render() {
    const canvas = this.renderer.domElement, w = canvas.clientWidth, h = canvas.clientHeight, ratio = this.renderer.getPixelRatio();
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      // Far enough back that the whole extent fits, whichever of width and height is the tight one.
      this.narrow = w / h < 1.7;
      const extent = this.narrow ? this.narrowExtent : this.extent;
      const half = Math.tan((this.camera.fov * Math.PI) / 360), distance = Math.max(extent[0] / (half * this.camera.aspect), extent[1] / half);
      this.camera.position.set(0, -distance, distance * 0.22);
      this.camera.lookAt(0, 0, 0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.renderer.dispose();
  }
}
