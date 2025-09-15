import { useState, useEffect, useCallback, useRef } from "react";
import {
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRange,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

import type { Radians, Meters } from "@carma-commons/types";

import { useCesiumContext } from "../../../hooks/useCesiumContext";

import {
  animateCamera,
  getHeadingPitchForMouseEvent,
  getOrbitPoint,
  PITCH,
} from "../../../utils/cesiumAnimateOrbits";
import { applyRollToHeadingForCameraNearNadir } from "../../../utils/cesiumCamera";
import { guardCamera } from "../../../utils/guardCamera";
import { isValidScreenSpaceEventHandler } from "../../../utils/instanceGates";
import { cancelViewerAnimation } from "../../../utils/viewerAnimationMap";
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
  const { viewerAnimationMapRef } = cesiumCtx;
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
      cesiumCtx.withCamera((camera, viewer) => {
        cancelViewerAnimation(viewer, viewerAnimationMapRef.current);
        setIsControlMouseDown(true);
        setInitialMouseX(event.clientX);
        setInitialMouseY(event.clientY);
        setInitialHeading(camera.heading as Radians);
        setInitialPitch(camera.pitch as Radians);
        needleOrientationRef.current?.(
          camera.pitch as Radians,
          camera.heading as Radians
        );

        const target = getOrbitPoint(cesiumCtx);
        if (target) {
          const range = Cartesian3.distance(target, camera.positionWC);
          setInitialRange(range as Meters);
        }
      });
    },
    [cesiumCtx, shouldSuspendPitchLimiterRef, viewerAnimationMapRef]
  );

  const handleMouseUp = useCallback(() => {
    shouldSuspendPitchLimiterRef.current = false;
    setIsControlMouseDown(false);
    cesiumCtx.withCamera((camera) => {
      camera.lookAtTransform(Matrix4.IDENTITY);
    });
  }, [cesiumCtx, shouldSuspendPitchLimiterRef]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isControlMouseDown) return;
      cesiumCtx.withCamera((camera) => {
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

        const target = getOrbitPoint(cesiumCtx);
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
    cesiumCtx.withCamera((camera, viewer) => {
      const orbitPoint = getOrbitPoint(cesiumCtx);
      if (!orbitPoint || !viewerAnimationMapRef.current) return;
      animateCamera(
        viewer,
        viewerAnimationMapRef.current,
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
    viewerAnimationMapRef,
  ]);

  const handleDoubleClick = useCallback(() => {
    // sets heading to 0 and pitch to PITCH.ORTHO
    cesiumCtx.withCamera((camera, viewer) => {
      const orbitPoint = getOrbitPoint(cesiumCtx);
      if (!orbitPoint || !viewerAnimationMapRef.current) return;
      animateCamera(
        viewer,
        viewerAnimationMapRef.current,
        orbitPoint,
        0,
        PITCH.ORTHO,
        initialRange,
        durationReset
      );
    });
  }, [cesiumCtx, durationReset, initialRange, viewerAnimationMapRef]);

  useEffect(() => {
    const animationMap = viewerAnimationMapRef.current;
    let cleanup;
    cesiumCtx.withCamera((camera, viewer) => {
      const getCameraOrientation = () => {
        cesiumCtx.withCamera((camera) => {
          needleOrientationRef.current?.(
            camera.pitch as Radians,
            camera.heading as Radians
          );
        });
      };

      try {
        const handler = new ScreenSpaceEventHandler(viewer.canvas);
        handler.setInputAction(() => {
          cesiumCtx.withViewer((viewer) => {
            cancelViewerAnimation(viewer, animationMap);
          });
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
      cleanup && cleanup();
    };
  }, [cesiumCtx, viewerAnimationMapRef]);

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
    cesiumCtx.withCamera((camera) => {
      const updateOrientation = () => {
        cesiumCtx.withCamera((camera) => {
          // correct heading for compass needle
          needleOrientationRef.current?.(
            camera.pitch as Radians,
            applyRollToHeadingForCameraNearNadir(camera)
          );
        });
      };
      camera.percentageChanged = 0.01;
      guardCamera(camera).changed.addEventListener(updateOrientation);

      cleanup = () => {
        cesiumCtx.withCamera((camera) => {
          guardCamera(camera).changed.removeEventListener(updateOrientation);
        });
      };
    });
    return () => cleanup && cleanup();
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
