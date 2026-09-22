/**
 * Every number the article quotes about the world lives here. Metres, radians, steps.
 * The arm's base is the origin; +x points from the base across the bench towards the camera; z is up.
 */
export const PARAMS = {
  /** Shoulder height above the bench, the two links, and how far the level gripper reaches past the wrist. */
  shoulderZ: 0.12,
  upperArm: 0.28,
  forearm: 0.26,
  gripper: 0.08,
  /** Joint limits: yaw, shoulder, elbow (negative = elbow up), wrist roll. */
  limits: { yaw: [-1.2, 1.2], shoulder: [-0.3, 1.9], elbow: [-2.7, -0.15], roll: [-Math.PI - 0.2, Math.PI + 0.2] } as const,
  /** Largest change per step: yaw, shoulder, elbow, roll. Roll is coarser, or half a turn would take 39 steps. */
  maxDelta: [0.08, 0.08, 0.08, 0.4] as const,
  /** Odd, so the middle bin is exactly "do not move". */
  bins: 33,
  home: [0, 1.15, -1.9, 0] as const,

  /** Two nests facing the base: their angle from +x and the radius of the tray's centre. Nest 0 is on the camera's left. */
  nestAngle: [-0.36, 0.36] as const,
  nestRadius: 0.37,
  /** Rails hold the board this far above the bench. */
  railZ: 0.03,
  /** Board: tangential length, radial depth, drawn thickness. */
  board: { length: 0.1, depth: 0.07, thickness: 0.004 },
  /** A dropped board is funnelled back to within this of the tray's centre (m) and of square (rad). */
  funnel: { offset: 0.015, yaw: 0.17 },
  /** Dropped further than this from the tray's centre, the board misses the tray and is lost. */
  trayReach: 0.08,

  /**
   * A grasp holds this close to the middle of the edge, this deep onto it, this level and this square. The first values
   * (10 mm, 25 mm) were finer than one pixel of the 48 × 48 view (about 12 mm on the bench): a model trained from those
   * pixels closed 10–30 mm off and held 1 board in 23. See docs/research/pcb-flip-vla/RESULTS.md.
   */
  grasp: { tangential: 0.03, biteMin: 0, biteMax: 0.04, height: 0.015, yaw: 0.21, rollSin: 0.2 },
  /** Where the expert aims its bite, measured in from the board's near edge. */
  bite: 0.012,
  /** A release places the board only this close to the tray's centre, this low and this level; otherwise it is a drop. */
  place: { offset: 0.03, height: 0.02, rollSin: 0.26 },
  /** The expert lifts to here before rolling; below the board's half length plus the rails, a roll jams. */
  liftZ: 0.1,
  hoverZ: 0.1,

  /** Chance per step that a held board slips; rolling faster makes it likelier: × (1 + rollSlip × |Δroll| / max). */
  slip: 0.01,
  rollSlip: 1,
  /** Episodes end here. One instruction in `noopShare` is already satisfied. */
  maxSteps: 80,
  noopShare: 0.2,

  /** The model's eye: position, what it looks at, vertical field of view (degrees), picture size. */
  camera: { eye: [0.86, 0, 0.56] as [number, number, number], target: [0.26, 0, 0.06] as [number, number, number], fov: 40 },
  image: 48,
  supersample: 2,
} as const;

export type Params = typeof PARAMS;
