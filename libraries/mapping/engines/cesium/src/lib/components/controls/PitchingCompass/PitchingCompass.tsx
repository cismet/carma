import React, { useState, useEffect } from "react";
import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRange,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

import {
  cancelViewerAnimation,
  type ViewerAnimationMap,
} from "../../../utils/viewerAnimationMap";

import {
  animateCamera,
  getHeadingPitchForMouseEvent,
  getOrbitPoint,
  PITCH,
} from "../../../utils/cesiumAnimateOrbits";

import { CompassNeedleSVG } from "./CompassNeedleSVG";

interface RotateButtonProps {
  viewerRef: React.RefObject<Viewer | null>;
  viewerAnimationMapRef: React.RefObject<ViewerAnimationMap | null>;
  minPitch?: number;
  maxPitch?: number;
  durationReset?: number;
  pitchFactor?: number;
  pitchOblique?: number;
  headingFactor?: number;
}

/**
 * @viewerRef reference to cesium viewer
 * @viewerAnimationMapRef reference to a WeakMap of viewer animations
 * @minPitch pitch angle in radians starting from Nadir -90 to -0, should be left at -90
 * @maxPitch pitch angle in radians starting from Nadir -90 to -0 is flat with terrain and should be avoided.
 * @durationReset duration in milliseconds when returning to top down or default oblique view
 * @defaultHeading heading for default view
 * @pitchOblique pitch for default oblique view direction
 * @pitchFactor input multiplier for mouse movement (Y axis / Pitch)
 * @headingFactor input multiplier for mouse movement (X axis / Heading)
 */

export const PitchingCompass: React.FC<RotateButtonProps> = ({
  viewerRef,
  viewerAnimationMapRef,
  minPitch = CesiumMath.toRadians(-90),
  maxPitch = CesiumMath.toRadians(-10),
  durationReset = 1500,
  pitchFactor = 1,
  pitchOblique = PITCH.OBLIQUE,
  headingFactor = 1,
}) => {
  const [isControlMouseDown, setIsControlMouseDown] = useState(false);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialMouseY, setInitialMouseY] = useState(0);
  const [initialHeading, setInitialHeading] = useState<number>(0);
  const [initialPitch, setInitialPitch] = useState<number>(0);
  const [initialRange, setInitialRange] = useState<number>(100);
  const [currentPitch, setCurrentPitch] = useState(0);
  const [currentHeading, setCurrentHeading] = useState(0);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (viewerRef.current && viewerAnimationMapRef.current) {
      cancelViewerAnimation(viewerRef.current, viewerAnimationMapRef.current);
      setIsControlMouseDown(true);
      setInitialMouseX(event.clientX);
      setInitialMouseY(event.clientY);
      setInitialHeading(viewerRef.current.camera.heading);
      setInitialPitch(viewerRef.current.scene.camera.pitch);
      setCurrentPitch(viewerRef.current.scene.camera.pitch);
      setCurrentHeading(viewerRef.current.camera.heading);

      const target = getOrbitPoint(viewerRef.current);
      if (target) {
        const range = Cartesian3.distance(
          target,
          viewerRef.current.camera.positionWC
        );
        setInitialRange(range);
      }
    }
  };

  const handleControlMouseUp = () => {
    setIsControlMouseDown(false);
    if (viewerRef.current && initialHeading !== null) {
      const scene = viewerRef.current.scene;
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
    }
  };

  useEffect(() => {
    console.log(
      "useEffect RotateButton",
      viewerRef.current,
      viewerAnimationMapRef.current
    );
    if (!viewerRef.current || !viewerAnimationMapRef.current) return;
    const viewer = viewerRef.current;
    const animationMap = viewerAnimationMapRef.current;

    const getCameraOrientation = () => {
      if (!viewer || !viewer.camera) return;
      const { pitch, heading } = viewer.camera;
      setCurrentPitch(pitch);
      setCurrentHeading(heading);
    };

    const handler = new ScreenSpaceEventHandler(viewer.canvas);

    handler.setInputAction(() => {
      cancelViewerAnimation(viewer, animationMap);
    }, ScreenSpaceEventType.LEFT_DOWN);

    viewer.camera.changed.addEventListener(getCameraOrientation);

    return () => {
      handler.destroy();
      viewer.camera.changed.removeEventListener(getCameraOrientation);
    };
  }, [viewerRef, viewerAnimationMapRef]);

  useEffect(() => {
    if (!isControlMouseDown) return;

    const handleMouseMove = (event: MouseEvent) => {
      if (!isControlMouseDown) return;
      if (viewerRef.current) {
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

        const target = getOrbitPoint(viewerRef.current);

        if (target && initialRange !== null) {
          viewerRef.current.scene.camera.lookAt(
            target,
            new HeadingPitchRange(heading, pitch, initialRange)
          );
        }
        setInitialMouseX(event.clientX);
        setInitialMouseY(event.clientY);
        setCurrentPitch(pitch);
        setCurrentHeading(heading);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleControlMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleControlMouseUp);
    };
  }, [isControlMouseDown]);

  const handleButtonClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      viewerRef.current &&
      viewerAnimationMapRef.current &&
      initialRange !== null
    ) {
      const orbitPoint = getOrbitPoint(viewerRef.current);
      if (orbitPoint) {
        const isDoubleClick = event.detail >= 2;
        const targetPitch = CesiumMath.toRadians(
          isDoubleClick ? PITCH.ORTHO : pitchOblique
        );
        animateCamera(
          viewerRef.current,
          viewerAnimationMapRef.current,
          orbitPoint,
          0,
          targetPitch,
          initialRange,
          durationReset
        );
      }
    }
  };

  useEffect(() => {
    if (viewerRef.current) {
      const camera = viewerRef.current.scene.camera;
      const updateOrientation = () => {
        setCurrentPitch(camera.pitch);
        setCurrentHeading(camera.heading);
      };
      camera.percentageChanged = 0.01;
      camera.changed.addEventListener(updateOrientation);

      return () => {
        camera.changed.removeEventListener(updateOrientation);
      };
    }
  }, [viewerRef]);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="cesium-orbit-control-button"
      onMouseDown={handleMouseDown}
      onMouseUp={handleControlMouseUp}
      onClick={handleButtonClick}
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
      <CompassNeedleSVG pitch={currentPitch} heading={currentHeading} />
    </div>
  );
};

export default PitchingCompass;
