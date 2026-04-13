import { isFiniteNumber } from "@carma-commons/math";
import { Quaternion, Vector3 } from "three";

export type ArcballViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const ARC_BALL_VECTOR_EPSILON = 1e-8;

const readViewportOffset = (value: number): number =>
  isFiniteNumber(value) ? value : 0;

const readViewportExtent = (value: number): number =>
  isFiniteNumber(value) && Math.abs(value) > ARC_BALL_VECTOR_EPSILON
    ? Math.abs(value)
    : 1;

const readPointerCoordinate = (value: number, fallback: number): number =>
  isFiniteNumber(value) ? value : fallback;

export const mapPointerToArcballVector = ({
  clientX,
  clientY,
  viewport,
}: {
  clientX: number;
  clientY: number;
  viewport: ArcballViewport;
}): Vector3 => {
  const left = readViewportOffset(viewport.left);
  const top = readViewportOffset(viewport.top);
  const width = readViewportExtent(viewport.width);
  const height = readViewportExtent(viewport.height);
  const pointerX = readPointerCoordinate(clientX, left + width * 0.5);
  const pointerY = readPointerCoordinate(clientY, top + height * 0.5);
  const nx = ((pointerX - left) / width) * 2 - 1;
  // Keep arcball y-up mapping to avoid inverted vertical drag behavior.
  const ny = 1 - ((pointerY - top) / height) * 2;
  const lenSq = nx * nx + ny * ny;

  if (lenSq <= 1) {
    return new Vector3(nx, ny, Math.sqrt(1 - lenSq));
  }

  const len = Math.sqrt(lenSq);
  return new Vector3(nx / len, ny / len, 0);
};

export const buildVersorRotationFromArcballVectors = ({
  startVector,
  currentVector,
  epsilon = ARC_BALL_VECTOR_EPSILON,
}: {
  startVector: Vector3;
  currentVector: Vector3;
  epsilon?: number;
}): Quaternion => {
  const from = startVector.clone();
  const to = currentVector.clone();

  if (from.lengthSq() <= epsilon || to.lengthSq() <= epsilon) {
    return new Quaternion();
  }

  from.normalize();
  to.normalize();

  return new Quaternion().setFromUnitVectors(from, to).normalize();
};

export const mapScreenVersorRotationToWorld = ({
  screenRotation,
  cameraWorldQuaternion,
}: {
  screenRotation: Quaternion;
  cameraWorldQuaternion: Quaternion;
}): Quaternion => {
  const normalizedScreenRotation = screenRotation.clone().normalize();
  const normalizedCameraQuaternion = cameraWorldQuaternion.clone().normalize();
  const inverseCameraQuaternion = normalizedCameraQuaternion.clone().invert();

  return normalizedCameraQuaternion
    .multiply(normalizedScreenRotation)
    .multiply(inverseCameraQuaternion)
    .normalize();
};

export const buildWorldVersorRotationFromArcballVectors = ({
  startVector,
  currentVector,
  cameraWorldQuaternion,
}: {
  startVector: Vector3;
  currentVector: Vector3;
  cameraWorldQuaternion: Quaternion;
}): Quaternion => {
  const screenRotation = buildVersorRotationFromArcballVectors({
    startVector,
    currentVector,
  });

  return mapScreenVersorRotationToWorld({
    screenRotation,
    cameraWorldQuaternion,
  });
};
