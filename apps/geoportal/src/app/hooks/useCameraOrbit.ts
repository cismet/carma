import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Ellipsoid,
  Matrix3,
  Matrix4,
  Quaternion,
  Scene,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";
import {
  pickScenePositions,
  createRotationAxisVisualizer,
  type RotationAxisVisualizer,
} from "@carma-mapping/engines/cesium/legacy";
import { EXPONENTIAL_IN, EXPONENTIAL_OUT, clamp } from "@carma-commons/math";

interface UseCameraOrbitOptions {
  scene: Scene | null;
  enabled: boolean;
  angularVelocity?: number; // radians per second
  restartDelayMs?: number;
}

interface StopOrbitOptions {
  immediate?: boolean;
}

const ORBIT_CENTER_X = 0.5;
const ORBIT_CENTER_Y = 0.5;
const MIN_ORBIT_CENTER_Y = 0.2;
const MAX_ORBIT_CENTER_Y = ORBIT_CENTER_Y;
const BASE_PERSPECTIVE_SHIFT = 0.06;
const EASE_DURATION = 1000; // 1 second exponential ease in/out
const LINE_FADE_DURATION = 500; // ms for line fade out
const DEFAULT_RESTART_DELAY = 300; // ms debounce before orbit resumes
const STOP_VELOCITY_EPSILON = 0.0001; // radians/sec threshold to stop
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
  if (pitchFactor <= 0) return ORBIT_CENTER_Y;

  // Narrower FOV yields a larger factor, wider FOV yields a smaller factor.
  const fovScale = clamp(
    1 / Math.max(getVerticalFov(scene), Number.EPSILON),
    0.6,
    1.6
  );
  const shift = BASE_PERSPECTIVE_SHIFT * pitchFactor * fovScale;

  return clamp(ORBIT_CENTER_Y - shift, MIN_ORBIT_CENTER_Y, MAX_ORBIT_CENTER_Y);
};

/**
 * Hook to rotate the camera around a ground point in front of the camera.
 * Rotation pauses during user drag operations and resumes afterward.
 * Shows a vertical line primitive to visualize the rotation axis while orbiting.
 * The rotation center is clamped to the terrain surface.
 */
export const useCameraOrbit = ({
  scene,
  enabled,
  angularVelocity = 0.3, // ~17 degrees per second
  restartDelayMs = DEFAULT_RESTART_DELAY,
}: UseCameraOrbitOptions) => {
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const pointerDownPositionRef = useRef<{ x: number; y: number } | null>(null);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const visualizerRef = useRef<RotationAxisVisualizer | null>(null);
  const currentVelocityRef = useRef<number>(0);
  const targetVelocityRef = useRef<number>(0);
  const rampStartVelocityRef = useRef<number>(0);
  const velocityRampStartTimeRef = useRef<number>(0);
  const wasDraggingRef = useRef<boolean>(false);
  const stopPendingRef = useRef<boolean>(false);

  const startVelocityRamp = useCallback((targetVelocity: number) => {
    targetVelocityRef.current = targetVelocity;
    rampStartVelocityRef.current = currentVelocityRef.current;
    velocityRampStartTimeRef.current = performance.now();
  }, []);

  const getOrbitCenterPosition = useCallback((): [number, number] => {
    if (!scene) {
      return [ORBIT_CENTER_X, ORBIT_CENTER_Y];
    }
    return [ORBIT_CENTER_X, getOrbitScreenY(scene)];
  }, [scene]);

  const startOrbit = useCallback(() => {
    isDraggingRef.current = false;
    wasDraggingRef.current = false;
    stopPendingRef.current = false;
    orbitPointRef.current = null;
    setIsStopping(false);
    setIsOrbiting(true);
    startVelocityRamp(angularVelocity);
  }, [angularVelocity, startVelocityRamp]);

  const stopOrbit = useCallback(
    (options?: StopOrbitOptions) => {
      const immediate = options?.immediate ?? false;
      stopPendingRef.current = immediate;
      setIsOrbiting(false);
      isDraggingRef.current = false;
      isPointerDownRef.current = false;
      pointerDownPositionRef.current = null;
      wasDraggingRef.current = false;
      setIsStopping(true);
      startVelocityRamp(0);
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
        dragTimeoutRef.current = null;
      }
    },
    [startVelocityRamp]
  );

  const ensureVisualizer = useCallback(() => {
    if (
      !scene ||
      !isOrbiting ||
      visualizerRef.current ||
      stopPendingRef.current
    ) {
      return visualizerRef.current;
    }

    const visualizer = createRotationAxisVisualizer("orbit-axis", {
      origin: Cartesian3.ZERO,
      upVector: Cartesian3.UNIT_Z,
      cameraPosition: scene.camera.position,
      lengthMultiplier: 2,
      dashPixelLength: 5,
      gapPixelLength: 3,
      width: 1,
    });

    visualizer.attach(scene, () => scene.requestRender());
    visualizerRef.current = visualizer;
    return visualizer;
  }, [isOrbiting, scene]);

  const toggleOrbit = useCallback(() => {
    if (isOrbiting) {
      stopOrbit();
      return;
    }
    startOrbit();
  }, [isOrbiting, startOrbit, stopOrbit]);

  // Fade out and destroy visualizer when orbit stops (including deselection)
  useEffect(() => {
    if (isOrbiting) {
      stopPendingRef.current = false;
      return;
    }
    const visualizer = visualizerRef.current;
    if (!visualizer) {
      stopPendingRef.current = false;
      return;
    }

    if (stopPendingRef.current) {
      stopPendingRef.current = false;
      visualizer.destroy();
      visualizerRef.current = null;
      return;
    }

    visualizer.fadeOut(LINE_FADE_DURATION, () => {
      visualizer.destroy();
      visualizerRef.current = null;
    });
  }, [isOrbiting]);

  // Cleanup visualizer on scene change/unmount
  useEffect(() => {
    return () => {
      if (visualizerRef.current) {
        visualizerRef.current.destroy();
        visualizerRef.current = null;
      }
    };
  }, [scene]);

  // Set up drag detection
  useEffect(() => {
    if (!scene) return;

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handlerRef.current = handler;

    const getEventPosition = (movement: {
      position?: { x: number; y: number };
      endPosition?: { x: number; y: number };
    }) => {
      const position = movement.endPosition ?? movement.position;
      if (!position) return null;
      return { x: position.x, y: position.y };
    };

    const beginDrag = () => {
      if (isDraggingRef.current) return;
      isDraggingRef.current = true;
      const visualizer = ensureVisualizer();
      // If a previous fade-out is still running, cancel it and show immediately.
      visualizer?.show();
      startVelocityRamp(0);
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };

    const startPointer = (movement: {
      position?: { x: number; y: number };
    }) => {
      isPointerDownRef.current = true;
      pointerDownPositionRef.current = getEventPosition(movement);
    };

    const handlePointerMove = (movement: {
      endPosition?: { x: number; y: number };
    }) => {
      if (!isPointerDownRef.current || isDraggingRef.current) return;
      const start = pointerDownPositionRef.current;
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
      isPointerDownRef.current = true;
      pointerDownPositionRef.current = null;
      beginDrag();
    };

    const endDrag = () => {
      isPointerDownRef.current = false;
      pointerDownPositionRef.current = null;
      if (!isDraggingRef.current) {
        return;
      }
      // Update orbit center to new position at screen center
      const orbitCenterPosition = getOrbitCenterPosition();
      const pickResult = pickScenePositions(
        scene,
        [orbitCenterPosition],
        "orbit-center"
      )[0];
      if (pickResult?.scenePosition) {
        orbitPointRef.current = pickResult.scenePosition;
      }

      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }

      // Delay before allowing orbit to resume (debounced)
      dragTimeoutRef.current = setTimeout(() => {
        isDraggingRef.current = false;
        startVelocityRamp(angularVelocity);
      }, restartDelayMs);
    };

    const handleZoom = () => {
      // Update orbit center on zoom - behaves like drag
      if (isOrbiting) {
        const visualizer = ensureVisualizer();
        if (!visualizer) {
          return;
        }
        // Keep axis responsive when zoom resumes during a pending fade-out.
        visualizer.show();
        // Clear any pending drag timeout to debounce rapid wheel events
        if (dragTimeoutRef.current) {
          clearTimeout(dragTimeoutRef.current);
        }
        isDraggingRef.current = true;
        startVelocityRamp(0);

        const orbitCenterPosition = getOrbitCenterPosition();
        const pickResult = pickScenePositions(
          scene,
          [orbitCenterPosition],
          "orbit-center"
        )[0];
        if (pickResult?.scenePosition) {
          orbitPointRef.current = pickResult.scenePosition;
          const surfaceNormal = Ellipsoid.WGS84.geodeticSurfaceNormal(
            pickResult.scenePosition,
            new Cartesian3()
          );
          // Show and update visualizer during zoom
          visualizer.show();
          visualizer.update(
            pickResult.scenePosition,
            surfaceNormal,
            scene.camera.position
          );
        }

        // Debounce: wait before resuming rotation
        dragTimeoutRef.current = setTimeout(() => {
          isDraggingRef.current = false;
          startVelocityRamp(angularVelocity);
        }, restartDelayMs);
      }
    };

    // Listen to all drag start events
    handler.setInputAction(startPointer, ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(startPointer, ScreenSpaceEventType.MIDDLE_DOWN);
    handler.setInputAction(startPointer, ScreenSpaceEventType.RIGHT_DOWN);
    handler.setInputAction(handlePinchStart, ScreenSpaceEventType.PINCH_START);
    handler.setInputAction(handlePointerMove, ScreenSpaceEventType.MOUSE_MOVE);

    // Listen to all drag end events
    handler.setInputAction(endDrag, ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction(endDrag, ScreenSpaceEventType.MIDDLE_UP);
    handler.setInputAction(endDrag, ScreenSpaceEventType.RIGHT_UP);
    handler.setInputAction(endDrag, ScreenSpaceEventType.PINCH_END);

    // Listen to wheel events for zoom
    handler.setInputAction(handleZoom, ScreenSpaceEventType.WHEEL);

    return () => {
      handler.destroy();
      handlerRef.current = null;
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, [
    ensureVisualizer,
    scene,
    angularVelocity,
    getOrbitCenterPosition,
    isOrbiting,
    restartDelayMs,
    startVelocityRamp,
  ]);

  // Orbit animation loop
  useEffect(() => {
    if (!scene || !enabled) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimeRef.current = 0;
      visualizerRef.current?.hide();
      return;
    }

    const camera = scene.camera;
    const ellipsoid = Ellipsoid.WGS84;

    const animate = (currentTime: number) => {
      if (!scene) {
        return;
      }

      const visualizer = visualizerRef.current;

      const shouldAnimate = isOrbiting || isStopping;
      if (!shouldAnimate) {
        orbitPointRef.current = null;
        return;
      }

      // Skip rotation during drag, but keep line visible and updating
      if (isDraggingRef.current) {
        wasDraggingRef.current = true;
        const dragVisualizer = ensureVisualizer() ?? visualizer;
        // Continuously update line position to screen center during drag
        const orbitCenterPosition = getOrbitCenterPosition();
        const pickResult = pickScenePositions(
          scene,
          [orbitCenterPosition],
          "orbit-center"
        )[0];
        if (pickResult?.scenePosition) {
          orbitPointRef.current = pickResult.scenePosition;
          // Show and update visualizer
          const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
            pickResult.scenePosition,
            new Cartesian3()
          );
          dragVisualizer?.show();
          dragVisualizer?.update(
            pickResult.scenePosition,
            surfaceNormal,
            camera.position
          );
        }
      } else if (wasDraggingRef.current) {
        const fadeVisualizer = visualizer;
        if (fadeVisualizer?.fadeOut) {
          // Keep the visualizer instance alive while orbit is active.
          // This avoids destroy/recreate races when map movement resumes quickly.
          fadeVisualizer.fadeOut(LINE_FADE_DURATION);
        } else if (fadeVisualizer) {
          fadeVisualizer.hide();
        }
        wasDraggingRef.current = false;
      }

      // Initialize orbit point if needed using pickScenePositions
      if (!orbitPointRef.current) {
        if (!isOrbiting) {
          setIsStopping(false);
          return;
        }
        const orbitCenterPosition = getOrbitCenterPosition();
        const pickResult = pickScenePositions(
          scene,
          [orbitCenterPosition],
          "orbit-center"
        )[0];
        if (pickResult?.scenePosition) {
          orbitPointRef.current = pickResult.scenePosition;
          startVelocityRamp(angularVelocity);
        }
        lastTimeRef.current = currentTime;
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      if (lastTimeRef.current === 0) {
        lastTimeRef.current = currentTime;
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const deltaTime = (currentTime - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = currentTime;

      const groundPoint = orbitPointRef.current;

      // Apply easing to velocity
      const timeSinceRampStart =
        performance.now() - velocityRampStartTimeRef.current;
      const rampProgress = Math.min(timeSinceRampStart / EASE_DURATION, 1);
      const isAccelerating =
        targetVelocityRef.current >= rampStartVelocityRef.current;
      const easing = isAccelerating ? EXPONENTIAL_IN : EXPONENTIAL_OUT;
      const easedProgress = easing(rampProgress);
      currentVelocityRef.current =
        rampStartVelocityRef.current +
        (targetVelocityRef.current - rampStartVelocityRef.current) *
          easedProgress;

      if (!isOrbiting && isStopping && rampProgress >= 1) {
        if (Math.abs(currentVelocityRef.current) <= STOP_VELOCITY_EPSILON) {
          currentVelocityRef.current = 0;
          setIsStopping(false);
          orbitPointRef.current = null;
          lastTimeRef.current = 0;
          return;
        }
      }

      if (Math.abs(currentVelocityRef.current) <= STOP_VELOCITY_EPSILON) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Calculate rotation angle for this frame (clockwise)
      const angle = currentVelocityRef.current * deltaTime;

      // Rotate camera around the ground point's up axis
      const upAxis = ellipsoid.geodeticSurfaceNormal(
        groundPoint,
        new Cartesian3()
      );

      // Create rotation quaternion
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

      // Transform camera position relative to ground point
      const cameraOffset = Cartesian3.subtract(
        camera.position,
        groundPoint,
        new Cartesian3()
      );
      const rotatedOffset = Matrix4.multiplyByPoint(
        rotationMatrix,
        cameraOffset,
        new Cartesian3()
      );

      // Set new camera position
      camera.position = Cartesian3.add(
        groundPoint,
        rotatedOffset,
        new Cartesian3()
      );

      // Rotate camera direction and up vectors
      camera.direction = Matrix4.multiplyByPointAsVector(
        rotationMatrix,
        camera.direction,
        new Cartesian3()
      );
      camera.up = Matrix4.multiplyByPointAsVector(
        rotationMatrix,
        camera.up,
        new Cartesian3()
      );
      camera.right = Cartesian3.cross(
        camera.direction,
        camera.up,
        new Cartesian3()
      );

      scene.requestRender();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimeRef.current = 0;
    };
  }, [
    ensureVisualizer,
    scene,
    enabled,
    getOrbitCenterPosition,
    isOrbiting,
    isStopping,
    angularVelocity,
    startVelocityRamp,
  ]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
      if (handlerRef.current) {
        handlerRef.current.destroy();
      }
      visualizerRef.current?.destroy();
    };
  }, []);

  return {
    isOrbiting,
    startOrbit,
    stopOrbit,
    toggleOrbit,
  };
};
