import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Cartesian3 } from "cesium";

import type { Radians, Meters } from "@carma/units/types";
import {
  cartesian3Distance,
  isValidCartesian3,
  isValidCamera,
  isValidGlobe,
  isValidRay,
  isValidScene,
  newCartesian2,
  newHeadingPitchRange,
  screenSpaceEventHandlerOnUserInteraction,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/core";
import { zeroToTwoPi, PI, TWO_PI } from "@carma/units/helpers";
import { Easing } from "@carma-commons/math";

import {
  CardinalDirectionEnum,
  findClosestCardinalIndex,
  getCardinalHeadings,
} from "../utils/orientationUtils";
import { useOblique } from "./useOblique";
import { useOrbitPoint } from "./useOrbitPoint";
import { resetCamera } from "../utils/cameraUtils";

const DURATION = 500;
const MIN_HEADING_DELTA = 0.0001 as Radians;

export const useObliqueCameraHandlers = (
  animationInProgressRef: MutableRefObject<boolean>,
  isDebugMode: boolean
) => {
  const { requestRender, sceneRef } = useCesiumContext();
  const { headingOffset, isObliqueMode } = useOblique();
  const orbitPoint = useOrbitPoint(isObliqueMode);

  // Returns a stable orbit center. If no orbitPoint is available yet (e.g., before selecting an image),
  // use the pick on the globe at the screen center;
  const getOrbitCenter = useCallback((): Cartesian3 => {
    if (orbitPoint) return orbitPoint;
    const scene = sceneRef.current;
    if (!isValidScene(scene)) throw new Error("Failed to get orbit center");
    const { camera, canvas, globe } = scene;

    if (isValidScene(scene) && isValidCamera(camera) && isValidGlobe(globe)) {
      const ray = camera.getPickRay(
        newCartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
      );
      if (isValidRay(ray)) {
        const picked = globe.pick(ray, scene);
        if (picked && isValidCartesian3(picked)) {
          return picked;
        }
      }
    }
    throw new Error("Failed to get orbit center");
  }, [orbitPoint, sceneRef]);

  const rotateToHeading = useCallback(
    (targetHeading: number) => {
      const scene = sceneRef.current;
      if (!scene || !scene.camera || animationInProgressRef.current) return;

      const { camera } = scene;
      const currentHeading = camera.heading;

      // Normalize headings to [0, 2PI)
      const normalizedTarget = zeroToTwoPi(targetHeading as Radians);
      const normalizedCurrent = zeroToTwoPi(currentHeading as Radians);

      if (Math.abs(normalizedCurrent - normalizedTarget) < MIN_HEADING_DELTA) {
        return;
      }

      // Calculate the range (distance from center)
      let centerPoint: Cartesian3;
      try {
        centerPoint = getOrbitCenter();
      } catch (e) {
        console.error("Failed to calculate range", e);
        return;
      }
      const range = cartesian3Distance(centerPoint, camera.position) as Meters;

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
        const pitch = camera.pitch as Radians;

        if (t < 1) {
          const intermediateHeading = (normalizedCurrent +
            headingChange * t) as Radians;

          if (camera) {
            camera.lookAt(
              centerPoint,
              newHeadingPitchRange(intermediateHeading, pitch, range)
            );
          }

          setCurrentHeading(intermediateHeading);
          requestRender();
        } else {
          camera.lookAt(
            centerPoint,
            newHeadingPitchRange(normalizedTarget, pitch, range)
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
      animationInProgressRef,
      getOrbitCenter,
      requestRender,
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
      if (!scene || !scene.camera) return;
      const { camera } = scene;
      const currentHeading = camera.heading;
      const cardinalHeadings = getCardinalHeadings(headingOffset);

      if (
        Math.abs(currentHeading - cardinalHeadings[targetDirection]) < 0.0001
      ) {
        return;
      }

      const targetHeading = cardinalHeadings[targetDirection];

      let centerPoint: Cartesian3;

      // Calculate the range (distance from center)
      try {
        centerPoint = getOrbitCenter();
      } catch (e) {
        console.error("Failed to calculate range", e);
        return;
      }
      const range = cartesian3Distance(centerPoint, camera.position) as Meters;

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
        if (!scene || !scene.camera) return;
        const { camera } = scene;
        const pitch = camera.pitch as Radians;
        const currentTime = Date.now();
        let t = Math.min((currentTime - startTime) / duration, 1);
        t = Easing.SINUSOIDAL_IN_OUT(t);

        if (t < 1) {
          const intermediateHeading = (currentHeading +
            headingChange * t) as Radians;

          camera.lookAt(
            centerPoint,
            newHeadingPitchRange(intermediateHeading, pitch, range)
          );

          setCurrentHeading(intermediateHeading);
          requestRender();
        } else {
          camera.lookAt(
            centerPoint,
            newHeadingPitchRange(targetHeading, pitch, range)
          );

          setCurrentHeading(targetHeading);
          resetCamera(camera);
          animationInProgressRef.current = false;
          userMovedCameraRef.current = true;

          scene.preUpdate.removeEventListener(onPreUpdate);
          setActiveDirection(targetDirection);
        }
      };

      scene.preUpdate.addEventListener(onPreUpdate);
      return () => {
        resetCamera(camera);
        animationInProgressRef.current = false;
        userMovedCameraRef.current = true;
        if (isValidScene(scene)) {
          scene.preUpdate.removeEventListener(onPreUpdate);
        }
      };
    },
    [
      headingOffset,
      animationInProgressRef,
      getOrbitCenter,
      requestRender,
      sceneRef,
    ]
  );

  const rotateCamera = useCallback(
    (clockwise: boolean) => {
      const scene = sceneRef.current;
      if (!scene || !scene.camera) return;
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
    if (!scene || !scene.camera || !isObliqueMode) return;

    const { camera } = scene;

    setCurrentHeading(camera.heading);

    const onInteraction = () => {
      if (!animationInProgressRef.current) {
        userMovedCameraRef.current = true;
      }
    };

    const cleanupHandler = screenSpaceEventHandlerOnUserInteraction(
      scene,
      onInteraction
    );

    const updateCameraInfo = () => {
      const scene = sceneRef.current;
      if (!scene || !scene.camera) return;
      const camera = scene.camera;

      setCurrentHeading(camera.heading);

      if (animationInProgressRef.current) {
        return;
      }

      if (userMovedCameraRef.current) {
        userMovedCameraRef.current = false;
      }

      const cardinalHeadings = getCardinalHeadings(headingOffset);
      const closestCardinalIndex = findClosestCardinalIndex(
        camera.heading,
        cardinalHeadings
      );
      setActiveDirection(closestCardinalIndex);
    };

    const cardinalHeadings = getCardinalHeadings(headingOffset);
    const closestCardinalIndex = findClosestCardinalIndex(
      camera.heading,
      cardinalHeadings
    );
    setActiveDirection(closestCardinalIndex);

    camera.changed.addEventListener(updateCameraInfo);
    camera.moveEnd.addEventListener(updateCameraInfo);

    return () => {
      if (camera) {
        camera.changed.removeEventListener(updateCameraInfo);
        camera.moveEnd.removeEventListener(updateCameraInfo);
      }
      cleanupHandler();
    };
  }, [
    sceneRef,
    isObliqueMode,
    headingOffset,
    isDebugMode,
    orbitPoint,
    animationInProgressRef,
  ]);
  return {
    currentHeading,
    activeDirection,
    rotateCamera,
    rotateToDirection,
    rotateToHeading,
  };
};
