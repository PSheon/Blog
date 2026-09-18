import { ACTION_SCALE, DECIMATION, DEFAULT_POSE, JOINTS, KD, KP, OBS, Policy, SENSES, type Sense, TORQUE_LIMIT, gravityInBody, observe } from "./policy";

const ASSETS = "/lite3";
const MESHES = ["hip", "thigh", "shank", "torso"];
/** cos 30°. A healthy gait never tips the torso past 9°, even when shoved or on ice; at 30° it is not coming back. */
const FALLEN_TILT = Math.cos(Math.PI / 6);
/** Body ids of the four feet, and how low one has to be to count as on the ground (m). */
const FEET = [5, 9, 13, 17], ON_GROUND = 0.03;

export interface Knobs {
  /** Forward, sideways (m/s) and turning (rad/s) speed asked of the robot. */
  command: [number, number, number];
  kp: number;
  kd: number;
  /** A sense to zero out before the policy sees it. */
  blind: Sense | null;
  /** How many policy ticks (12 ms each) old the observation is by the time the policy sees it. */
  latency: number;
  /** Uniform ± error added to everything a sensor measures (not the command, not the remembered action). */
  noise: number;
  /** Sliding friction coefficient of every geom; the MJCF ships with 1. */
  friction: number;
}

/** Fetches one file under `public/lite3`. Tests swap in a disk reader. */
export type ReadAsset = (path: string) => Promise<Uint8Array>;

const fetchAsset: ReadAsset = async (path) => {
  const res = await fetch(`${ASSETS}/${path}`);
  if (!res.ok) throw new Error(`lite3: ${path} → ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

export interface LoadTimings {
  wasmMs: number;
  assetsMs: number;
  compileMs: number;
}

/** MuJoCo (WebAssembly) stepping the Lite3 model under the published walking policy. */
export class Lite3Sim {
  readonly knobs: Knobs = { command: [0.5, 0, 0], kp: KP, kd: KD, blind: null, latency: 0, noise: 0, friction: 1 };
  private last: Float32Array = new Float32Array(JOINTS);
  private seen: Float32Array = new Float32Array(OBS);
  private queue: Float32Array[] = [];
  private seed = 1;
  private friction = 1;
  private fell: number | null = null;
  private readonly feet = new Float64Array(FEET.length * 2);
  private slipping = 0;
  private readonly target = Float64Array.from(DEFAULT_POSE);
  private tick = 0;
  private pushSteps = 0;
  private pushForce = 0;

  private constructor(
    // The bindings' types are enormous and `any`-heavy; the handful of members used here are listed.
    private readonly mujoco: { mj_step(m: unknown, d: unknown): void; mj_forward(m: unknown, d: unknown): void; mj_resetData(m: unknown, d: unknown): void },
    private readonly model: { nbody: number; ngeom: number; geom_friction: Float64Array; delete(): void },
    private readonly data: { qpos: Float64Array; qvel: Float64Array; ctrl: Float64Array; xpos: Float64Array; xquat: Float64Array; xfrc_applied: Float64Array; time: number; delete(): void },
    private readonly policy: Policy,
    readonly timings: LoadTimings,
  ) {
    this.reset();
  }

  static async load(get: ReadAsset = fetchAsset): Promise<Lite3Sim> {
    const t0 = performance.now();
    const { default: init } = await import("@mujoco/mujoco");
    const mujoco = await init();
    const t1 = performance.now();
    const [xml, weights, ...meshes] = await Promise.all([get("mjcf/Lite3.xml"), get("policy.f32"), ...MESHES.map((m) => get(`meshes/${m}.STL`))]);
    const t2 = performance.now();
    mujoco.FS.mkdirTree("/lite3/mjcf", 0o777);
    mujoco.FS.mkdirTree("/lite3/meshes", 0o777);
    mujoco.FS.writeFile("/lite3/mjcf/Lite3.xml", xml);
    MESHES.forEach((m, i) => mujoco.FS.writeFile(`/lite3/meshes/${m}.STL`, meshes[i]));
    const model = mujoco.MjModel.from_xml_path("/lite3/mjcf/Lite3.xml");
    model.opt.timestep = 0.001;
    const data = new mujoco.MjData(model);
    const t3 = performance.now();
    const policy = new Policy(weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength) as ArrayBuffer);
    return new Lite3Sim(mujoco, model, data, policy, { wasmMs: t1 - t0, assetsMs: t2 - t1, compileMs: t3 - t2 });
  }

  /** Back to the standing pose. `seed` picks the sensor-noise sequence. */
  reset(seed = 1) {
    this.mujoco.mj_resetData(this.model, this.data);
    this.data.qpos.set([0, 0, 0.36, 1, 0, 0, 0, ...DEFAULT_POSE]);
    this.mujoco.mj_forward(this.model, this.data);
    this.last = new Float32Array(JOINTS);
    this.target.set(DEFAULT_POSE);
    this.seen = new Float32Array(OBS);
    this.queue = [];
    this.seed = seed;
    this.fell = null;
    this.slipping = 0;
    this.tick = 0;
    this.pushSteps = 0;
  }

  /** Uniform in [−0.5, 0.5); the same generator as the offline sweep, so its numbers can be reproduced. */
  private random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 2 ** 32 - 0.5;
  }

  /** Shove the torso sideways for a tenth of a second. */
  push(newtons: number) {
    this.pushForce = newtons;
    this.pushSteps = 100;
  }

  /** Advance by `steps` milliseconds of simulated time. */
  advance(steps: number) {
    const { qpos, qvel, ctrl, xfrc_applied } = this.data, { kp, kd, command, blind, latency, noise, friction } = this.knobs;
    if (friction !== this.friction) {
      const f = this.model.geom_friction;
      for (let g = 0; g < this.model.ngeom; g++) f[g * 3] = friction;
      this.friction = friction;
    }
    for (let s = 0; s < steps; s++, this.tick++) {
      if (this.tick % DECIMATION === 0) {
        if (this.fell === null && (gravityInBody(qpos[3], qpos[4], qpos[5], qpos[6])[2] > -FALLEN_TILT || qpos[2] < 0.15)) this.fell = this.data.time;
        const obs = observe(qpos, qvel, command, this.last);
        if (noise) {
          for (let i = 0; i < OBS; i++) {
            if (i < SENSES.command[0] || (i >= SENSES.jointPos[0] && i < SENSES.lastAction[0])) obs[i] += this.random() * 2 * noise;
          }
        }
        if (blind) obs.fill(0, SENSES[blind][0], SENSES[blind][1]);
        this.queue.push(obs);
        while (this.queue.length > latency + 1) this.queue.shift();
        this.seen = this.queue[0];
        this.last = this.policy.act(this.seen);
        for (let i = 0; i < JOINTS; i++) this.target[i] = this.last[i] * ACTION_SCALE[i] + DEFAULT_POSE[i];
      }
      for (let i = 0; i < JOINTS; i++) {
        const torque = kp * (this.target[i] - qpos[7 + i]) - kd * qvel[6 + i];
        ctrl[i] = Math.max(-TORQUE_LIMIT, Math.min(TORQUE_LIMIT, torque));
      }
      xfrc_applied[6 + 1] = this.pushSteps-- > 0 ? this.pushForce : 0; // body 1 = torso, component 1 = y
      this.mujoco.mj_step(this.model, this.data);
      this.trackFeet();
    }
  }

  /** Horizontal speed of the feet that are on the ground, averaged over about a second: how much it is slipping. */
  private trackFeet() {
    const xpos = this.data.xpos;
    FEET.forEach((body, f) => {
      const x = xpos[body * 3], y = xpos[body * 3 + 1];
      if (xpos[body * 3 + 2] < ON_GROUND && this.tick > 0) {
        const speed = Math.hypot(x - this.feet[f * 2], y - this.feet[f * 2 + 1]) / 0.001;
        this.slipping += (speed - this.slipping) / 2000; // four feet, half of them down: ~1 s
      }
      this.feet[f * 2] = x;
      this.feet[f * 2 + 1] = y;
    });
  }

  get footSlip() {
    return this.slipping;
  }
  /** How far the torso is from level (rad). */
  get tilt() {
    const [w, x, y, z] = this.data.qpos.subarray(3, 7);
    return Math.acos(Math.max(-1, Math.min(1, -gravityInBody(w, x, y, z)[2])));
  }

  get time() {
    return this.data.time;
  }
  /** World positions of every body, 3 numbers each: world, torso, then hip/thigh/shank/foot per leg. */
  get bodies(): Float64Array {
    return this.data.xpos;
  }
  /** World orientations of every body as (w, x, y, z), in the same order as `bodies`. */
  get orientations(): Float64Array {
    return this.data.xquat;
  }
  /** Simulated time at which it went down (tipped past 30° or belly on the floor), or null while it is up. */
  get fellAt() {
    return this.fell;
  }
  get fallen() {
    return this.fell !== null;
  }
  /** The 45 numbers the policy was last shown, after noise, blinding and latency. */
  get observation(): Float32Array {
    return this.seen;
  }
  /** The policy's last 12 outputs. */
  get action(): Float32Array {
    return this.last;
  }
  /** Joint angles the PD controller is pulling towards (rad). */
  get targets(): Float64Array {
    return this.target;
  }
  get jointAngles(): Float64Array {
    return this.data.qpos.subarray(7, 7 + JOINTS);
  }
  /** Torque sent to each motor on the last step (N·m). */
  get torques(): Float64Array {
    return this.data.ctrl;
  }
  /** Torso position (m) and velocity (m/s) in the world frame. */
  get position(): Float64Array {
    return this.data.qpos.subarray(0, 3);
  }
  get velocity(): Float64Array {
    return this.data.qvel.subarray(0, 3);
  }
  /** Heading (rad, anticlockwise from +x) and how fast it is changing (rad/s, body frame). */
  get yaw() {
    const [w, x, y, z] = this.data.qpos.subarray(3, 7);
    return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  }
  get yawRate() {
    return this.data.qvel[5];
  }

  dispose() {
    this.data.delete();
    this.model.delete();
  }
}
