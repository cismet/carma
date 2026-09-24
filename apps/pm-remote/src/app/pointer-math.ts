/**
 * From the phone's attitude to a spot on the model.
 *
 * The model lies flat, so the phone is treated as a laser: the ray leaving the
 * phone's top edge is cut with the table plane. The phone's height above the
 * table is the unit of length; it is unknown, and the calibration turns table
 * units into model widths (`scale`). The world frame is the one the sensors
 * report, z up; its heading is arbitrary (iOS starts it wherever the phone
 * faced), which is why the model's axes come from the calibration and not
 * from the compass.
 */

import { POINTER_REACH } from "@carma-mapping/show-remote";

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
export const axesFromQuaternion = ([x, y, z, w]: readonly number[]): DeviceAxes => ({
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

const dot2 = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];

/** counter-clockwise seen from above */
const rotate2 = ([x, y]: Vec2, degrees: number): Vec2 => {
  const s = Math.sin(degrees * RAD);
  const c = Math.cos(degrees * RAD);
  return [x * c - y * s, x * s + y * c];
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

/** a ray at or above the horizon is treated as this steep, so the spot stays finite */
const MIN_DOWN = Math.sin(5 * RAD);

/** where the top-edge ray meets the table, relative to the point below the phone */
export const hitOnTable = ({ top }: DeviceAxes): Vec2 => {
  const down = Math.max(-top[2], MIN_DOWN);
  return [top[0] / down, top[1] / down];
};

/** which edge of the projected image the presenter stands at */
export type PresenterSide = "bottom" | "left" | "top" | "right";

export const PRESENTER_SIDES: readonly PresenterSide[] = [
  "bottom",
  "left",
  "top",
  "right",
];

/**
 * From the presenter's facing to the model's east (the image's right),
 * counter-clockwise in degrees. Standing at the bottom edge the presenter
 * faces north, and east is a quarter turn clockwise from there.
 */
export const SIDE_TURN: Record<PresenterSide, number> = {
  bottom: -90,
  left: 0,
  top: 90,
  right: 180,
};

export type Calibration = {
  /** the table hit of the model's middle */
  center: Vec2;
  /** the facing when the middle was taken */
  forward: Vec2;
  /** the model's east in world coordinates, unit length */
  east: Vec2;
  /** model widths per table unit */
  scale: number;
};

/** aimed at the middle of the model: that point becomes the origin */
export const calibrateCenter = (
  axes: DeviceAxes,
  turn: number,
  scale: number
): Calibration => {
  const forward = forwardOf(axes);
  return {
    center: hitOnTable(axes),
    forward,
    east: rotate2(forward, turn),
    scale,
  };
};

/**
 * Aimed at the middle of the right edge, after the middle: the distance
 * between the two gives the scale, their direction the model's east. Null
 * when the two are too close together to tell anything.
 */
export const calibrateEdge = (
  calibration: Calibration,
  axes: DeviceAxes
): { calibration: Calibration; turn: number } | null => {
  const hit = hitOnTable(axes);
  const span: Vec2 = [
    hit[0] - calibration.center[0],
    hit[1] - calibration.center[1],
  ];
  const east = normalize2(span);
  if (!east || length2(span) < 0.02) {
    return null;
  }
  return {
    calibration: { ...calibration, east, scale: 0.5 / length2(span) },
    turn: angle2(east) - angle2(calibration.forward),
  };
};

/** the same middle with another side or scale, for a changed setting */
export const recalibrate = (
  calibration: Calibration,
  turn: number,
  scale: number
): Calibration => ({
  ...calibration,
  east: rotate2(calibration.forward, turn),
  scale,
});

const clamp = (value: number, limit: number): number =>
  Math.min(limit, Math.max(-limit, value));

/** the spot as an offset from the model's middle, in model widths, y south */
export const toModel = (calibration: Calibration, axes: DeviceAxes): Vec2 => {
  const hit = hitOnTable(axes);
  const d: Vec2 = [
    hit[0] - calibration.center[0],
    hit[1] - calibration.center[1],
  ];
  const north = rotate2(calibration.east, 90);
  return [
    clamp(dot2(d, calibration.east) * calibration.scale, POINTER_REACH),
    clamp(-dot2(d, north) * calibration.scale, POINTER_REACH),
  ];
};

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
