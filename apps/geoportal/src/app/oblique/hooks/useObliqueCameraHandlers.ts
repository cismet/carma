import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Cartesian3,
  Cartesian2,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  HeadingPitchRange,
  CesiumMath,
} from "@carma/cesium";
import { Easing } from "@carma-commons/math";

import {
  useCesiumContext,
  pickSceneCenter,
} from "@carma-mapping/engines/cesium";

import {
  CardinalDirectionEnum,
  findClosestCardinalIndex,
  getCardinalHeadings,
} from "../utils/orientationUtils";
import { useOblique } from "./useOblique";
import { useDebugOrbitPoint } from "./useDebugOrbitPoint";
import { resetCamera } from "../utils/cameraUtils";

export const useObliqueCameraHandlers = (
  animationInProgressRef: MutableRefObject<boolean>,
  isDebugMode: boolean
) => {
  const { requestRender, getScene, isViewerReady } = useCesiumContext();
  const { headingOffset, isObliqueMode } = useOblique();
  const userMovedCameraRef = useRef<boolean>(false);

  const updateOrbitPointEntity = useDebugOrbitPoint(
    isObliqueMode,
    null, // orbitPoint passed as null, debug hook might need adjustment or we ignore debug point for now if not critical
    isDebugMode
  );

  // Returns a stable orbit center. If no orbitPoint is available yet (e.g., before selecting an image),
  // use the pick on the globe at the screen center; as a last resort, use the current camera position.
  const getOrbitCenter = useCallback((): Cartesian3 => {
    // Pick fresh scene center
    let orbitPoint: Cartesian3 | undefined;
    const scene = getScene();
    if (scene) {
      orbitPoint = pickSceneCenter(scene);
    }

    if (orbitPoint) return orbitPoint;

    let result: Cartesian3 | null = null;
    if (scene) {
      const camera = scene.camera;
      const canvas = scene.canvas;
      if (scene.globe && camera.getPickRay) {
        try {
          const ray = camera.getPickRay(
            new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
          );
          const picked = scene.globe.pick(ray, scene);
          if (picked) {
            result = picked;
          }
        } catch (_) {
          // ignore and fallback to camera position below
        }
      }
      if (!result) {
        result = camera.position;
      }
    }
    return result ?? Cartesian3.ZERO;
  }, [getScene]);

  const rotateToHeading = useCallback(
    (targetHeading: number) => {
      const scene = getScene();
      if (!scene || scene.isDestroyed() || animationInProgressRef.current)
        return;

      const camera = scene.camera;
      const currentHeading = camera.heading;

      // Normalize headings to [0, 2PI)
      const normalizedTarget = CesiumMath.zeroToTwoPi(targetHeading);
      const normalizedCurrent = CesiumMath.zeroToTwoPi(currentHeading);

      if (Math.abs(normalizedCurrent - normalizedTarget) < 0.0001) {
        return;
      }

      if (isDebugMode) {
        updateOrbitPointEntity();
      }

      // Calculate the range (distance from center)
      const centerPoint = getOrbitCenter();
      const range = Cartesian3.distance(centerPoint, camera.position);

      // Start the animation
      animationInProgressRef.current = true;
      userMovedCameraRef.current = false; // Reset this flag since we're starting a programmatic move

      let startTime = Date.now();
      const duration = 500; // ms

      let headingChange = normalizedTarget - normalizedCurrent;

      // Ensure we take the shortest path
      if (headingChange > Math.PI) {
        headingChange -= CesiumMath.TWO_PI;
      } else if (headingChange < -Math.PI) {
        headingChange += CesiumMath.TWO_PI;
      }

      // Skip animation if the change is very small
      if (Math.abs(headingChange) < 0.0001) {
        animationInProgressRef.current = false;
        return;
      }

      const onPreUpdate = () => {
        const currentTime = Date.now();
        let t = Math.min((currentTime - startTime) / duration, 1);
        t = Easing.SINUSOIDAL_IN_OUT(t);

        if (t < 1) {
          const intermediateHeading = normalizedCurrent + headingChange * t;

          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(intermediateHeading, camera.pitch, range)
          );

          requestRender();
        } else {
          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(normalizedTarget, camera.pitch, range)
          );

          resetCamera(scene);
          animationInProgressRef.current = false;
          userMovedCameraRef.current = true;

          // update activeDirection to closest cardinal to target heading
          const cardinals = getCardinalHeadings(headingOffset);
          const closest = findClosestCardinalIndex(normalizedTarget, cardinals);
          setActiveDirection(closest);
          scene.preUpdate.removeEventListener(onPreUpdate);
        }
      };
      scene.preUpdate.addEventListener(onPreUpdate);
      return () => {
        resetCamera(scene);
        animationInProgressRef.current = false;
        userMovedCameraRef.current = true;
        scene.preUpdate.removeEventListener(onPreUpdate);
      };
    },
    [
      getScene,
      headingOffset,
      updateOrbitPointEntity,
      isDebugMode,
      animationInProgressRef,
      getOrbitCenter,
      requestRender,
    ]
  );

  const rotateToDirection = useCallback(
    (targetDirection: CardinalDirectionEnum) => {
      if (animationInProgressRef.current) return;

      const scene = getScene();
      if (!scene || scene.isDestroyed()) return;

      const camera = scene.camera;
      const currentHeading = camera.heading;

      const cardinalHeadings = getCardinalHeadings(headingOffset);

      if (
        Math.abs(currentHeading - cardinalHeadings[targetDirection]) < 0.0001
      ) {
        return;
      }

      const targetHeading = cardinalHeadings[targetDirection];

      if (isDebugMode) {
        updateOrbitPointEntity();
      }

      // Calculate the range (distance from center)
      const centerPoint = getOrbitCenter();
      const range = Cartesian3.distance(centerPoint, camera.position);

      // Start the animation
      animationInProgressRef.current = true;
      userMovedCameraRef.current = false; // Reset this flag since we're starting a programmatic move

      let startTime = Date.now();
      const duration = 500; // ms

      let headingChange = targetHeading - currentHeading;

      // Ensure we take the shortest path
      if (headingChange > Math.PI) {
        headingChange -= CesiumMath.TWO_PI;
      } else if (headingChange < -Math.PI) {
        headingChange += CesiumMath.TWO_PI;
      }

      // Skip animation if the change is very small
      if (Math.abs(headingChange) < 0.0001) {
        animationInProgressRef.current = false;
        return;
      }

      const onPreUpdate = () => {
        const currentTime = Date.now();
        let t = Math.min((currentTime - startTime) / duration, 1);
        t = Easing.SINUSOIDAL_IN_OUT(t);

        if (t < 1) {
          const intermediateHeading = currentHeading + headingChange * t;

          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(intermediateHeading, camera.pitch, range)
          );

          requestRender();
        } else {
          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(targetHeading, camera.pitch, range)
          );

          resetCamera(scene);
          animationInProgressRef.current = false;
          userMovedCameraRef.current = true;

          scene.preUpdate.removeEventListener(onPreUpdate);
          setActiveDirection(targetDirection);
        }
      };

      scene.preUpdate.addEventListener(onPreUpdate);
      return () => {
        resetCamera(scene);
        animationInProgressRef.current = false;
        userMovedCameraRef.current = true;
        scene.preUpdate.removeEventListener(onPreUpdate);
      };
    },
    [
      headingOffset,
      updateOrbitPointEntity,
      isDebugMode,
      animationInProgressRef,
      getOrbitCenter,
      requestRender,
      getScene,
    ]
  );

  const rotateCamera = useCallback(
    (clockwise: boolean) => {
      const scene = getScene();
      if (!scene || scene.isDestroyed()) return;

      const camera = scene.camera;
      const cardinalHeadings = getCardinalHeadings(headingOffset);

      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );

      const nextCardinalIndex = clockwise
        ? (closestCardinalIndex + 3) % 4 // Next clockwise cardinal
        : (closestCardinalIndex + 1) % 4; // Next counterclockwise cardinal (4-1)

      rotateToDirection(nextCardinalIndex);
    },
    [getScene, headingOffset, rotateToDirection]
  );

  const [activeDirection, setActiveDirection] =
    useState<CardinalDirectionEnum | null>(null);

  useEffect(() => {
    const scene = getScene();
    if (!scene || scene.isDestroyed() || !isObliqueMode) return;

    const camera = scene.camera;

    // Set up event handlers to detect when the user moves the camera manually
    const inputHandler = new ScreenSpaceEventHandler(scene.canvas);

    // Track when the user starts manipulating the camera
    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.LEFT_DOWN);

    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.MIDDLE_DOWN);

    inputHandler.setInputAction(() => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    }, ScreenSpaceEventType.RIGHT_DOWN);

    const updateCameraInfo = () => {
      if (animationInProgressRef.current) {
        return; // Don't process further if we're in the middle of an animation
      }

      if (userMovedCameraRef.current) {
        updateOrbitPointEntity();
        userMovedCameraRef.current = false;
      }

      const cardinalHeadings = getCardinalHeadings(headingOffset);
      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );
      setActiveDirection(closestCardinalIndex);
    };

    if (isDebugMode) {
      updateOrbitPointEntity();
    }

    const cardinalHeadings = getCardinalHeadings(headingOffset);
    const closestCardinalIndex = findClosestCardinalIndex(
      camera.heading,
      cardinalHeadings
    );
    setActiveDirection(closestCardinalIndex);

    scene.camera.changed.addEventListener(updateCameraInfo);
    scene.camera.moveEnd.addEventListener(updateCameraInfo);

    return () => {
      if (scene && !scene.isDestroyed()) {
        scene.camera.changed.removeEventListener(updateCameraInfo);
        scene.camera.moveEnd.removeEventListener(updateCameraInfo);
        inputHandler.destroy();
      }
    };
  }, [
    getScene,
    isViewerReady,
    isObliqueMode,
    headingOffset,
    updateOrbitPointEntity,
    isDebugMode,
    animationInProgressRef,
  ]);

  return {
    activeDirection,
    setActiveDirection,
    rotateCamera,
    rotateToDirection,
    rotateToHeading,
  };
};
