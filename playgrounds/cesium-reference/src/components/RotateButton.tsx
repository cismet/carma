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
}

const RotateButton: React.FC<RotateButtonProps> = ({
  viewerRef,
  minPitch = CesiumMath.toRadians(-70),
  maxPitch = CesiumMath.toRadians(0),
  durationReset = 1500,
}) => {
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialMouseY, setInitialMouseY] = useState(0);
  const [initialHeading, setInitialHeading] = useState<number | null>(null);
  const [initialPitch, setInitialPitch] = useState<number | null>(null);
  const [initialRange, setInitialRange] = useState<number | null>(null);
  const [startPitch, setStartPitch] = useState(0);
  const [startHeading, setStartHeading] = useState(0);

  const handleMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    setIsMouseDown(true);
    setInitialMouseX(event.clientX);
    setInitialMouseY(event.clientY);
    if (viewerRef.current) {
      setInitialHeading(viewerRef.current.camera.heading);
      setInitialPitch(viewerRef.current.scene.camera.pitch);
      setStartPitch(viewerRef.current.scene.camera.pitch);
      setStartHeading(viewerRef.current.camera.heading);
      const cameraPosition = viewerRef.current.camera.positionCartographic;
      const target = viewerRef.current.scene.globe.pick(
        viewerRef.current.camera.getPickRay(
          new Cartesian2(
            viewerRef.current.scene.canvas.clientWidth / 2,
            viewerRef.current.scene.canvas.clientHeight / 2
          )
        ),
        viewerRef.current.scene
      );
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
      const headingChange = (deltaX * 0.01) % CesiumMath.TWO_PI;
      const newHeading =
        ((initialHeading || 0) + headingChange) % CesiumMath.TWO_PI;
      const pitchChange = (deltaY * 0.01) % CesiumMath.TWO_PI;
      const newPitch = CesiumMath.clamp(
        ((initialPitch || 0) + pitchChange) % CesiumMath.TWO_PI,
        minPitch,
        maxPitch
      );

      const scene = viewerRef.current.scene;
      const screenCenter = new Cartesian2(
        scene.canvas.clientWidth / 2,
        scene.canvas.clientHeight / 2
      );
      const ray = scene.camera.getPickRay(screenCenter);
      const target = scene.globe.pick(ray, scene);

      if (target && initialRange !== null) {
        scene.camera.lookAt(
          target,
          new HeadingPitchRange(newHeading, newPitch, initialRange)
        );
      }

      setInitialMouseX(event.clientX);
      setInitialMouseY(event.clientY);
      setStartPitch(newPitch);
      setStartHeading(newHeading);
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

  const handleButtonClick = () => {
    if (viewerRef.current && initialRange !== null) {
      const scene = viewerRef.current.scene;
      const screenCenter = new Cartesian2(
        scene.canvas.clientWidth / 2,
        scene.canvas.clientHeight / 2
      );
      const ray = scene.camera.getPickRay(screenCenter);
      const target = scene.globe.pick(ray, scene);

      if (target) {
        animateCamera(target, 0, CesiumMath.toRadians(-45), durationReset);
      }
    }
  };

  useEffect(() => {
    if (viewerRef.current) {
      const updateTransform = () => {
        setStartPitch(viewerRef.current.scene.camera.pitch);
        setStartHeading(viewerRef.current.scene.camera.heading);
      };
      const scene = viewerRef.current.scene;
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

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleButtonClick}
      style={{
        width: "50px",
        height: "50px",
        borderRadius: "50%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `rotateX(${
            startPitch + Math.PI / 2
          }rad) rotateZ(${-startHeading}rad)`,
          transformStyle: "preserve-3d",
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderBottom: "15px solid #c74",
            position: "absolute",
            left: "50%",
            bottom: "50%",
            transform: "translateX(-50%)",
          }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderTop: "15px solid #ccc",
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: "50%",
          }}
        />
      </div>
    </button>
  );
};

export default RotateButton;
