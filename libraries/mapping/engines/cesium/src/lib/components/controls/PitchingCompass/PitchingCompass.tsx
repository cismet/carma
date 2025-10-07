import { useState, useEffect, useCallback, useRef } from "react";
import {
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRange,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

import type { Radians, Meters } from "@carma/types";

import { useCesiumContext } from "../../../hooks/useCesiumContext";

import {
  animateCamera,
  getHeadingPitchForMouseEvent,
  getOrbitPoint,
  PITCH,
} from "../../../utils/cesiumAnimateOrbits";
import { applyRollToHeadingForCameraNearNadir } from "../../../utils/cesiumCamera";
import {
  isValidScene,
  isValidScreenSpaceEventHandler,
  tryWithValidCamera,
  tryWithValidScene,
} from "../../../utils/instanceGates";
import { cancelAnimation } from "../../../utils/animationMap";
import { Needle } from "./Needle";

interface RotateButtonProps {
  minPitch?: Radians;
  maxPitch?: Radians;
  durationReset?: number;
  pitchFactor?: number;
  pitchOblique?: Radians;
  headingFactor?: number;
}

/**
 * @minPitch pitch angle in radians starting from Nadir -90 to -0, should be left at -90
 * @maxPitch pitch angle in radians starting from Nadir -90 to -0 is flat with terrain and should be avoided.
 * @durationReset duration in milliseconds when returning to top down or default oblique view
 * @defaultHeading heading for default view
 * @pitchOblique pitch for default oblique view direction
 * @pitchFactor input multiplier for mouse movement (Y axis / Pitch)
 * @headingFactor input multiplier for mouse movement (X axis / Heading)
 */

export const PitchingCompass = ({
  minPitch = CesiumMath.toRadians(-90) as Radians,
  maxPitch = CesiumMath.toRadians(-30) as Radians,
  durationReset = 1500,
  pitchFactor = 1,
  pitchOblique = PITCH.OBLIQUE as Radians,
  headingFactor = 1,
}: RotateButtonProps) => {
  const { animationMapRef, sceneRef } = useCesiumContext();
  const [isControlMouseDown, setIsControlMouseDown] = useState(false);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialMouseY, setInitialMouseY] = useState(0);
  const [initialHeading, setInitialHeading] = useState<Radians>(0 as Radians);
  const [initialPitch, setInitialPitch] = useState<Radians>(0 as Radians);
  const [initialRange, setInitialRange] = useState<Meters>(100 as Meters);
  const needleOrientationRef = useRef<
    ((p: Radians, h: Radians) => void) | null
  >(null);

  const { shouldSuspendPitchLimiterRef } = useCesiumContext();

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene)) return;
      shouldSuspendPitchLimiterRef.current = true;
      cancelAnimation(scene, animationMapRef.current);
      setIsControlMouseDown(true);
      setInitialMouseX(event.clientX);
      setInitialMouseY(event.clientY);
      setInitialHeading(scene.camera.heading as Radians);
      setInitialPitch(scene.camera.pitch as Radians);
      needleOrientationRef.current?.(
        scene.camera.pitch as Radians,
        scene.camera.heading as Radians
      );

      const target = getOrbitPoint(scene);
      if (target) {
        const range = Cartesian3.distance(target, scene.camera.positionWC);
        setInitialRange(range as Meters);
      }
    },
    [shouldSuspendPitchLimiterRef, animationMapRef, sceneRef]
  );

  const handleMouseUp = useCallback(() => {
    shouldSuspendPitchLimiterRef.current = false;
    setIsControlMouseDown(false);
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
  }, [shouldSuspendPitchLimiterRef, sceneRef]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene) || !isControlMouseDown) return;
      const { pitch, heading } = getHeadingPitchForMouseEvent(
        event,
        initialMouseX,
        initialMouseY,
        initialHeading,
        initialPitch,
        headingFactor,
        pitchFactor,
        minPitch,
        maxPitch
      );

      const target = getOrbitPoint(scene);
      if (target && initialRange !== null) {
        tryWithValidCamera(scene.camera, (camera) => {
          camera.lookAt(
            target,
            new HeadingPitchRange(heading, pitch, initialRange)
          );
        });
      }
      needleOrientationRef.current?.(pitch, heading);
    },
    [
      sceneRef,
      initialMouseX,
      initialMouseY,
      initialHeading,
      initialPitch,
      headingFactor,
      initialRange,
      isControlMouseDown,
      maxPitch,
      minPitch,
      pitchFactor,
    ]
  );

  const handleButtonClick = useCallback(() => {
    // sets heading to 0 and pitch to pitchOblique
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    const orbitPoint = getOrbitPoint(scene);
    if (!orbitPoint || !animationMapRef.current) return;
    animateCamera(
      scene,
      animationMapRef.current,
      orbitPoint,
      0,
      pitchOblique,
      initialRange,
      durationReset
    );
  }, [sceneRef, durationReset, initialRange, pitchOblique, animationMapRef]);

  const handleDoubleClick = useCallback(() => {
    // sets heading to 0 and pitch to PITCH.ORTHO
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    const orbitPoint = getOrbitPoint(scene);
    if (!orbitPoint || !animationMapRef.current) return;
    animateCamera(
      scene,
      animationMapRef.current,
      orbitPoint,
      0,
      PITCH.ORTHO,
      initialRange,
      durationReset
    );
  }, [sceneRef, durationReset, initialRange, animationMapRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    const animationMap = animationMapRef.current;
    let cleanup;
    const getCameraOrientation = () => {
      tryWithValidScene(scene, (scene) => {
        needleOrientationRef.current?.(
          scene.camera.pitch as Radians,
          scene.camera.heading as Radians
        );
      });
    };

    try {
      if (!isValidScene(scene)) return;
      const handler = new ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction(() => {
        cancelAnimation(scene, animationMap);
      }, ScreenSpaceEventType.LEFT_DOWN);

      scene.camera.changed.addEventListener(getCameraOrientation);

      cleanup = () => {
        isValidScreenSpaceEventHandler(handler) && handler.destroy();
        tryWithValidScene(scene, (scene) => {
          scene.camera.changed.removeEventListener(getCameraOrientation);
        });
      };
    } catch (error) {
      console.warn("Error setting up screen space event handler:", error);
    }
    return () => {
      cleanup?.();
    };
  }, [sceneRef, animationMapRef]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => {
    let cleanup;
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    const camera = scene.camera;
    const updateOrientation = () => {
      // correct heading for compass needle
      needleOrientationRef.current?.(
        camera.pitch as Radians,
        applyRollToHeadingForCameraNearNadir(camera)
      );
    };
    camera.percentageChanged = 0.01;
    camera.changed.addEventListener(updateOrientation);

    cleanup = () => {
      isValidScene(scene) &&
        scene.camera.changed.removeEventListener(updateOrientation);
    };
    return () => cleanup?.();
  }, [sceneRef]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="cesium-orbit-control-button"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleButtonClick}
      onDoubleClick={handleDoubleClick}
      style={{
        border: "none",
        background: "transparent",
        // TODO make sizing responsive to container size
        width: "28px",
        height: "28px",
        display: "flex",
        margin: "0px",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Needle register={(fn) => (needleOrientationRef.current = fn)} />
    </div>
  );
};

export default PitchingCompass;
