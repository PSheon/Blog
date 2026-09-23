/*
 * Starship, coming down. Published numbers where they exist:
 *
 *   Raptor 2, sea level:  2,256 kN, throttles 40–100 %, Isp 327 s   — en.wikipedia.org/wiki/SpaceX_Raptor
 *   Ship, dry:            about 100 t (Block 1)                      — en.wikipedia.org/wiki/SpaceX_Starship
 *   Ship:                 50.3 m long, 9 m across                    — same
 *   The landing:          at about 500 m it lights two engines, folds the rear flaps in and swings from horizontal
 *                         to vertical                                — SpaceX's own description of the flight profile
 *
 * Two things follow, and they are the article:
 *
 * 1. It falls FLAT. Broadside, a 9 × 50 m ship has seven times the drag area it has nose-first, so it settles at
 *    about 70 m/s instead of several hundred — a skydiver, not a rocket. The flaps steer it exactly like a skydiver's
 *    arms and legs: they only work because the air is moving past.
 * 2. It still cannot hover. Two Raptors at their lowest throttle push 1.8 MN; the ship at touchdown weighs about
 *    1.2 MN. So the flip and the braking have to be one manoeuvre, finished exactly at the ground.
 */
export const G = 9.81;
export const DRY = 100_000; // kg, ship without propellant
/*
 * The ship carries six engines — three sea-level Raptors and three vacuum ones — and lights two or three of the
 * sea-level three to land. (The 33 engines people remember are the BOOSTER's; this is the upper stage.) More
 * engines mean a shorter, later burn and even less chance of hovering, so the figure lets the reader pick.
 */
export const T_ONE = 2_256_000; // N, one Raptor 2 at sea level
export const THROTTLE_FLOOR = 0.4;
export const thrustOf = (engines: number) => T_ONE * engines;
/*
 * How many to light is a real decision, not a setting. At landing mass the ship weighs 1.26 MN:
 *   one Raptor at its 40 % floor   0.90 MN — less than the weight, so on one engine it CAN hold and hover
 *   two at the floor               1.80 MN — 1.4× the weight, so it can only ever slow down
 *   three at the floor             2.71 MN — 2.2×, a very short, very late burn
 * So more engines buy authority and cost gentleness, and that trade is what the autopilot has to learn.
 */
export const ISP = 327, VE = ISP * G;
export const GIMBAL = (15 * Math.PI) / 180; // Raptor gimbals about 15°
export const LENGTH = 50.3, DIAMETER = 9;
/** Touchdown counts if it is on the pad, slow, upright and not spinning. */
export const PAD = 20, V_OK = 6, TILT_OK = (10 * Math.PI) / 180, W_OK = 0.3;

export interface State {
  x: number; y: number; vx: number; vy: number;
  /** attitude, radians: 0 is engines-down, +π/2 is lying on its side (belly to the airflow) */
  a: number; w: number;
  fuel: number; t: number;
}

export interface Action {
  /** how many of the three sea-level Raptors are lit, 0–3. Lighting fewer is the only way to push gently. */
  engines?: number;
  /** 0, or 0.4…1 of whatever is lit */
  throttle: number;
  /** engine gimbal, −1…1 */
  gimbal: number;
  /** flaps: −1 pitches the nose down, +1 brings it up. Only bites while the air is moving. */
  flaps: number;
}

/** The figure starts where the real one starts its flip: falling flat, about a kilometre and a half up. */
export function start(rng: () => number): State {
  return {
    // Deliberately off to one side: the flip itself throws the ship sideways (the engines point that way while it is
    // still horizontal), so the real profile arrives offset and lets the manoeuvre carry it over the pad.
    x: -(150 + rng() * 120), y: 1_400 + rng() * 300,
    vx: (rng() - 0.5) * 8, vy: -(66 + rng() * 10),
    a: Math.PI / 2 + (rng() - 0.5) * 0.25, w: (rng() - 0.5) * 0.06,
    fuel: 28_000 + rng() * 4_000, t: 0,
  };
}

const RHO = 1.15; // kg/m³ near the ground
const SIDE = LENGTH * DIAMETER, END = Math.PI * (DIAMETER / 2) ** 2; // m², broadside and nose-on
const CD = 1.1;
/** How hard the flaps can twist the ship, per unit of dynamic pressure and deflection. */
const FLAP = 0.055;
/** Air pushes a falling ship broadside-on: the drag acts behind the middle, which is what the flaps fight. */
const WEATHERCOCK = 0.02, SPIN_DAMP = 0.02;

export const area = (a: number) => SIDE * Math.abs(Math.sin(a)) + END * Math.abs(Math.cos(a));
/** Terminal velocity at this attitude and mass: about 70 m/s lying flat, several hundred nose-first. */
export const terminal = (a: number, mass: number) => Math.sqrt((2 * mass * G) / (RHO * CD * area(a)));

export function step(s: State, u: Action, dt: number, fallback = 2): State {
  const mass = DRY + s.fuel;
  const lit = Math.max(0, Math.min(3, Math.round(u.engines ?? fallback)));
  const full = thrustOf(lit);
  const throttle = s.fuel > 0 && u.throttle > 0 && lit > 0 ? Math.min(1, Math.max(THROTTLE_FLOOR, u.throttle)) : 0;
  const thrust = throttle * full;
  const gimbal = Math.max(-1, Math.min(1, u.gimbal)) * GIMBAL;
  const dir = s.a + gimbal;
  const ax = (thrust * Math.sin(dir)) / mass;
  const ay = (thrust * Math.cos(dir)) / mass - G;

  const v2 = s.vx * s.vx + s.vy * s.vy, v = Math.sqrt(v2);
  const q = 0.5 * RHO * v2; // dynamic pressure: everything aerodynamic scales with it
  const drag = q * CD * area(s.a);
  const dragX = v > 0.01 ? (-drag * s.vx) / v / mass : 0;
  const dragY = v > 0.01 ? (-drag * s.vy) / v / mass : 0;

  const inertia = (mass * LENGTH * LENGTH) / 12;
  // Where the air is coming from, and how far the ship points away from it.
  const flight = v > 0.01 ? Math.atan2(-s.vx, -s.vy) : 0;
  const away = Math.atan2(Math.sin(s.a - flight), Math.cos(s.a - flight));
  const flaps = Math.max(-1, Math.min(1, u.flaps));
  const torque =
    -thrust * Math.sin(gimbal) * (LENGTH / 2)
    - flaps * FLAP * q * SIDE * LENGTH * 0.01
    - WEATHERCOCK * q * SIDE * LENGTH * 0.01 * Math.sin(2 * away) * 0.5
    - SPIN_DAMP * q * SIDE * LENGTH * 0.01 * s.w;

  return {
    x: s.x + s.vx * dt, y: s.y + s.vy * dt,
    vx: s.vx + (ax + dragX) * dt, vy: s.vy + (ay + dragY) * dt,
    a: s.a + s.w * dt, w: s.w + (torque / inertia) * dt,
    fuel: Math.max(0, s.fuel - (thrust / VE) * dt), t: s.t + dt,
  };
}

export type Outcome = "flying" | "landed" | "crashed" | "lost" | "dry";

export function outcome(s: State): Outcome {
  if (s.y <= 0) {
    const ok = Math.abs(s.x) < PAD && Math.hypot(s.vx, s.vy) < V_OK && Math.abs(s.a) < TILT_OK && Math.abs(s.w) < W_OK;
    return ok ? "landed" : "crashed";
  }
  if (Math.abs(s.x) > 2_500 || s.y > 4_000) return "lost";
  if (s.fuel <= 0 && s.vy < 0) return "dry";
  return "flying";
}

/** What a policy sees, scaled to about −1…1. */
export function observe(s: State): number[] {
  return [s.x / 400, s.y / 1500, s.vx / 60, s.vy / 80, Math.sin(s.a), Math.cos(s.a), s.w * 3, s.fuel / 30_000];
}

/** Fuel burn as a rate, for the gauge. */
export const massFlow = (throttle: number, engines = 2) => (throttle * thrustOf(engines)) / VE;
