import type { LatLngAlt } from "@carma/geo/types";
import type { Matrix4, Quaternion, Vector3 } from "@carma/math";
import type { CssPixels, Meters, Radians } from "@carma/units/types";

// Mirrors common scene-camera data such as world matrices and projection data.
// matrixWorld/matrixWorldInverse/projectionMatrix plus optional anchored-orbit
// convenience fields.
export const CAMERA_TYPE = {
  PERSPECTIVE: "PerspectiveCamera",
  ORTHOGRAPHIC: "OrthographicCamera",
} as const;

export type CameraType = (typeof CAMERA_TYPE)[keyof typeof CAMERA_TYPE];

// Canonical CARMA anchored-orbit convention:
// - right-handed local tangent ENU frame embedded into a local Y-up scene basis
// - +X = east
// - +Y = up
// - -Z = north
// - +Z = south
// - bearing rotates positively around +Y from north (-Z) toward east (+X)
// - pitch is orbit pitch from nadir to horizon:
//   0 = nadir / straight down onto the anchor
//   +PI/2 = horizon / local EN plane
// - this matches common Y-up scene conventions, including Three.js world-space usage
// - roll rotates around the camera forward axis using Three.js camera semantics
// - matrix/quaternion/basis fields follow Three.js world-space conventions directly

type CameraBasis = {
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

type CameraPose = {
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

type ObjectCentricBearingPitchRollRange = {
  bearing: Radians;
  pitch: Radians;
  roll?: Radians;
  range: Meters;
};

type ObjectCentricCameraPose = CameraPose & {
  anchor: ObjectCentricCameraAnchor;
} & ObjectCentricBearingPitchRollRange;

type CameraModel<TPose extends CameraPose = ObjectCentricCameraPose> = {
  pose: TPose;
  intrinsics?: CameraIntrinsics;
};

export type ObjectCentricCameraModel = CameraModel<ObjectCentricCameraPose>;
