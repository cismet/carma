import type { LatLngAlt } from "@carma/geo/types";
import type { Matrix4, Quaternion, Vector3 } from "@carma/math";
import type { CssPixels, Meters, Radians } from "@carma/units/types";

// Mirrors the camera data that engines like Three.js carry internally:
// matrixWorld/matrixWorldInverse/projectionMatrix plus optional object-centric
// convenience fields for anchored orbit views.
export const CAMERA_TYPE = {
  PERSPECTIVE: "PerspectiveCamera",
  ORTHOGRAPHIC: "OrthographicCamera",
} as const;

export type CameraType = (typeof CAMERA_TYPE)[keyof typeof CAMERA_TYPE];

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
  },
  orbit: {
    bearing: "positive around +Y from north (-Z) toward east (+X)",
    pitch: "0=nadir, +PI/2=horizon",
    roll: "positive around local camera forward axis",
  },
} as const;

export type CameraBasis = {
  direction: Vector3;
  up: Vector3;
  right?: Vector3;
};

export type ObjectCentricCameraAnchor = LatLngAlt.rad & {
  altitude: NonNullable<LatLngAlt.rad["altitude"]>;
};

export type CameraViewOffset = {
  fullWidth: CssPixels;
  fullHeight: CssPixels;
  offsetX: CssPixels;
  offsetY: CssPixels;
  width: CssPixels;
  height: CssPixels;
};

export type CameraFrustum = {
  near?: Meters;
  far?: Meters;
} & Record<string, unknown>;

export type CameraIntrinsics = {
  type?: CameraType;
  projectionMatrix?: Matrix4;
  fov?: Radians;
  fovHorizontal?: Radians;
  frustum?: CameraFrustum;
  viewOffset?: CameraViewOffset;
};

export type CameraPose = {
  // These world-space transform/orientation fields are the authoritative camera
  // orientation representation when available. They preserve the full
  // orthonormal basis / quaternion without introducing Euler-angle ambiguity
  // near singular regions such as nadir / gimbal-lock-like alignments.
  matrixWorld?: Matrix4;
  matrixWorldInverse?: Matrix4;
  basisMatrix?: Matrix4;
  position?: Vector3;
  direction?: Vector3;
  up?: Vector3;
  right?: Vector3;
  quaternion?: Quaternion;
  basis?: CameraBasis;
};

export type ObjectCentricBearingPitchRollRange = {
  bearing: Radians;
  pitch: Radians;
  roll?: Radians;
  range: Meters;
};

export type ObjectCentricCameraPose = CameraPose & {
  anchor: ObjectCentricCameraAnchor;
} & ObjectCentricBearingPitchRollRange;

export type CameraModel<TPose extends CameraPose = ObjectCentricCameraPose> = {
  pose: TPose;
  intrinsics?: CameraIntrinsics;
};

export type ObjectCentricCameraModel = CameraModel<ObjectCentricCameraPose>;
