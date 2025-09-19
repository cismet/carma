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

import { useCesiumContext } from "@carma-mapping/engines/cesium";

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
  const ctx = useCesiumContext();
  const { requestRender, isValidWidget } = ctx;
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
    ctx.withCamera((camera: Camera) => {
      const scene = camera.scene;
      const canvas = scene.canvas;
      if (scene.globe && camera.getPickRay) {
        try {
          const center = new Cartesian2(
            Math.floor(canvas.clientWidth / 2),
            Math.floor(canvas.clientHeight / 2)
          );
          const ray = camera.getPickRay(center);
          if (ray) {
            const picked = scene.globe.pick(ray, scene);
            if (picked) {
              result = picked;
              return;
            }
          }
        } catch (_) {
          // ignore and fallback to camera position below
        }
      }
      result = camera.position;
    });
    return result ?? Cartesian3.ZERO;
  }, [orbitPoint, ctx]);

  const rotateToHeading = useCallback(
    (targetHeading: number) => {
      if (!isValidWidget() || animationInProgressRef.current) return;

      ctx.withCamera((camera: Camera) => {
        const scene = camera.scene;
        const currentHeading = camera.heading;

        const normalizedTarget = CesiumMath.zeroToTwoPi(targetHeading);
        const normalizedCurrent = CesiumMath.zeroToTwoPi(currentHeading);

        if (Math.abs(normalizedCurrent - normalizedTarget) < 0.0001) {
          return;
        }

        if (!orbitPoint && isDebugMode) {
          updateOrbitPointEntity();
        }

        const centerPoint = getOrbitCenter();
        const range = Cartesian3.distance(centerPoint, camera.position);

        animationInProgressRef.current = true;
        userMovedCameraRef.current = false;

        const startTime = Date.now();
        const duration = 500; // ms

        let headingChange = normalizedTarget - normalizedCurrent;
        if (headingChange > Math.PI) {
          headingChange -= CesiumMath.TWO_PI;
        } else if (headingChange < -Math.PI) {
          headingChange += CesiumMath.TWO_PI;
        }

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
            camera.lookAt(
              centerPoint,
              new HeadingPitchRange(intermediateHeading, camera.pitch, range)
            );
            setCurrentHeading(intermediateHeading);
            requestRender();
          } else {
            camera.lookAt(
              centerPoint,
              new HeadingPitchRange(normalizedTarget, camera.pitch, range)
            );
            setCurrentHeading(normalizedTarget);
            resetCamera(ctx);
            animationInProgressRef.current = false;
            userMovedCameraRef.current = true;
            const cardinals = getCardinalHeadings(headingOffset);
            const closest = findClosestCardinalIndex(
              normalizedTarget,
              cardinals
            );
            setActiveDirection(closest);
            scene.preUpdate.removeEventListener(onPreUpdate);
          }
        };
        scene.preUpdate.addEventListener(onPreUpdate);
      });
    },
    [
      headingOffset,
      updateOrbitPointEntity,
      orbitPoint,
      isDebugMode,
      animationInProgressRef,
      getOrbitCenter,
      requestRender,
      isValidWidget,
      ctx,
    ]
  );
  const userMovedCameraRef = useRef<boolean>(false);

  const [currentHeading, setCurrentHeading] = useState<number>(0);
  const [activeDirection, setActiveDirection] =
    useState<CardinalDirectionEnum | null>(null);

  const rotateToDirection = useCallback(
    (targetDirection: CardinalDirectionEnum) => {
      if (animationInProgressRef.current) return;

      ctx.withCamera((camera: Camera) => {
        const scene = camera.scene;
        const currentHeading = camera.heading;

        const cardinalHeadings = getCardinalHeadings(headingOffset);
        const targetHeading = cardinalHeadings[targetDirection];

        if (Math.abs(currentHeading - targetHeading) < 0.0001) {
          return;
        }

        if (!orbitPoint && isDebugMode) {
          updateOrbitPointEntity();
        }

        const centerPoint = getOrbitCenter();
        const range = Cartesian3.distance(centerPoint, camera.position);

        animationInProgressRef.current = true;
        userMovedCameraRef.current = false;

        const startTime = Date.now();
        const duration = 500; // ms

        let headingChange = targetHeading - currentHeading;
        if (headingChange > Math.PI) {
          headingChange -= CesiumMath.TWO_PI;
        } else if (headingChange < -Math.PI) {
          headingChange += CesiumMath.TWO_PI;
        }

        if (Math.abs(headingChange) < 0.0001) {
          animationInProgressRef.current = false;
          return;
        }

        const onPreUpdate = () => {
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
            resetCamera(ctx);
            animationInProgressRef.current = false;
            userMovedCameraRef.current = true;
            scene.preUpdate.removeEventListener(onPreUpdate);
            setActiveDirection(targetDirection);
          }
        };

        scene.preUpdate.addEventListener(onPreUpdate);
      });
    },
    [
      headingOffset,
      updateOrbitPointEntity,
      orbitPoint,
      isDebugMode,
      animationInProgressRef,
      getOrbitCenter,
      requestRender,
      ctx,
    ]
  );

  const rotateCamera = useCallback(
    (clockwise: boolean) => {
      ctx.withCamera((camera) => {
        const cardinalHeadings = getCardinalHeadings(headingOffset);

        const closestCardinalIndex = findClosestCardinalIndex(
          camera.heading,
          cardinalHeadings
        );

        const nextCardinalIndex = clockwise
          ? (closestCardinalIndex + 3) % 4 // Next clockwise cardinal
          : (closestCardinalIndex + 1) % 4; // Next counterclockwise cardinal (4-1)

        rotateToDirection(nextCardinalIndex);
      });
    },
    [ctx, headingOffset, rotateToDirection]
  );

  useEffect(() => {
    if (!isValidWidget() || !isObliqueMode) return;

    let inputHandler: ScreenSpaceEventHandler | null = null;
    let updateCameraInfo: (() => void) | null = null;

    ctx.withCamera((camera: Camera) => {
      setCurrentHeading(camera.heading);

      const canvas = camera.scene.canvas;
      inputHandler = new ScreenSpaceEventHandler(canvas);

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

      updateCameraInfo = () => {
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

      camera.changed.addEventListener(updateCameraInfo);
      camera.moveEnd.addEventListener(updateCameraInfo);
    });

    return () => {
      if (!isValidWidget()) return;
      if (inputHandler) {
        inputHandler.destroy();
        inputHandler = null;
      }
      if (updateCameraInfo) {
        ctx.withCamera((camera: Camera) => {
          camera.changed.removeEventListener(updateCameraInfo!);
          camera.moveEnd.removeEventListener(updateCameraInfo!);
        });
      }
    };
  }, [
    isObliqueMode,
    headingOffset,
    updateOrbitPointEntity,
    isDebugMode,
    orbitPoint,
    animationInProgressRef,
    isValidWidget,
    ctx,
  ]);
  return {
    currentHeading,
    activeDirection,
    rotateCamera,
    rotateToDirection,
    rotateToHeading,
  };
};
