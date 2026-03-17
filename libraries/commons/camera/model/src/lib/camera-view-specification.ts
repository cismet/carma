import type { LatLngAlt } from "@carma/geo/types";
import type { Mat4, Quat, Vec2, Vec3 } from "@carma/math";
import type {
  CssPixels,
  DevicePixels,
  Meters,
  Radians,
} from "@carma/units/types";

// Mirrors the camera data that engines like Three.js carry internally:
// matrixWorld/matrixWorldInverse/projectionMatrix plus optional object-centric
// convenience fields for anchored orbit views.
export type CameraType = "PerspectiveCamera" | "OrthographicCamera";

// Canonical CARMA object-centric convention:
// - right-handed local tangent ENU frame embedded into a Three-compatible scene basis
// - +X = east
// - +Y = up
// - -Z = north
// - +Z = south
// - bearing rotates positively around +Y from north (-Z) toward east (+X)
// - pitch is orbit pitch from nadir to horizon:
//   0 = nadir / straight down onto the anchor
//   +PI/2 = horizon / local EN plane
// - roll rotates around the camera forward axis using Three.js camera semantics
// - matrix/quaternion/basis fields follow Three.js world-space conventions directly
export const OBJECT_CENTRIC_CAMERA_SPACE = {
  handedness: "right-handed",
  tangentFrame: "enu",
  axes: {
    east: "+X",
    up: "+Y",
    north: "-Z",
    south: "+Z",
  },
  orbit: {
    bearing: "positive around +Y from north (-Z) toward east (+X)",
    pitch: "0=nadir, +PI/2=horizon",
    roll: "positive around local camera forward axis",
  },
} as const;

export type CameraBasis = {
  direction: Vec3;
  up: Vec3;
  right?: Vec3;
};

export type ObjectCentricCameraAnchor = LatLngAlt.rad & {
  altitude: NonNullable<LatLngAlt.rad["altitude"]>;
};

export type CameraImage = {
  width: CssPixels;
  height: CssPixels;
  deviceWidth?: DevicePixels;
  deviceHeight?: DevicePixels;
};

export type CameraView = {
  enabled?: boolean;
  fullWidth: CssPixels;
  fullHeight: CssPixels;
  offsetX: CssPixels;
  offsetY: CssPixels;
  width: CssPixels;
  height: CssPixels;
};

export type CameraIntrinsics = {
  type?: CameraType;
  projectionMatrix?: Mat4;
  projectionMatrixInverse?: Mat4;
  fov?: Radians;
  fovHorizontal?: Radians;
  aspect?: number;
  zoom?: number;
  near?: Meters;
  far?: Meters;
  focus?: number;
  filmGauge?: number;
  filmOffset?: number;
  focalLength?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  principalPoint?: Vec2;
  sensorSize?: Vec2;
  image?: CameraImage;
  view?: CameraView;
};

export type CameraPose = {
  // These world-space transform/orientation fields are the authoritative camera
  // orientation representation when available. They preserve the full
  // orthonormal basis / quaternion without introducing Euler-angle ambiguity
  // near singular regions such as nadir / gimbal-lock-like alignments.
  matrixWorld?: Mat4;
  matrixWorldInverse?: Mat4;
  basisMatrix?: Mat4;
  position?: Vec3;
  direction?: Vec3;
  up?: Vec3;
  right?: Vec3;
  quaternion?: Quat;
  basis?: CameraBasis;
};

export type ObjectCentricBearingPitchRange = {
  bearing: Radians;
  pitch: Radians;
  range: Meters;
};

export type ObjectCentricCameraPose = CameraPose & {
  anchor: ObjectCentricCameraAnchor;
} & ObjectCentricBearingPitchRange & {
  // Roll plus bearing/pitch/range remain useful as object-centric convenience
  // parameters for orbit-style UIs and cross-engine projections, but they are
  // derived / informational rather than the most stable orientation carrier.
  // At exact nadir the viewing azimuth becomes underdefined, so consumers that
  // need a stable camera attitude should prefer the basis/quaternion/matrices
  // inherited from CameraPose above.
  roll?: Radians;
};

export type CameraModel<
  TPose extends CameraPose = ObjectCentricCameraPose,
> = {
  pose: TPose;
  intrinsics?: CameraIntrinsics;
};

export type ObjectCentricCameraModel = CameraModel<ObjectCentricCameraPose>;
