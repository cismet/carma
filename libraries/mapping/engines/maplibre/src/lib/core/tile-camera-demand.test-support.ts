import { Box3, OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { TILE_CAMERA_ROLE, type TileCameraView } from "./tile-camera-demand";

export const viewport = [1000, 1000] as const;

export const perspective = (id: string, role = TILE_CAMERA_ROLE.RECEIVER) => {
  const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return {
    id,
    camera,
    viewport,
    errorTargetPixels: 1,
    role,
  } satisfies TileCameraView;
};

export const orthographic = (
  id: string,
  x = 0,
  z = 10,
  role = TILE_CAMERA_ROLE.RECEIVER,
  viewportSize: readonly [number, number] = viewport
) => {
  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
  camera.position.set(x, 0, z);
  camera.lookAt(x, 0, 0);
  camera.updateMatrixWorld(true);
  return {
    id,
    camera,
    viewport: viewportSize,
    errorTargetPixels: 1,
    role,
  } satisfies TileCameraView;
};

export const box = (x: number, y = 0, z = 0, size = 1) =>
  new Box3(
    new Vector3(x - size, y - size, z - size),
    new Vector3(x + size, y + size, z + size)
  );
