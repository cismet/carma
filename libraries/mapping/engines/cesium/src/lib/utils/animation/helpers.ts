import {
  Cartesian3,
  HeadingPitchRoll,
  Math as CesiumMath,
  Matrix4,
  Quaternion,
  Viewer,
} from "cesium";
import type { Scene } from "cesium";

const PITCH_MIN = -Math.PI / 2 + 0.0001;
const PITCH_MAX = 0;

export function shortestAngleLerp(
  start: number,
  end: number,
  t: number
): number {
  const delta = CesiumMath.negativePiToPi(end - start);
  return start + delta * t;
}

export const quatNeedsUpdate = (a: Quaternion, b: Quaternion): boolean => {
  const dot = Quaternion.dot(a, b);
  return 1 - Math.abs(dot) > 1e-6;
};

export const posNeedsUpdate = (a: Cartesian3, b: Cartesian3): boolean =>
  !Cartesian3.equalsEpsilon(a, b, CesiumMath.EPSILON7, CesiumMath.EPSILON7);

export const fovNeedsUpdate = (
  currentFov: number | undefined,
  targetFov: number | undefined
): boolean =>
  typeof currentFov === "number" &&
  typeof targetFov === "number" &&
  Math.abs(currentFov - targetFov) > CesiumMath.EPSILON7;

export const lerpCartesian3 = (
  a: Cartesian3,
  b: Cartesian3,
  t: number
): Cartesian3 =>
  new Cartesian3(
    CesiumMath.lerp(a.x, b.x, t),
    CesiumMath.lerp(a.y, b.y, t),
    CesiumMath.lerp(a.z, b.z, t)
  );

export const setCameraViewFromQuat = (
  viewer: Viewer,
  destination: Cartesian3,
  quat: Quaternion
) => {
  const orientation = HeadingPitchRoll.fromQuaternion(quat);
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.camera.setView({
    destination,
    orientation,
  });
};

export function shortestPitchClamped(
  startPitch: number,
  targetPitch: number,
  t: number
): number {
  const pitchTargetAdjusted =
    startPitch + CesiumMath.negativePiToPi(targetPitch - startPitch);
  const rawPitch = CesiumMath.lerp(startPitch, pitchTargetAdjusted, t);
  return CesiumMath.clamp(rawPitch, PITCH_MIN, PITCH_MAX);
}

export function setupPointerCancel(
  viewer: Viewer,
  cancelable: boolean,
  cancel: () => void
): () => void {
  const onPointer = () => {
    if (cancelable) cancel();
  };
  viewer.canvas.addEventListener("pointerdown", onPointer);
  return () => viewer.canvas.removeEventListener("pointerdown", onPointer);
}

// undocumented cesium function to get if animation is running
// https://community.cesium.com/t/cancel-a-camera-flyto-intentionally/1371/6
export const cesiumSceneHasTweens = (viewer: Viewer) => {
  const scene = viewer.scene as Scene & { tweens: [] };
  return scene && scene.tweens && scene.tweens.length > 0;
};
