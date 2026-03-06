import { useCallback, useEffect, useRef } from "react";
import {
  Cartesian3,
  CesiumMath,
  Matrix4,
  VERSION as CESIUM_RUNTIME_VERSION,
  type Scene,
} from "@carma/cesium";
import { useCesiumContext } from "@carma-mapping/engines/cesium";

type FrustumLike = {
  clone?: () => unknown;
  equalsEpsilon?: (other: unknown, epsilon: number) => boolean;
};

type PrivateCameraRaw = {
  _viewMatrix: Matrix4;
  _position: Cartesian3;
  _direction: Cartesian3;
  _up: Cartesian3;
  _right: Cartesian3;
  _transform: Matrix4;
  frustum: FrustumLike;
  moveStart: { addEventListener: (cb: () => void) => () => void };
  moveEnd: { addEventListener: (cb: () => void) => () => void };
  changed: { addEventListener: (cb: () => void) => () => void };
};

type CameraSnapshot = {
  viewMatrix: Matrix4;
  frustumClone: unknown;
  drawingBufferWidth: number;
  drawingBufferHeight: number;
};

const CAMERA_CHANGE_EPSILON = CesiumMath.EPSILON15;
const EXPECTED_CESIUM_RUNTIME_VERSION = "1.134.1";

let hasValidatedPrivateCesiumContracts = false;

const asPrivateCameraRaw = (scene: Scene) =>
  scene.camera as unknown as Partial<PrivateCameraRaw>;

const assertPrivateCesiumContracts = (scene: Scene) => {
  if (hasValidatedPrivateCesiumContracts) return;

  if (CESIUM_RUNTIME_VERSION !== EXPECTED_CESIUM_RUNTIME_VERSION) {
    throw new Error(
      `[FATAL][MEASUREMENTS][CESIUM_PRIVATE_API] Unsupported Cesium runtime version.\nExpected: ${EXPECTED_CESIUM_RUNTIME_VERSION}\nDetected: ${String(
        CESIUM_RUNTIME_VERSION
      )}\nThis hook relies on undocumented camera internals and must be reviewed for this version.`
    );
  }

  const camera = asPrivateCameraRaw(scene);
  const hasCoreInternals =
    Boolean(camera._viewMatrix) &&
    Boolean(camera._position) &&
    Boolean(camera._direction) &&
    Boolean(camera._up) &&
    Boolean(camera._right) &&
    Boolean(camera._transform);
  const hasFrustumInternals =
    typeof camera.frustum?.clone === "function" &&
    typeof camera.frustum?.equalsEpsilon === "function";
  const hasCameraEvents =
    typeof camera.moveStart?.addEventListener === "function" &&
    typeof camera.moveEnd?.addEventListener === "function" &&
    typeof camera.changed?.addEventListener === "function";
  const hasSceneViewInternals =
    typeof (
      scene as unknown as {
        _view?: { checkForCameraUpdates?: unknown };
      }
    )._view?.checkForCameraUpdates === "function";

  if (
    !hasCoreInternals ||
    !hasFrustumInternals ||
    !hasCameraEvents ||
    !hasSceneViewInternals
  ) {
    throw new Error(
      "[FATAL][MEASUREMENTS][CESIUM_PRIVATE_API] Private Cesium camera/view internals changed. Overlay sync contract is invalid and requires adaptation."
    );
  }

  hasValidatedPrivateCesiumContracts = true;
};

const captureCameraSnapshot = (scene: Scene): CameraSnapshot => {
  const camera = asPrivateCameraRaw(scene) as PrivateCameraRaw;
  return {
    viewMatrix: Matrix4.clone(camera._viewMatrix, new Matrix4()),
    frustumClone: camera.frustum.clone?.() ?? null,
    drawingBufferWidth: scene.drawingBufferWidth,
    drawingBufferHeight: scene.drawingBufferHeight,
  };
};

const hasSceneCameraChanged = (
  scene: Scene,
  previousSnapshot: CameraSnapshot | null
) => {
  if (!previousSnapshot) return true;

  if (
    scene.drawingBufferWidth !== previousSnapshot.drawingBufferWidth ||
    scene.drawingBufferHeight !== previousSnapshot.drawingBufferHeight
  ) {
    return true;
  }

  const camera = asPrivateCameraRaw(scene) as PrivateCameraRaw;
  if (
    !Matrix4.equalsEpsilon(
      camera._viewMatrix,
      previousSnapshot.viewMatrix,
      CAMERA_CHANGE_EPSILON
    )
  ) {
    return true;
  }

  const frustumEquals = camera.frustum.equalsEpsilon?.(
    previousSnapshot.frustumClone,
    CAMERA_CHANGE_EPSILON
  );
  if (!frustumEquals) {
    return true;
  }

  return false;
};

export const useCesiumOverlaySync = () => {
  const { getScene } = useCesiumContext();
  const scene = getScene();
  const overlayUpdateRef = useRef<(() => void) | null>(null);
  const overlayUpdateQueuedRef = useRef(true);
  const previousCameraSnapshotRef = useRef<CameraSnapshot | null>(null);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    assertPrivateCesiumContracts(scene);

    const queueOverlayUpdate = () => {
      overlayUpdateQueuedRef.current = true;
    };

    const onPreRender = () => {
      if (!overlayUpdateRef.current) return;
      const cameraChanged = hasSceneCameraChanged(
        scene,
        previousCameraSnapshotRef.current
      );
      if (!overlayUpdateQueuedRef.current && !cameraChanged) return;
      overlayUpdateRef.current();
      overlayUpdateQueuedRef.current = false;
      previousCameraSnapshotRef.current = captureCameraSnapshot(scene);
    };

    const camera = asPrivateCameraRaw(scene) as PrivateCameraRaw;
    const removePreRenderListener =
      scene.preRender.addEventListener(onPreRender);
    const removeMoveStartListener =
      camera.moveStart.addEventListener(queueOverlayUpdate);
    const removeMoveEndListener =
      camera.moveEnd.addEventListener(queueOverlayUpdate);
    const removeCameraChangedListener =
      camera.changed.addEventListener(queueOverlayUpdate);

    return () => {
      removePreRenderListener();
      removeMoveStartListener();
      removeMoveEndListener();
      removeCameraChangedListener();
      previousCameraSnapshotRef.current = null;
    };
  }, [scene]);

  const requestUpdateCallback = useCallback((fn: () => void) => {
    overlayUpdateRef.current = fn;
    overlayUpdateQueuedRef.current = true;
    previousCameraSnapshotRef.current = null;
  }, []);

  return requestUpdateCallback;
};
