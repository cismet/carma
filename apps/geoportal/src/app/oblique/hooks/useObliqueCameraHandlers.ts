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
  EasingFunction,
  ScreenSpaceEventType,
  ScreenSpaceEventHandler,
  Math as CesiumMath,
  HeadingPitchRange,
  Camera,
} from "cesium";

import {
  isValidScene,
  isValidViewer,
  tryWithValidCamera,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";

import {
  CardinalDirectionEnum,
  findClosestCardinalIndex,
  getCardinalHeadings,
} from "../utils/orientationUtils";
import { useOblique } from "./useOblique";
import { useOrbitPoint } from "./useOrbitPoint";
import { useDebugOrbitPoint } from "./useDebugOrbitPoint";
import { resetCamera } from "../utils/cameraUtils";

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
      const viewer = viewerRef.current;
      if (!isValidViewer() || animationInProgressRef.current) return;

      const camera = viewer.camera;
      const scene = viewer.scene;
      const currentHeading = camera.heading;

      // Normalize headings to [0, 2PI)
      const normalizedTarget = CesiumMath.zeroToTwoPi(targetHeading);
      const normalizedCurrent = CesiumMath.zeroToTwoPi(currentHeading);

      if (Math.abs(normalizedCurrent - normalizedTarget) < 0.0001) {
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
        t = EasingFunction.SINUSOIDAL_IN_OUT(t);

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
        const scene = sceneRef.current;
        if (!isValidScene(scene)) return;
        const { camera } = scene;
        const currentTime = Date.now();
        let t = Math.min((currentTime - startTime) / duration, 1);
        t = EasingFunction.SINUSOIDAL_IN_OUT(t);

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
    const viewer = viewerRef.current;
    if (!isValidViewer() || !isObliqueMode) return;

    const camera = viewer.camera;

    setCurrentHeading(camera.heading);

    // Set up event handlers to detect when the user moves the camera manually
    const inputHandler = new ScreenSpaceEventHandler(viewer.canvas);

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
      setCurrentHeading(camera.heading);

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

    if (!orbitPoint && isDebugMode) {
      updateOrbitPointEntity();
    }

    const cardinalHeadings = getCardinalHeadings(headingOffset);
    const closestCardinalIndex = findClosestCardinalIndex(
      camera.heading,
      cardinalHeadings
    );
    setActiveDirection(closestCardinalIndex);

    viewer.camera.changed.addEventListener(updateCameraInfo);
    viewer.camera.moveEnd.addEventListener(updateCameraInfo);

    return () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.changed.removeEventListener(updateCameraInfo);
        viewer.camera.moveEnd.removeEventListener(updateCameraInfo);
        inputHandler.destroy();
      }
    };
  }, [
    viewerRef,
    isObliqueMode,
    headingOffset,
    updateOrbitPointEntity,
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
