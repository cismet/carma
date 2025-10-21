import { useState, useEffect, useCallback, useRef } from "react";
import {
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  isValidScene,
  isValidScreenSpaceEventHandler,
  tryWithValidCamera,
  tryWithValidScene,
} from "@carma/cesium";

import type { Radians, Meters, Degrees } from "@carma/units/types";
import { degToRad } from "@carma/units/helpers";
import {
  useCesiumContext,
  CtxEvent,
  animateCamera,
  getHeadingPitchForMouseEvent,
  getOrbitPoint,
  PITCH,
  applyRollToHeadingForCameraNearNadir,
  cancelAnimation,
} from "@carma-mapping/engines/cesium/core";

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

const DEFAULT_MIN_PITCH = degToRad(-90 as Degrees);
const DEFAULT_MAX_PITCH = degToRad(-30 as Degrees);

export const CesiumPitchingCompass = ({
  minPitch = DEFAULT_MIN_PITCH,
  maxPitch = DEFAULT_MAX_PITCH,
  durationReset = 1500,
  pitchFactor = 1,
  pitchOblique = PITCH.OBLIQUE as Radians,
  headingFactor = 1,
}: RotateButtonProps) => {
  const { animationMapRef, sceneRef, subscribe } = useCesiumContext();
  const [isControlMouseDown, setIsControlMouseDown] = useState(false);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialMouseY, setInitialMouseY] = useState(0);
  const [initialHeading, setInitialHeading] = useState<Radians>(0 as Radians);
  const [initialPitch, setInitialPitch] = useState<Radians>(0 as Radians);
  const [initialRange, setInitialRange] = useState<Meters>(100 as Meters);
  const needleOrientationRef = useRef<
    ((p: Radians, h: Radians) => void) | null
  >(null);
  const cameraListenerRef = useRef<(() => void) | null>(null);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene)) return;
      const validScene = scene;
      cancelAnimation(validScene, animationMapRef.current);
      setIsControlMouseDown(true);
      setInitialMouseX(event.clientX);
      setInitialMouseY(event.clientY);
      setInitialHeading(validScene.camera.heading as Radians);
      setInitialPitch(validScene.camera.pitch as Radians);
      needleOrientationRef.current?.(
        validScene.camera.pitch as Radians,
        validScene.camera.heading as Radians
      );

      const target = getOrbitPoint(validScene);
      if (target) {
        const range = Cartesian3.distance(target, validScene.camera.positionWC);
        setInitialRange(range as Meters);
      }
    },
    [animationMapRef, sceneRef]
  );

  const handleMouseUp = useCallback(() => {
    setIsControlMouseDown(false);
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    const validScene = scene;
    validScene.camera.lookAtTransform(Matrix4.IDENTITY);
  }, [sceneRef]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const scene = sceneRef.current;
      if (!isValidScene(scene) || !isControlMouseDown) return;
      const validScene = scene;
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

      const target = getOrbitPoint(validScene);
      if (target && initialRange !== null) {
        tryWithValidCamera(validScene.camera, (camera) => {
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
    const validScene = scene;
    const orbitPoint = getOrbitPoint(validScene);
    if (!orbitPoint || !animationMapRef.current) return;
    animateCamera(
      validScene,
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
    const validScene = scene;
    const orbitPoint = getOrbitPoint(validScene);
    if (!orbitPoint || !animationMapRef.current) return;
    animateCamera(
      validScene,
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
      const validScene = scene;
      const handler = new ScreenSpaceEventHandler(validScene.canvas);
      handler.setInputAction(() => {
        cancelAnimation(validScene, animationMap);
      }, ScreenSpaceEventType.LEFT_DOWN);

      validScene.camera.changed.addEventListener(getCameraOrientation);

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
    const attachCameraListener = () => {
      const scene = sceneRef.current;
      if (!isValidScene(scene)) {
        console.debug("[Compass] Scene not ready, skipping camera listener");
        return;
      }
      
      // Remove existing listener first
      if (cameraListenerRef.current) {
        scene.camera.changed.removeEventListener(cameraListenerRef.current);
        console.debug("[Compass] Removed old camera listener");
      }
      
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
      cameraListenerRef.current = updateOrientation;
      
      // Update needle immediately with current camera orientation
      updateOrientation();
      
      console.debug("[Compass] Camera listener attached and initial orientation set");
    };
    
    // Attach immediately if scene is ready
    attachCameraListener();
    
    // Re-attach when Cesium activates (2D→3D transition)
    const unsubscribeActivate = subscribe(CtxEvent.Activate, () => {
      console.debug("[Compass] Activate event - reattaching camera listener");
      attachCameraListener();
    });

    return () => {
      unsubscribeActivate();
      const scene = sceneRef.current;
      if (cameraListenerRef.current && isValidScene(scene)) {
        scene.camera.changed.removeEventListener(cameraListenerRef.current);
        cameraListenerRef.current = null;
        console.debug("[Compass] Camera listener detached on cleanup");
      }
    };
  }, [sceneRef, subscribe]);

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

export default CesiumPitchingCompass;
