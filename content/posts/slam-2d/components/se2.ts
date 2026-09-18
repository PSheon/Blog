/** A pose in the plane: where the car is and which way it faces. Also used for "the motion from A to B, seen from A". */
export interface Pose {
  x: number;
  y: number;
  theta: number;
}

export const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Stand at `a`, then make the motion `b` as seen from there. */
export function compose(a: Pose, b: Pose): Pose {
  const c = Math.cos(a.theta), s = Math.sin(a.theta);
  return { x: a.x + c * b.x - s * b.y, y: a.y + s * b.x + c * b.y, theta: wrap(a.theta + b.theta) };
}

export function inverse(a: Pose): Pose {
  const c = Math.cos(a.theta), s = Math.sin(a.theta);
  return { x: -(c * a.x + s * a.y), y: -(-s * a.x + c * a.y), theta: -a.theta };
}

/** The motion that takes you from `a` to `b`, seen from `a`. */
export const between = (a: Pose, b: Pose): Pose => compose(inverse(a), b);

export function transformPoints(p: Pose, pts: Float64Array): Float64Array {
  const c = Math.cos(p.theta), s = Math.sin(p.theta), out = new Float64Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = p.x + c * pts[i] - s * pts[i + 1];
    out[i + 1] = p.y + s * pts[i] + c * pts[i + 1];
  }
  return out;
}
