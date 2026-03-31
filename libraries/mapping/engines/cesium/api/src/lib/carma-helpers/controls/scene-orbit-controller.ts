import {
  getCanvasDimensions,
  normalizedToPixelPosition,
} from "@carma-commons/dom/canvas";
import { Easing, clamp } from "@carma/math";
import {
  Cartesian3,
  Ellipsoid,
  Matrix3,
  Matrix4,
  Quaternion,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Scene,
} from "../../cesium";
import { pickBestAvailablePositionAtScreenPosition } from "../scene/Picking";
import {
  createRotationAxisVisualizer,
  type RotationAxisVisualizer,
} from "./rotation-axis-visualizer";

export type CesiumSceneOrbitControllerStopOptions = {
  immediate?: boolean;
};

export type CreateCesiumSceneOrbitControllerOptions = {
  scene: Scene;
  enabled?: boolean;
  angularVelocity?: number;
  restartDelayMs?: number;
};

export type CesiumSceneOrbitController = {
  readonly scene: Scene;
  readonly isOrbiting: boolean;
  readonly isEnabled: boolean;
  startOrbit: () => void;
  stopOrbit: (options?: CesiumSceneOrbitControllerStopOptions) => void;
  toggleOrbit: () => void;
  setEnabled: (enabled: boolean) => void;
  subscribeIsOrbiting: (listener: (isOrbiting: boolean) => void) => () => void;
  destroy: () => void;
};

type PointerPosition = {
  x: number;
  y: number;
};

const ORBIT_CENTER_X = 0.5;
const ORBIT_CENTER_Y = 0.5;
const MIN_ORBIT_CENTER_Y = 0.2;
const MAX_ORBIT_CENTER_Y = ORBIT_CENTER_Y;
const BASE_PERSPECTIVE_SHIFT = 0.06;
const EASE_DURATION_MS = 1000;
const LINE_FADE_DURATION_MS = 500;
const DEFAULT_RESTART_DELAY_MS = 300;
const DEFAULT_ANGULAR_VELOCITY_RAD_PER_SECOND = 0.3;
const STOP_VELOCITY_EPSILON = 0.0001;
const DRAG_START_THRESHOLD_PX = 4;

const getVerticalFov = (scene: Scene): number => {
  const frustum = scene.camera.frustum as { fovy?: number };
  const fovy = frustum?.fovy;
  if (typeof fovy !== "number" || !Number.isFinite(fovy) || fovy <= 0) {
    throw new Error("[ORBIT] Camera frustum has no valid vertical FOV (fovy).");
  }
  return fovy;
};

const getOrbitScreenY = (scene: Scene): number => {
  const tiltFromNadir = clamp(
    Math.abs(scene.camera.pitch + Math.PI / 2),
    0,
    Math.PI / 2
  );
  const pitchFactor = Math.sin(tiltFromNadir);
  if (pitchFactor <= 0) {
    return ORBIT_CENTER_Y;
  }

  const fovScale = clamp(
    1 / Math.max(getVerticalFov(scene), Number.EPSILON),
    0.6,
    1.6
  );
  const shift = BASE_PERSPECTIVE_SHIFT * pitchFactor * fovScale;
  return clamp(ORBIT_CENTER_Y - shift, MIN_ORBIT_CENTER_Y, MAX_ORBIT_CENTER_Y);
};

export const createCesiumSceneOrbitController = ({
  scene,
  enabled: initialEnabled = true,
  angularVelocity = DEFAULT_ANGULAR_VELOCITY_RAD_PER_SECOND,
  restartDelayMs = DEFAULT_RESTART_DELAY_MS,
}: CreateCesiumSceneOrbitControllerOptions): CesiumSceneOrbitController => {
  let enabled = initialEnabled;
  let isOrbiting = false;
  let isStopping = false;
  let isDragging = false;
  let isPointerDown = false;
  let pointerDownPosition: PointerPosition | null = null;
  let orbitPoint: Cartesian3 | null = null;
  let visualizer: RotationAxisVisualizer | null = null;
  let currentVelocity = 0;
  let targetVelocity = 0;
  let rampStartVelocity = 0;
  let velocityRampStartTime = 0;
  let wasDragging = false;
  let stopPending = false;
  let animationFrameId: number | null = null;
  let lastFrameTime = 0;
  let dragTimeout: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const orbitingListeners = new Set<(isOrbiting: boolean) => void>();
  const ellipsoid = Ellipsoid.WGS84;
  const handler = new ScreenSpaceEventHandler(scene.canvas);

  const notifyOrbitingListeners = () => {
    for (const listener of orbitingListeners) {
      try {
        listener(isOrbiting);
      } catch {
        // Ignore listener failures and keep controller alive.
      }
    }
  };

  const setOrbiting = (nextIsOrbiting: boolean) => {
    if (isOrbiting === nextIsOrbiting) {
      return;
    }
    isOrbiting = nextIsOrbiting;
    notifyOrbitingListeners();
  };

  const clearDragTimeout = () => {
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }
  };

  const startVelocityRamp = (nextTargetVelocity: number) => {
    targetVelocity = nextTargetVelocity;
    rampStartVelocity = currentVelocity;
    velocityRampStartTime = performance.now();
  };

  const requestRender = () => {
    try {
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    } catch {
      // Ignore transient teardown races.
    }
  };

  const destroyVisualizer = () => {
    visualizer?.destroy();
    visualizer = null;
  };

  const ensureVisualizer = () => {
    if (visualizer || !isOrbiting || stopPending || destroyed) {
      return visualizer;
    }

    const nextVisualizer = createRotationAxisVisualizer("orbit-axis", {
      origin: Cartesian3.ZERO,
      upVector: Cartesian3.UNIT_Z,
      cameraPosition: scene.camera.position,
      lengthMultiplier: 2,
      dashPixelLength: 5,
      gapPixelLength: 3,
      width: 1,
    });

    nextVisualizer.attach(scene, requestRender);
    visualizer = nextVisualizer;
    return visualizer;
  };

  const readOrbitCenterNormalizedPosition = (): [number, number] => [
    ORBIT_CENTER_X,
    getOrbitScreenY(scene),
  ];

  const readOrbitCenterScreenPosition = () => {
    const [, screenPosition] = normalizedToPixelPosition(
      getCanvasDimensions(scene.canvas),
      readOrbitCenterNormalizedPosition()
    );
    return screenPosition;
  };

  const syncOrbitCenterFromViewport = ({
    updateVisualizer = false,
  }: {
    updateVisualizer?: boolean;
  } = {}): Cartesian3 | null => {
    const screenPosition = readOrbitCenterScreenPosition();
    const scenePosition = pickBestAvailablePositionAtScreenPosition(
      scene,
      screenPosition
    );
    if (!scenePosition) {
      return null;
    }

    orbitPoint = scenePosition;

    if (updateVisualizer) {
      const nextVisualizer = ensureVisualizer();
      if (nextVisualizer) {
        const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
          scenePosition,
          new Cartesian3()
        );
        nextVisualizer.show();
        nextVisualizer.update(
          scenePosition,
          surfaceNormal,
          scene.camera.position
        );
      }
    }

    return scenePosition;
  };

  const cancelAnimationLoop = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    lastFrameTime = 0;
  };

  const scheduleAnimationLoop = () => {
    if (animationFrameId !== null || destroyed || !enabled) {
      return;
    }

    const animate = (currentTime: number) => {
      if (destroyed) {
        animationFrameId = null;
        return;
      }

      if (!enabled) {
        animationFrameId = null;
        lastFrameTime = 0;
        visualizer?.hide();
        return;
      }

      if (!isOrbiting && !isStopping) {
        animationFrameId = null;
        orbitPoint = null;
        lastFrameTime = 0;
        return;
      }

      if (isDragging) {
        wasDragging = true;
        syncOrbitCenterFromViewport({ updateVisualizer: true });
        lastFrameTime = currentTime;
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      if (wasDragging) {
        visualizer?.fadeOut(LINE_FADE_DURATION_MS);
        wasDragging = false;
      }

      if (!orbitPoint) {
        if (!isOrbiting) {
          isStopping = false;
          animationFrameId = null;
          lastFrameTime = 0;
          return;
        }

        syncOrbitCenterFromViewport();
        if (!orbitPoint) {
          lastFrameTime = currentTime;
          animationFrameId = requestAnimationFrame(animate);
          return;
        }

        startVelocityRamp(angularVelocity);
        lastFrameTime = currentTime;
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      if (lastFrameTime === 0) {
        lastFrameTime = currentTime;
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const deltaTimeSeconds = (currentTime - lastFrameTime) / 1000;
      lastFrameTime = currentTime;

      const timeSinceRampStartMs = performance.now() - velocityRampStartTime;
      const rampProgress = Math.min(timeSinceRampStartMs / EASE_DURATION_MS, 1);
      const easing =
        targetVelocity >= rampStartVelocity
          ? Easing.EXPONENTIAL_IN
          : Easing.EXPONENTIAL_OUT;
      const easedProgress = easing(rampProgress);
      currentVelocity =
        rampStartVelocity +
        (targetVelocity - rampStartVelocity) * easedProgress;

      if (
        !isOrbiting &&
        isStopping &&
        rampProgress >= 1 &&
        Math.abs(currentVelocity) <= STOP_VELOCITY_EPSILON
      ) {
        currentVelocity = 0;
        isStopping = false;
        orbitPoint = null;
        lastFrameTime = 0;
        animationFrameId = null;
        return;
      }

      if (Math.abs(currentVelocity) <= STOP_VELOCITY_EPSILON) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const angle = currentVelocity * deltaTimeSeconds;
      const groundPoint = orbitPoint;
      const upAxis = ellipsoid.geodeticSurfaceNormal(
        groundPoint,
        new Cartesian3()
      );
      const rotation = Quaternion.fromAxisAngle(
        upAxis,
        angle,
        new Quaternion()
      );
      const rotationMatrix = Matrix4.fromRotationTranslation(
        Matrix3.fromQuaternion(rotation, new Matrix3()),
        Cartesian3.ZERO,
        new Matrix4()
      );

      const cameraOffset = Cartesian3.subtract(
        scene.camera.position,
        groundPoint,
        new Cartesian3()
      );
      const rotatedOffset = Matrix4.multiplyByPoint(
        rotationMatrix,
        cameraOffset,
        new Cartesian3()
      );

      scene.camera.position = Cartesian3.add(
        groundPoint,
        rotatedOffset,
        new Cartesian3()
      );
      scene.camera.direction = Matrix4.multiplyByPointAsVector(
        rotationMatrix,
        scene.camera.direction,
        new Cartesian3()
      );
      scene.camera.up = Matrix4.multiplyByPointAsVector(
        rotationMatrix,
        scene.camera.up,
        new Cartesian3()
      );
      scene.camera.right = Cartesian3.cross(
        scene.camera.direction,
        scene.camera.up,
        new Cartesian3()
      );

      requestRender();
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
  };

  const resumeOrbitAfterInteraction = () => {
    clearDragTimeout();
    dragTimeout = setTimeout(() => {
      if (destroyed || !isOrbiting) {
        return;
      }
      isDragging = false;
      startVelocityRamp(angularVelocity);
      scheduleAnimationLoop();
    }, restartDelayMs);
  };

  const pauseOrbitForInteraction = () => {
    if (!isOrbiting || destroyed) {
      return;
    }
    const nextVisualizer = ensureVisualizer();
    nextVisualizer?.show();
    isDragging = true;
    startVelocityRamp(0);
    clearDragTimeout();
    scheduleAnimationLoop();
  };

  const beginDrag = () => {
    if (!isOrbiting || isDragging) {
      return;
    }
    pauseOrbitForInteraction();
  };

  const getEventPosition = (movement: {
    position?: PointerPosition;
    endPosition?: PointerPosition;
  }): PointerPosition | null => {
    const position = movement.endPosition ?? movement.position;
    return position ? { x: position.x, y: position.y } : null;
  };

  const startPointer = (movement: { position?: PointerPosition }) => {
    if (!isOrbiting) {
      return;
    }
    isPointerDown = true;
    pointerDownPosition = getEventPosition(movement);
  };

  const handlePointerMove = (movement: { endPosition?: PointerPosition }) => {
    if (!isOrbiting || !isPointerDown || isDragging) {
      return;
    }

    const start = pointerDownPosition;
    const current = getEventPosition(movement);
    if (!start || !current) {
      beginDrag();
      return;
    }

    const dx = current.x - start.x;
    const dy = current.y - start.y;
    if (
      dx * dx + dy * dy >=
      DRAG_START_THRESHOLD_PX * DRAG_START_THRESHOLD_PX
    ) {
      beginDrag();
    }
  };

  const handlePinchStart = () => {
    if (!isOrbiting) {
      return;
    }
    isPointerDown = true;
    pointerDownPosition = null;
    beginDrag();
  };

  const endDrag = () => {
    isPointerDown = false;
    pointerDownPosition = null;

    if (!isDragging) {
      return;
    }

    syncOrbitCenterFromViewport({ updateVisualizer: true });
    resumeOrbitAfterInteraction();
  };

  const handleZoom = () => {
    if (!isOrbiting) {
      return;
    }

    pauseOrbitForInteraction();
    syncOrbitCenterFromViewport({ updateVisualizer: true });
    resumeOrbitAfterInteraction();
  };

  handler.setInputAction(startPointer, ScreenSpaceEventType.LEFT_DOWN);
  handler.setInputAction(startPointer, ScreenSpaceEventType.MIDDLE_DOWN);
  handler.setInputAction(startPointer, ScreenSpaceEventType.RIGHT_DOWN);
  handler.setInputAction(handlePinchStart, ScreenSpaceEventType.PINCH_START);
  handler.setInputAction(handlePointerMove, ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction(endDrag, ScreenSpaceEventType.LEFT_UP);
  handler.setInputAction(endDrag, ScreenSpaceEventType.MIDDLE_UP);
  handler.setInputAction(endDrag, ScreenSpaceEventType.RIGHT_UP);
  handler.setInputAction(endDrag, ScreenSpaceEventType.PINCH_END);
  handler.setInputAction(handleZoom, ScreenSpaceEventType.WHEEL);

  const stopOrbit = (options: CesiumSceneOrbitControllerStopOptions = {}) => {
    const immediate = options.immediate ?? false;
    stopPending = immediate;
    setOrbiting(false);
    isDragging = false;
    isPointerDown = false;
    pointerDownPosition = null;
    wasDragging = false;
    isStopping = true;
    startVelocityRamp(0);
    clearDragTimeout();

    if (immediate) {
      stopPending = false;
      destroyVisualizer();
    } else if (visualizer) {
      const visualizerToDestroy = visualizer;
      visualizerToDestroy.fadeOut(LINE_FADE_DURATION_MS, () => {
        if (visualizer === visualizerToDestroy) {
          destroyVisualizer();
        }
      });
    }

    if (enabled) {
      scheduleAnimationLoop();
    }
  };

  const startOrbit = () => {
    stopPending = false;
    isDragging = false;
    isPointerDown = false;
    pointerDownPosition = null;
    wasDragging = false;
    orbitPoint = null;
    isStopping = false;
    setOrbiting(true);
    startVelocityRamp(angularVelocity);

    if (enabled) {
      scheduleAnimationLoop();
    }
  };

  const toggleOrbit = () => {
    if (isOrbiting) {
      stopOrbit();
      return;
    }
    startOrbit();
  };

  const setEnabled = (nextEnabled: boolean) => {
    enabled = nextEnabled;
    if (!enabled) {
      clearDragTimeout();
      cancelAnimationLoop();
      visualizer?.hide();
      return;
    }

    if (isOrbiting || isStopping) {
      scheduleAnimationLoop();
    }
  };

  const destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    clearDragTimeout();
    cancelAnimationLoop();
    destroyVisualizer();
    orbitingListeners.clear();
    handler.destroy();
  };

  return {
    get scene() {
      return scene;
    },

    get isOrbiting() {
      return isOrbiting;
    },

    get isEnabled() {
      return enabled;
    },

    startOrbit,
    stopOrbit,
    toggleOrbit,
    setEnabled,

    subscribeIsOrbiting: (listener) => {
      orbitingListeners.add(listener);
      return () => {
        orbitingListeners.delete(listener);
      };
    },

    destroy,
  };
};
