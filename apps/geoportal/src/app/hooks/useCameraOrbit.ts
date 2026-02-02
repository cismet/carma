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
import { SINUSOIDAL_IN_OUT } from "@carma-commons/math";

interface UseCameraOrbitOptions {
  scene: Scene | null;
  enabled: boolean;
  angularVelocity?: number; // radians per second
}

const ORBIT_CENTER_POSITION: [number, number] = [0.5, 0.6];
const EASE_IN_OUT_DURATION = 2000; // 2 seconds for softer, longer ease-in/out
const LINE_FADE_DURATION = 500; // ms for line fade out

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
}: UseCameraOrbitOptions) => {
  const [isOrbiting, setIsOrbiting] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const orbitPointRef = useRef<Cartesian3 | null>(null);
  const visualizerRef = useRef<RotationAxisVisualizer | null>(null);
  const currentVelocityRef = useRef<number>(0);
  const targetVelocityRef = useRef<number>(0);
  const velocityRampStartTimeRef = useRef<number>(0);

  const startOrbit = useCallback(() => {
    setIsOrbiting(true);
    targetVelocityRef.current = angularVelocity;
    velocityRampStartTimeRef.current = performance.now();
  }, [angularVelocity]);

  const stopOrbit = useCallback(() => {
    setIsOrbiting(false);
    currentVelocityRef.current = 0;
    // Fade out visualizer then destroy it
    const visualizer = visualizerRef.current;
    if (visualizer) {
      visualizer.fadeOut(LINE_FADE_DURATION, () => {
        visualizer.destroy();
        visualizerRef.current = null;
      });
    }
  }, []);

  const toggleOrbit = useCallback(() => {
    setIsOrbiting((prev) => !prev);
  }, []);

  // Initialize visualizer only when orbit starts
  useEffect(() => {
    if (!scene || !isOrbiting) return;

    // Create visualizer when orbit starts
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

    // Only cleanup on unmount, not when orbit stops (handled in stopOrbit)
    return () => {
      // Only destroy if still exists (stopOrbit might have already destroyed it)
      if (visualizerRef.current === visualizer) {
        visualizer.destroy();
        visualizerRef.current = null;
      }
    };
  }, [scene, isOrbiting]);

  // Set up drag detection
  useEffect(() => {
    if (!scene) return;

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handlerRef.current = handler;

    const startDrag = () => {
      isDraggingRef.current = true;
      targetVelocityRef.current = 0;
      velocityRampStartTimeRef.current = performance.now();
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };

    const endDrag = () => {
      // Update orbit center to new position at screen center
      const pickResult = pickScenePositions(
        scene,
        [ORBIT_CENTER_POSITION],
        "orbit-center"
      )[0];
      if (pickResult?.scenePosition) {
        orbitPointRef.current = pickResult.scenePosition;
      }
      
      // Ease back in
      targetVelocityRef.current = angularVelocity;
      velocityRampStartTimeRef.current = performance.now();
      
      // Small delay before allowing orbit to resume
      dragTimeoutRef.current = setTimeout(() => {
        isDraggingRef.current = false;
      }, 200);
    };

    const handleZoom = () => {
      // Update orbit center on zoom - behaves like drag
      if (isOrbiting && visualizerRef.current) {
        // Clear any pending drag timeout to debounce rapid wheel events
        if (dragTimeoutRef.current) {
          clearTimeout(dragTimeoutRef.current);
        }
        isDraggingRef.current = true;
        targetVelocityRef.current = 0;
        
        const pickResult = pickScenePositions(
          scene,
          [ORBIT_CENTER_POSITION],
          "orbit-center"
        )[0];
        if (pickResult?.scenePosition) {
          orbitPointRef.current = pickResult.scenePosition;
          const surfaceNormal = Ellipsoid.WGS84.geodeticSurfaceNormal(
            pickResult.scenePosition,
            new Cartesian3()
          );
          // Show and update visualizer during zoom
          visualizerRef.current.show();
          visualizerRef.current.update(pickResult.scenePosition, surfaceNormal, scene.camera.position);
        }
        
        // Debounce: wait 200ms after last wheel event before resuming rotation
        dragTimeoutRef.current = setTimeout(() => {
          isDraggingRef.current = false;
        }, 200);
      }
    };

    // Listen to all drag start events
    handler.setInputAction(startDrag, ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(startDrag, ScreenSpaceEventType.MIDDLE_DOWN);
    handler.setInputAction(startDrag, ScreenSpaceEventType.RIGHT_DOWN);
    handler.setInputAction(startDrag, ScreenSpaceEventType.PINCH_START);

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
  }, [scene, angularVelocity, isOrbiting]);

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
    const visualizer = visualizerRef.current;

    const animate = (currentTime: number) => {
      if (!scene) {
        return;
      }

      // If not orbiting, hide visualizer
      if (!isOrbiting) {
        orbitPointRef.current = null;
        visualizer?.hide();
        return;
      }

      // Skip rotation during drag, but keep line visible and updating
      if (isDraggingRef.current) {
        // Continuously update line position to screen center during drag
        const pickResult = pickScenePositions(
          scene,
          [ORBIT_CENTER_POSITION],
          "orbit-center"
        )[0];
        if (pickResult?.scenePosition) {
          orbitPointRef.current = pickResult.scenePosition;
          // Show and update visualizer
          const surfaceNormal = ellipsoid.geodeticSurfaceNormal(
            pickResult.scenePosition,
            new Cartesian3()
          );
          visualizer?.show();
          visualizer?.update(pickResult.scenePosition, surfaceNormal, camera.position);
        }
        lastTimeRef.current = currentTime;
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Not dragging - fade out line and don't update it
      if (visualizer?.isVisible) {
        // Start fading out immediately when rotation resumes
        visualizer.fadeOut?.(LINE_FADE_DURATION) ?? visualizer.hide();
      }

      // Initialize orbit point if needed using pickScenePositions
      if (!orbitPointRef.current) {
        const pickResult = pickScenePositions(
          scene,
          [ORBIT_CENTER_POSITION],
          "orbit-center"
        )[0];
        if (pickResult?.scenePosition) {
          orbitPointRef.current = pickResult.scenePosition;
          targetVelocityRef.current = angularVelocity;
          velocityRampStartTimeRef.current = performance.now();
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
      const timeSinceRampStart = performance.now() - velocityRampStartTimeRef.current;
      const rampProgress = Math.min(timeSinceRampStart / EASE_IN_OUT_DURATION, 1);
      const easedProgress = SINUSOIDAL_IN_OUT(rampProgress);
      currentVelocityRef.current = 
        currentVelocityRef.current + 
        (targetVelocityRef.current - currentVelocityRef.current) * easedProgress;

      // Calculate rotation angle for this frame (clockwise)
      const angle = currentVelocityRef.current * deltaTime;

      // Rotate camera around the ground point's up axis
      const upAxis = ellipsoid.geodeticSurfaceNormal(groundPoint, new Cartesian3());

      // Create rotation quaternion
      const rotation = Quaternion.fromAxisAngle(upAxis, angle, new Quaternion());
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
      camera.position = Cartesian3.add(groundPoint, rotatedOffset, new Cartesian3());

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
      camera.right = Cartesian3.cross(camera.direction, camera.up, new Cartesian3());

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
  }, [scene, enabled, isOrbiting, angularVelocity]);

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
