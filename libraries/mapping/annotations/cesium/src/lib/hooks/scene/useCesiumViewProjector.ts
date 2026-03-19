import { useCallback, useMemo } from "react";

import {
  Cartesian3,
  Matrix4,
  SceneTransforms,
  defined,
  type Scene,
  type Cartesian3Json,
  type Matrix4ConstructorArgs,
} from "@carma/cesium";
import type { CssPixelPosition } from "@carma/units/types";

const WORLD_POINT_SCRATCH = new Cartesian3();
const VIEW_PROJECTION_SCRATCH = new Matrix4();
const MATRIX4_ARRAY_SCRATCH = new Array<number>(16).fill(
  0
) as Matrix4ConstructorArgs;

export const useCesiumViewProjector = (scene: Scene | null) => {
  const getViewState = useCallback(() => {
    if (!scene || scene.isDestroyed()) return null;

    const frameNumber = (
      scene as unknown as { frameState?: { frameNumber?: number } }
    ).frameState?.frameNumber;

    return {
      width: Math.max(1, scene.canvas.clientWidth || scene.canvas.width || 1),
      height: Math.max(
        1,
        scene.canvas.clientHeight || scene.canvas.height || 1
      ),
      cameraPitch: scene.camera.pitch,
      frameNumber: typeof frameNumber === "number" ? frameNumber : null,
    };
  }, [scene]);

  const getViewProjectionMatrix = useCallback(() => {
    if (!scene || scene.isDestroyed()) return null;
    const viewProjectionMatrix = Matrix4.multiply(
      scene.camera.frustum.projectionMatrix,
      scene.camera.viewMatrix,
      VIEW_PROJECTION_SCRATCH
    );
    Matrix4.toArray(viewProjectionMatrix, MATRIX4_ARRAY_SCRATCH);
    return MATRIX4_ARRAY_SCRATCH;
  }, [scene]);

  const projectWorldToScreen = useCallback(
    (point: Cartesian3Json) => {
      if (!scene || scene.isDestroyed()) return null;
      const worldPoint = Cartesian3.fromElements(
        point.x,
        point.y,
        point.z,
        WORLD_POINT_SCRATCH
      );

      const screen = SceneTransforms.worldToWindowCoordinates(
        scene,
        worldPoint
      );
      if (!defined(screen)) return null;
      if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) {
        return null;
      }

      return {
        x: screen.x,
        y: screen.y,
      } as CssPixelPosition;
    },
    [scene]
  );

  return useMemo(
    () => ({
      getViewState,
      getViewProjectionMatrix,
      projectWorldToScreen,
    }),
    [getViewState, getViewProjectionMatrix, projectWorldToScreen]
  );
};
