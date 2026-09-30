import type {
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Vector3,
} from "three";

export type CameraRigView = Readonly<{
  id: string;
  camera: PerspectiveCamera | OrthographicCamera;
  clipPlanes: readonly Plane[];
  distance: number;
  stripWidthMeters?: number;
  imagePlaneVerticalOffset?: number;
}>;

export const finitePositive = (value: number) =>
  Number.isFinite(value) && value > 0;

export const assertFiniteVector = (value: Vector3, name: string) => {
  if (![value.x, value.y, value.z].every(Number.isFinite))
    throw new Error(`${name} must be finite`);
};
