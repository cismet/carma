import { type MutableRefObject, useCallback, useEffect, useState } from "react";

import {
  Cartesian3,
  Cartesian2,
  CesiumMath,
} from "@carma/cesium";
import type { Radians } from "@carma/units/types";
import { animateOrbitHeadingPitchRange } from "@carma-mapping/engines/cesium/api";

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

const HEADING_EPSILON = 0.0001;

export const useObliqueCameraHandlers = (
  animationInProgressRef: MutableRefObject<boolean>
) => {
  const { getScene } = useCesiumContext();
  const { headingOffset, isObliqueMode } = useOblique();

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

      if (Math.abs(normalizedCurrent - normalizedTarget) < HEADING_EPSILON) {
        return;
      }

      const centerPoint = getOrbitCenter();
      const range = Cartesian3.distance(centerPoint, camera.position);

      animationInProgressRef.current = true;
      const cancelAnimation = animateOrbitHeadingPitchRange(
        scene,
        centerPoint,
        {
          heading: normalizedTarget as Radians,
          pitch: camera.pitch as Radians,
          range,
        },
        {
          onComplete: () => {
            animationInProgressRef.current = false;
            const cardinals = getCardinalHeadings(headingOffset);
            const closest = findClosestCardinalIndex(normalizedTarget, cardinals);
            setActiveDirection(closest);
          },
          onCancel: () => {
            animationInProgressRef.current = false;
          },
        }
      );

      return () => {
        cancelAnimation();
      };
    },
    [getScene, headingOffset, animationInProgressRef, getOrbitCenter]
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

      const centerPoint = getOrbitCenter();
      const range = Cartesian3.distance(centerPoint, camera.position);

      if (Math.abs(currentHeading - targetHeading) < HEADING_EPSILON) {
        return;
      }

      animationInProgressRef.current = true;
      const cancelAnimation = animateOrbitHeadingPitchRange(
        scene,
        centerPoint,
        {
          heading: targetHeading as Radians,
          pitch: camera.pitch as Radians,
          range,
        },
        {
          onComplete: () => {
            animationInProgressRef.current = false;
            setActiveDirection(targetDirection);
          },
          onCancel: () => {
            animationInProgressRef.current = false;
          },
        }
      );

      return () => {
        cancelAnimation();
      };
    },
    [headingOffset, animationInProgressRef, getOrbitCenter, getScene]
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

    const updateCameraInfo = () => {
      if (animationInProgressRef.current) {
        return; // Don't process further if we're in the middle of an animation
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

    scene.camera.changed.addEventListener(updateCameraInfo);
    scene.camera.moveEnd.addEventListener(updateCameraInfo);

    return () => {
      if (scene && !scene.isDestroyed()) {
        scene.camera.changed.removeEventListener(updateCameraInfo);
        scene.camera.moveEnd.removeEventListener(updateCameraInfo);
      }
    };
  }, [getScene, isObliqueMode, headingOffset, animationInProgressRef]);

  return {
    activeDirection,
    setActiveDirection,
    rotateCamera,
    rotateToDirection,
    rotateToHeading,
  };
};
