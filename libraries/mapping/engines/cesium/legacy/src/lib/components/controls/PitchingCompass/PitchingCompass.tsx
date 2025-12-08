import { useState, useEffect, useCallback, useRef } from "react";
import {
  applyRollToHeadingForCameraNearNadir,
  Cartesian3,
  CesiumMath,
  HeadingPitchRange,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "@carma/cesium";

import type { Radians, Meters } from "@carma/units/types";

import { useCesiumContext } from "../../../hooks/useCesiumContext";

import {
  animateCamera,
  getHeadingPitchForMouseEvent,
  PITCH,
} from "../../../utils/cesiumAnimateOrbits";
import { guardCamera } from "../../../utils/guardCamera";
import { isValidScreenSpaceEventHandler } from "../../../utils/instanceGates";
import { cancelSceneAnimation } from "../../../utils/sceneAnimationMap";
import { pickSceneCenter } from "../../../utils/pick-position/pick-scene-positions";
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

export const PitchingCompass: React.FC<RotateButtonProps> = ({
  minPitch = CesiumMath.toRadians(-90),
  maxPitch = CesiumMath.toRadians(-30),
  durationReset = 1500,
  pitchFactor = 1,
  pitchOblique = PITCH.OBLIQUE,
  headingFactor = 1,
}) => {
  const cesiumCtx = useCesiumContext();
  const { sceneAnimationMapRef } = cesiumCtx;
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
      shouldSuspendPitchLimiterRef.current = true;
      cesiumCtx.withScene((scene) => {
        const camera = scene.camera;
        cancelSceneAnimation(scene, sceneAnimationMapRef.current);
        setIsControlMouseDown(true);
        setInitialMouseX(event.clientX);
        setInitialMouseY(event.clientY);
        setInitialHeading(camera.heading as Radians);
        setInitialPitch(camera.pitch as Radians);
        needleOrientationRef.current?.(
          camera.pitch as Radians,
          camera.heading as Radians
        );

        const target = pickSceneCenter(scene);
        if (target) {
          const range = Cartesian3.distance(target, camera.positionWC);
          setInitialRange(range as Meters);
        }
      });
    },
    [cesiumCtx, shouldSuspendPitchLimiterRef, sceneAnimationMapRef]
  );

  const handleMouseUp = useCallback(() => {
    shouldSuspendPitchLimiterRef.current = false;
    setIsControlMouseDown(false);
    cesiumCtx.withScene((scene) => {
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
    });
  }, [cesiumCtx, shouldSuspendPitchLimiterRef]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isControlMouseDown) return;
      cesiumCtx.withScene((scene) => {
        const camera = scene.camera;
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

        const target = pickSceneCenter(scene);
        if (target && initialRange !== null) {
          guardCamera(camera).lookAt(
            target,
            new HeadingPitchRange(heading, pitch, initialRange)
          );
        }
        needleOrientationRef.current?.(pitch, heading);
      });
    },
    [
      cesiumCtx,
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
    cesiumCtx.withScene((scene) => {
      const orbitPoint = pickSceneCenter(scene);
      if (!orbitPoint || !sceneAnimationMapRef.current) return;
      animateCamera(
        scene,
        sceneAnimationMapRef.current,
        orbitPoint,
        0,
        pitchOblique,
        initialRange,
        durationReset
      );
    });
  }, [
    cesiumCtx,
    durationReset,
    initialRange,
    pitchOblique,
    sceneAnimationMapRef,
  ]);

  const handleDoubleClick = useCallback(() => {
    // sets heading to 0 and pitch to PITCH.ORTHO
    cesiumCtx.withScene((scene) => {
      const orbitPoint = pickSceneCenter(scene);
      if (!orbitPoint || !sceneAnimationMapRef.current) return;
      animateCamera(
        scene,
        sceneAnimationMapRef.current,
        orbitPoint,
        0,
        PITCH.ORTHO,
        initialRange,
        durationReset
      );
    });
  }, [cesiumCtx, durationReset, initialRange, sceneAnimationMapRef]);

  useEffect(() => {
    const animationMap = sceneAnimationMapRef.current;
    let cleanup;
    cesiumCtx.withScene((scene) => {
      const camera = scene.camera;
      const getCameraOrientation = () => {
        // TODO why double withCamera here in original code?
        needleOrientationRef.current?.(
          camera.pitch as Radians,
          camera.heading as Radians
        );
      };

      try {
        const handler = new ScreenSpaceEventHandler(scene.canvas);
        handler.setInputAction(() => {
          cancelSceneAnimation(scene, animationMap);
        }, ScreenSpaceEventType.LEFT_DOWN);

        guardCamera(camera, "compass setup").changed.addEventListener(
          getCameraOrientation
        );

        cleanup = () => {
          isValidScreenSpaceEventHandler(handler) && handler.destroy();
          guardCamera(camera, "compass cleanup").changed.removeEventListener(
            getCameraOrientation
          );
        };
      } catch (error) {
        console.warn("Error setting up screen space event handler:", error);
      }
    });
    return () => {
      cleanup?.();
    };
  }, [cesiumCtx, sceneAnimationMapRef]);

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
    cesiumCtx.withScene((scene) => {
      const camera = scene.camera;
      const updateOrientation = () => {
        // correct heading for compass needle
        needleOrientationRef.current?.(
          camera.pitch as Radians,
          applyRollToHeadingForCameraNearNadir(camera)
        );
      };
      camera.percentageChanged = 0.01;
      guardCamera(camera).changed.addEventListener(updateOrientation);

      cleanup = () => {
        guardCamera(camera).changed.removeEventListener(updateOrientation);
      };
    });
    return () => cleanup?.();
  }, [cesiumCtx]);

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
