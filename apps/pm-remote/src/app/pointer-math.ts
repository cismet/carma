/**
 * From the phone's attitude to a spot on the model.
 *
 * The phone works as an air mouse: only the change of its aim counts, so the
 * sensors' arbitrary heading (iOS starts it wherever the phone faced), the
 * table and the presenter's position do not matter.
 */

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];

/** the two device axes that matter, in world coordinates */
export type DeviceAxes = {
  /** out of the phone's top edge: where it points */
  top: Vec3;
  /** out of the phone's back, away from the screen */
  back: Vec3;
};

const RAD = Math.PI / 180;

/**
 * `deviceorientation` angles in degrees to device axes. The spec composes the
 * device-to-world rotation as Rz(alpha) Rx(beta) Ry(gamma); the top axis is
 * its second column, the back axis minus its third. Unlike the angles
 * themselves, the axes stay smooth when the phone points straight down.
 */
export const axesFromEuler = (
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number
): DeviceAxes => {
  const sa = Math.sin(alphaDeg * RAD);
  const ca = Math.cos(alphaDeg * RAD);
  const sb = Math.sin(betaDeg * RAD);
  const cb = Math.cos(betaDeg * RAD);
  const sg = Math.sin(gammaDeg * RAD);
  const cg = Math.cos(gammaDeg * RAD);
  return {
    top: [-sa * cb, ca * cb, sb],
    back: [-(ca * sg + sa * sb * cg), -(sa * sg - ca * sb * cg), -(cb * cg)],
  };
};

/** an orientation sensor's quaternion `[x, y, z, w]` (device to world) to device axes */
export const axesFromQuaternion = ([
  x,
  y,
  z,
  w,
]: readonly number[]): DeviceAxes => ({
  top: [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
  back: [
    -2 * (x * z + y * w),
    -2 * (y * z - x * w),
    -(1 - 2 * (x * x + y * y)),
  ],
});

const length2 = ([x, y]: Vec2): number => Math.hypot(x, y);

const normalize2 = (v: Vec2): Vec2 | null => {
  const length = length2(v);
  return length > 1e-6 ? [v[0] / length, v[1] / length] : null;
};

const angle2 = ([x, y]: Vec2): number => Math.atan2(y, x) / RAD;

/**
 * The direction the presenter faces. Held like a remote, the top edge points
 * ahead. Tipped further down the top edge loses its heading, but the screen
 * turns to face ahead instead, so the screen normal (minus the back) takes
 * over the steeper the phone points. Weighting it by the steepness keeps a
 * twisted wrist at shallow angles from skewing the facing.
 */
export const forwardOf = ({ top, back }: DeviceAxes): Vec2 => {
  const steep = top[2] * top[2];
  return (
    normalize2([top[0] - steep * back[0], top[1] - steep * back[1]]) ??
    normalize2([top[0], top[1]]) ?? [0, 1]
  );
};

const clamp = (value: number, limit: number): number =>
  Math.min(limit, Math.max(-limit, value));

/** an angle difference folded into -180 … 180 */
const wrapDegrees = (degrees: number): number =>
  ((((degrees + 180) % 360) + 360) % 360) - 180;

/** where the phone points, as heading and elevation in degrees */
export type Aim = { yaw: number; pitch: number };

/**
 * The heading follows the facing (see `forwardOf`), so it turns with the
 * wrist whatever the grip. The elevation is the top edge's angle above the
 * facing, which stays continuous when the phone tips past straight down.
 */
export const aimOf = (axes: DeviceAxes): Aim => {
  const forward = forwardOf(axes);
  const { top } = axes;
  return {
    yaw: angle2(forward),
    pitch: Math.atan2(top[2], top[0] * forward[0] + top[1] * forward[1]) / RAD,
  };
};

/** half the image in model widths; the model is close to 16:9 */
export const WRIST_LIMIT: Vec2 = [0.5, 0.5 * (9 / 16)];

/**
 * The phone as an air mouse: turning the wrist left or right moves the spot
 * left or right, tilting it up or down moves it up or down, by `gain` model
 * widths per degree. Only the change counts, so neither the table, the
 * presenter's side nor the sensors' heading matter. At the image's edge the
 * spot stops, and turning back moves it back at once, like a mouse.
 */
export class WristPointer {
  private last: Aim | null = null;
  position: Vec2 = [0, 0];

  /** the next reading moves the spot from where it is now */
  anchor(axes: DeviceAxes | null): void {
    this.last = axes ? aimOf(axes) : null;
  }

  center(axes: DeviceAxes | null): void {
    this.position = [0, 0];
    this.anchor(axes);
  }

  update(axes: DeviceAxes, gain: number): Vec2 {
    const aim = aimOf(axes);
    const last = this.last;
    this.last = aim;
    if (!last) {
      return this.position;
    }
    const [x, y] = this.position;
    this.position = [
      clamp(x - wrapDegrees(aim.yaw - last.yaw) * gain, WRIST_LIMIT[0]),
      clamp(y - wrapDegrees(aim.pitch - last.pitch) * gain, WRIST_LIMIT[1]),
    ];
    return this.position;
  }
}

/**
 * One Euro filter (Casiez, Roussel, Vogel 2012): heavy smoothing while the
 * hand is almost still, which is where tremor shows, and little while it
 * moves, which is where lag shows.
 */
export class OneEuro2 {
  private x: Vec2 | null = null;
  private dx: Vec2 = [0, 0];
  private t = 0;

  constructor(
    private readonly minCutoffHz = 1.2,
    private readonly beta = 6,
    private readonly derivativeCutoffHz = 1
  ) {}

  reset(): void {
    this.x = null;
    this.dx = [0, 0];
  }

  /** the filtered position and its velocity per second */
  filter(value: Vec2, timeMs: number): { value: Vec2; velocity: Vec2 } {
    if (!this.x) {
      this.x = value;
      this.dx = [0, 0];
      this.t = timeMs;
      return { value, velocity: this.dx };
    }
    const dt = Math.max((timeMs - this.t) / 1000, 1e-3);
    this.t = timeMs;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const previous = this.x;
    const aD = alpha(this.derivativeCutoffHz);
    this.dx = [
      this.dx[0] + aD * ((value[0] - previous[0]) / dt - this.dx[0]),
      this.dx[1] + aD * ((value[1] - previous[1]) / dt - this.dx[1]),
    ];
    const a = alpha(this.minCutoffHz + this.beta * length2(this.dx));
    this.x = [
      previous[0] + a * (value[0] - previous[0]),
      previous[1] + a * (value[1] - previous[1]),
    ];
    return { value: this.x, velocity: this.dx };
  }
}
