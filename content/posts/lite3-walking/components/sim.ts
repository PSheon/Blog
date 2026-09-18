import { ACTION_SCALE, DECIMATION, DEFAULT_POSE, JOINTS, KD, KP, Policy, SENSES, type Sense, TORQUE_LIMIT, observe } from "./policy";

const ASSETS = "/lite3";
const MESHES = ["hip", "thigh", "shank", "torso"];

export interface Knobs {
  /** Forward, sideways (m/s) and turning (rad/s) speed asked of the robot. */
  command: [number, number, number];
  kp: number;
  kd: number;
  /** A sense to zero out before the policy sees it. */
  blind: Sense | null;
}

export interface LoadTimings {
  wasmMs: number;
  assetsMs: number;
  compileMs: number;
}

/** MuJoCo (WebAssembly) stepping the Lite3 model under the published walking policy. */
export class Lite3Sim {
  readonly knobs: Knobs = { command: [0.5, 0, 0], kp: KP, kd: KD, blind: null };
  private last: Float32Array = new Float32Array(JOINTS);
  private readonly target = Float64Array.from(DEFAULT_POSE);
  private tick = 0;
  private pushSteps = 0;
  private pushForce = 0;

  private constructor(
    // The bindings' types are enormous and `any`-heavy; the handful of members used here are listed.
    private readonly mujoco: { mj_step(m: unknown, d: unknown): void; mj_forward(m: unknown, d: unknown): void; mj_resetData(m: unknown, d: unknown): void },
    private readonly model: { nbody: number; delete(): void },
    private readonly data: { qpos: Float64Array; qvel: Float64Array; ctrl: Float64Array; xpos: Float64Array; xfrc_applied: Float64Array; time: number; delete(): void },
    private readonly policy: Policy,
    readonly timings: LoadTimings,
  ) {
    this.reset();
  }

  static async load(): Promise<Lite3Sim> {
    const t0 = performance.now();
    const { default: init } = await import("@mujoco/mujoco");
    const mujoco = await init();
    const t1 = performance.now();
    const get = async (path: string) => {
      const res = await fetch(`${ASSETS}/${path}`);
      if (!res.ok) throw new Error(`lite3: ${path} → ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    };
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

  reset() {
    this.mujoco.mj_resetData(this.model, this.data);
    this.data.qpos.set([0, 0, 0.36, 1, 0, 0, 0, ...DEFAULT_POSE]);
    this.mujoco.mj_forward(this.model, this.data);
    this.last = new Float32Array(JOINTS);
    this.target.set(DEFAULT_POSE);
    this.tick = 0;
    this.pushSteps = 0;
  }

  /** Shove the torso sideways for a tenth of a second. */
  push(newtons: number) {
    this.pushForce = newtons;
    this.pushSteps = 100;
  }

  /** Advance by `steps` milliseconds of simulated time. */
  advance(steps: number) {
    const { qpos, qvel, ctrl, xfrc_applied } = this.data, { kp, kd, command, blind } = this.knobs;
    for (let s = 0; s < steps; s++, this.tick++) {
      if (this.tick % DECIMATION === 0) {
        const obs = observe(qpos, qvel, command, this.last);
        if (blind) obs.fill(0, SENSES[blind][0], SENSES[blind][1]);
        this.last = this.policy.act(obs);
        for (let i = 0; i < JOINTS; i++) this.target[i] = this.last[i] * ACTION_SCALE[i] + DEFAULT_POSE[i];
      }
      for (let i = 0; i < JOINTS; i++) {
        const torque = kp * (this.target[i] - qpos[7 + i]) - kd * qvel[6 + i];
        ctrl[i] = Math.max(-TORQUE_LIMIT, Math.min(TORQUE_LIMIT, torque));
      }
      xfrc_applied[6 + 1] = this.pushSteps-- > 0 ? this.pushForce : 0; // body 1 = torso, component 1 = y
      this.mujoco.mj_step(this.model, this.data);
    }
  }

  get time() {
    return this.data.time;
  }
  /** World positions of every body, 3 numbers each: world, torso, then hip/thigh/shank/foot per leg. */
  get bodies(): Float64Array {
    return this.data.xpos;
  }
  get fallen() {
    return this.data.qpos[2] < 0.15;
  }

  dispose() {
    this.data.delete();
    this.model.delete();
  }
}
