import React, { useState, useEffect } from "react";
import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  Cartesian2,
  HeadingPitchRange,
  Matrix4,
} from "cesium";

interface RotateButtonProps {
  viewerRef: React.RefObject<Viewer | null>;
  minPitch?: number;
  maxPitch?: number;
  durationReset?: number;
  pitchFactor?: number;
  headingFactor?: number;
}

enum PITCH {
  HORIZONTAL = 0,
  OBLIQUE = -45,
  ORTHO = -90,
}

const CompassNeedleSVG = ({
  pitch = 0,
  heading = 0,
  northColor = "#d65",
  neutralColor = "#bbb",
}: {
  pitch?: number;
  heading?: number;
  northColor?: string;
  neutralColor?: string;
} = {}) => {
  const [transform, setTransform] = useState("");

  useEffect(() => {
    if (pitch && heading) {
      const transform = `rotateX(${
        pitch + Math.PI / 2
      }rad) rotateZ(${-heading}rad)`;
      setTransform(transform);
    }
  }, [pitch, heading]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="10"
      height="10"
      viewBox="-5 -5 10 10"
      style={{
        width: "100%",
        height: "100%",
        transformOrigin: "center",
        transform,
        transformStyle: "preserve-3d",
      }}
    >
      <path d="M0,-5 L2,0 L-2,0 Z" fill={northColor} />
      <path d="M0,5 L-2 ,0 L2,0 Z" fill={neutralColor} />
      <circle cx="0" cy="0" r="0.7" fill="#333" />
    </svg>
  );
};

const getOrbitPoint = (viewerRef: React.RefObject<Viewer | null>) => {
  if (!viewerRef.current) return;
  const scene = viewerRef.current.scene;
  const screenCenter = new Cartesian2(
    scene.canvas.clientWidth / 2,
    scene.canvas.clientHeight / 2
  );
  const ray = scene.camera.getPickRay(screenCenter);
  const target = scene.globe.pick(ray, scene);
  return target;
};

/**
 * @minPitch pitch angle in radians starting from Nadir -90 to -0, should be left at -90
 * @maxPitch pitch angle in radians starting from Nadir -90 to -0 is flat with terrain and should be avoided.
 * @durationReset
 * @pitchFactor
 * @headingFactor
 */

const RotateButton: React.FC<RotateButtonProps> = ({
  viewerRef,
  minPitch = CesiumMath.toRadians(-90),
  maxPitch = CesiumMath.toRadians(-10),
  durationReset = 1500,
  pitchFactor = 1,
  headingFactor = 1,
}) => {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialMouseY, setInitialMouseY] = useState(0);
  const [initialHeading, setInitialHeading] = useState<number>(0);
  const [initialPitch, setInitialPitch] = useState<number>(0);
  const [initialRange, setInitialRange] = useState<number>(100);
  const [currentPitch, setCurrentPitch] = useState(0);
  const [currentHeading, setCurrentHeading] = useState(0);

  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    setIsMouseDown(true);
    setInitialMouseX(event.clientX);
    setInitialMouseY(event.clientY);
    if (viewerRef.current) {
      setInitialHeading(viewerRef.current.camera.heading);
      setInitialPitch(viewerRef.current.scene.camera.pitch);
      setCurrentPitch(viewerRef.current.scene.camera.pitch);
      setCurrentHeading(viewerRef.current.camera.heading);

      const target = getOrbitPoint(viewerRef);
      if (target) {
        const range = Cartesian3.distance(
          target,
          viewerRef.current.camera.positionWC
        );
        setInitialRange(range);
      }
    }
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
    if (viewerRef.current && initialHeading !== null) {
      const scene = viewerRef.current.scene;
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isMouseDown) return;
    if (viewerRef.current) {
      const deltaX = event.clientX - initialMouseX;
      const deltaY = event.clientY - initialMouseY;
      const headingChange = (deltaX * 0.01 * headingFactor) % CesiumMath.TWO_PI;
      const newHeading =
        ((initialHeading || 0) + headingChange) % CesiumMath.TWO_PI;
      // default pitch direction is same as maplibre
      const pitchChange = (-deltaY * 0.01 * pitchFactor) % CesiumMath.TWO_PI;
      const newPitchRaw =
        ((initialPitch || 0) + pitchChange) % CesiumMath.TWO_PI;
      const newPitch = CesiumMath.clamp(newPitchRaw, minPitch, maxPitch);
      const target = getOrbitPoint(viewerRef);

      if (target && initialRange !== null) {
        viewerRef.current.scene.camera.lookAt(
          target,
          new HeadingPitchRange(newHeading, newPitch, initialRange)
        );
      }

      setInitialMouseX(event.clientX);
      setInitialMouseY(event.clientY);
      setCurrentPitch(newPitch);
      setCurrentHeading(newHeading);
    }
  };

  const animateCamera = (
    target: Cartesian3,
    targetHeading: number,
    targetPitch: number,
    duration: number
  ) => {
    const startTime = performance.now();
    const startHeading = viewerRef.current?.scene.camera.heading || 0;
    const startPitch = viewerRef.current?.scene.camera.pitch || 0;

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const easeInOutQuad = t * (2 - t);

      let headingDifference = targetHeading - startHeading;
      if (headingDifference > Math.PI) headingDifference -= 2 * Math.PI;
      if (headingDifference < -Math.PI) headingDifference += 2 * Math.PI;

      const currentHeading = startHeading + headingDifference * easeInOutQuad;
      const currentPitch =
        startPitch + (targetPitch - startPitch) * easeInOutQuad;

      viewerRef.current?.scene.camera.lookAt(
        target,
        new HeadingPitchRange(currentHeading, currentPitch, initialRange || 0)
      );

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        viewerRef.current?.scene.camera.lookAtTransform(Matrix4.IDENTITY);
      }
    };
    requestAnimationFrame(animate);
  };

  const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (viewerRef.current && initialRange !== null) {
      const orbitPoint = getOrbitPoint(viewerRef);
      if (orbitPoint) {
        const isDoubleClick = event.detail === 2;
        const targetPitch = CesiumMath.toRadians(
          isDoubleClick ? PITCH.ORTHO : PITCH.OBLIQUE
        );
        animateCamera(orbitPoint, 0, targetPitch, durationReset);
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

  useEffect(() => {
    if (viewerRef.current) {
      const scene = viewerRef.current.scene;
      const updateTransform = () => {
        setCurrentPitch(scene.camera.pitch);
        setCurrentHeading(scene.camera.heading);
      };
      scene.postRender.addEventListener(updateTransform);

      return () => {
        scene.postRender.removeEventListener(updateTransform);
      };
    }
  }, [viewerRef]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isMouseDown]);

  useEffect(() => {
    if (viewerRef.current) {
      const camera = viewerRef.current.scene.camera;
      const updateOrientation = () => {
        setCurrentPitch(camera.pitch);
        setCurrentHeading(camera.heading);
      };
      camera.changed.addEventListener(updateOrientation);

      return () => {
        camera.changed.removeEventListener(updateOrientation);
      };
    }
  }, [viewerRef]);

  return (
    <button
      className="cesium-orbit-control-button"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleButtonClick}
      style={{
        border: "none",
        background: "transparent",
        // TODO make sizing responsive to container size
        width: "38px",
        height: "38px",
        display: "flex",
        margin: "-4px",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <CompassNeedleSVG pitch={currentPitch} heading={currentHeading} />
    </button>
  );
};

export default RotateButton;
