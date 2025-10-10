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
} from "cesium";

import type { Radians } from "@carma/types";
import {
  isValidScene,
  tryWithValidCamera,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";
import { zeroToTwoPi, PI, TWO_PI, Easing } from "@carma-commons/math";

import {
  CardinalDirectionEnum,
  findClosestCardinalIndex,
  getCardinalHeadings,
} from "../utils/orientationUtils";
import { useOblique } from "./useOblique";
import { useOrbitPoint } from "./useOrbitPoint";
import { useDebugOrbitPoint } from "./useDebugOrbitPoint";
import { resetCamera } from "../utils/cameraUtils";

const DURATION = 500;
const MIN_HEADING_DELTA = 0.0001 as Radians;

export const useObliqueCameraHandlers = (
  animationInProgressRef: MutableRefObject<boolean>,
  isDebugMode: boolean
) => {
  const { viewerRef, requestRender, isValidViewer, sceneRef } =
    useCesiumContext();
  const { headingOffset, isObliqueMode } = useOblique();
  const orbitPoint = useOrbitPoint(isObliqueMode);
  const updateOrbitPointEntity = useDebugOrbitPoint(
    isObliqueMode,
    orbitPoint,
    isDebugMode
  );

  // Returns a stable orbit center. If no orbitPoint is available yet (e.g., before selecting an image),
  // use the pick on the globe at the screen center; as a last resort, use the current camera position.
  const getOrbitCenter = useCallback((): Cartesian3 => {
    if (orbitPoint) return orbitPoint;
    let result: Cartesian3 | null = null;
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return Cartesian3.ZERO;
    const { camera, canvas } = scene;

    if (scene.globe && camera.getPickRay) {
      try {
        const ray = camera.getPickRay(
          new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
        );
        const picked = scene.globe.pick(ray, scene);
        if (picked) {
          result = picked;
          return;
        }
      } catch (_) {
        // ignore and fallback to camera position below
      }
    }
    result = camera.position;
    return result ?? Cartesian3.ZERO;
  }, [orbitPoint]);

  const rotateToHeading = useCallback(
    (targetHeading: number) => {
      const scene = sceneRef.current;
      if (
        !isValidScene(scene) ||
        !isValidViewer() ||
        animationInProgressRef.current
      )
        return;

      const { camera } = scene;
      const currentHeading = camera.heading;

      // Normalize headings to [0, 2PI)
      const normalizedTarget = zeroToTwoPi(targetHeading as Radians);
      const normalizedCurrent = zeroToTwoPi(currentHeading as Radians);

      if (Math.abs(normalizedCurrent - normalizedTarget) < MIN_HEADING_DELTA) {
        return;
      }

      if (!orbitPoint && isDebugMode) {
        updateOrbitPointEntity();
      }

      // Calculate the range (distance from center)
      const centerPoint = getOrbitCenter();
      const range = Cartesian3.distance(centerPoint, camera.position);

      // Start the animation
      animationInProgressRef.current = true;
      userMovedCameraRef.current = false; // Reset this flag since we're starting a programmatic move

      let startTime = Date.now();
      const duration = DURATION; // ms

      let headingChange = normalizedTarget - normalizedCurrent;

      // Ensure we take the shortest path
      if (headingChange > PI) headingChange -= TWO_PI;
      if (headingChange < -PI) headingChange += TWO_PI;

      // Skip animation if the change is very small
      if (Math.abs(headingChange) < MIN_HEADING_DELTA) {
        animationInProgressRef.current = false;
        return;
      }

      const onPreUpdate = () => {
        const currentTime = Date.now();
        let t = Math.min((currentTime - startTime) / duration, 1);
        t = Easing.SINUSOIDAL_IN_OUT(t);

        if (t < 1) {
          const intermediateHeading = normalizedCurrent + headingChange * t;

          tryWithValidCamera(camera, (camera) => {
            camera.lookAt(
              centerPoint,
              new HeadingPitchRange(intermediateHeading, camera.pitch, range)
            );
          });

          setCurrentHeading(intermediateHeading);
          requestRender();
        } else {
          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(normalizedTarget, camera.pitch, range)
          );

          setCurrentHeading(normalizedTarget);
          resetCamera(camera);
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
        resetCamera(camera);
        animationInProgressRef.current = false;
        userMovedCameraRef.current = true;
        scene.preUpdate.removeEventListener(onPreUpdate);
      };
    },
    [
      sceneRef,
      headingOffset,
      updateOrbitPointEntity,
      orbitPoint,
      isDebugMode,
      animationInProgressRef,
      getOrbitCenter,
      requestRender,
      isValidViewer,
    ]
  );
  const userMovedCameraRef = useRef<boolean>(false);

  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [activeDirection, setActiveDirection] =
    useState<CardinalDirectionEnum | null>(null);

  const rotateToDirection = useCallback(
    (targetDirection: CardinalDirectionEnum) => {
      if (animationInProgressRef.current) return;
      const scene = sceneRef.current;
      if (!isValidScene(scene)) return;
      const { camera } = scene;
      const currentHeading = camera.heading;
      const cardinalHeadings = getCardinalHeadings(headingOffset);

      if (
        Math.abs(currentHeading - cardinalHeadings[targetDirection]) < 0.0001
      ) {
        return;
      }

      const targetHeading = cardinalHeadings[targetDirection];

      if (!orbitPoint && isDebugMode) {
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
      if (headingChange > PI) {
        headingChange -= TWO_PI;
      } else if (headingChange < -PI) {
        headingChange += TWO_PI;
      }

      // Skip animation if the change is very small
      if (Math.abs(headingChange) < MIN_HEADING_DELTA) {
        animationInProgressRef.current = false;
        return;
      }

      const onPreUpdate = () => {
        const scene = sceneRef.current;
        if (!isValidScene(scene)) return;
        const { camera } = scene;
        const currentTime = Date.now();
        let t = Math.min((currentTime - startTime) / duration, 1);
        t = Easing.SINUSOIDAL_IN_OUT(t);

        if (t < 1) {
          const intermediateHeading = currentHeading + headingChange * t;

          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(intermediateHeading, camera.pitch, range)
          );

          setCurrentHeading(intermediateHeading);
          requestRender();
        } else {
          camera.lookAt(
            centerPoint,
            new HeadingPitchRange(targetHeading, camera.pitch, range)
          );

          setCurrentHeading(targetHeading);
          resetCamera(scene.camera);
          animationInProgressRef.current = false;
          userMovedCameraRef.current = true;

          scene.preUpdate.removeEventListener(onPreUpdate);
          setActiveDirection(targetDirection);
        }
      };

      scene.preUpdate.addEventListener(onPreUpdate);
      return () => {
        resetCamera(scene.camera);
        animationInProgressRef.current = false;
        userMovedCameraRef.current = true;
        tryWithValidCamera(scene.camera, () => {
          scene.preUpdate.removeEventListener(onPreUpdate);
        });
      };
    },
    [
      headingOffset,
      updateOrbitPointEntity,
      orbitPoint,
      isDebugMode,
      animationInProgressRef,
      getOrbitCenter,
      requestRender,
      sceneRef,
    ]
  );

  const rotateCamera = useCallback(
    (clockwise: boolean) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene)) return;
      const { camera } = scene;
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
    [headingOffset, rotateToDirection, sceneRef]
  );

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene) || !isObliqueMode) return;

    const { camera } = scene;

    setCurrentHeading(camera.heading);

    const inputHandler = new ScreenSpaceEventHandler(scene.canvas);

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
      tryWithValidCamera(sceneRef, (camera) => {
        setCurrentHeading(camera.heading);

        if (animationInProgressRef.current) {
          return;
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
      });
    };

    if (!orbitPoint && isDebugMode) {
      updateOrbitPointEntity();
    }

    const cardinalHeadings = getCardinalHeadings(headingOffset);
    const closestCardinalIndex = findClosestCardinalIndex(
      camera.heading,
      cardinalHeadings
    );
    setActiveDirection(closestCardinalIndex);

    camera.changed.addEventListener(updateCameraInfo);
    camera.moveEnd.addEventListener(updateCameraInfo);

    return () => {
      tryWithValidCamera(sceneRef, (camera) => {
        camera.changed.removeEventListener(updateCameraInfo);
        camera.moveEnd.removeEventListener(updateCameraInfo);
      });
      inputHandler.destroy();
    };
  }, [
    sceneRef,
    isObliqueMode,
    headingOffset,
    isDebugMode,
    orbitPoint,
    animationInProgressRef,
    isValidViewer,
  ]);
  return {
    currentHeading,
    activeDirection,
    rotateCamera,
    rotateToDirection,
    rotateToHeading,
  };
};
