import { useEffect, useState } from "react";
import type { Viewer } from "cesium";

const useCameraElevation = (viewer: Viewer | null, threshold: number = 1000) => {
  const [cameraElevation, setCameraElevation] = useState<number>(0);
  const [isAboveThreshold, setIsAboveThreshold] = useState<boolean>(false);

  useEffect(() => {
    if (!viewer) return;

    let frameRequestId: number;

    const updateCameraElevation = () => {
      const cameraPosition = viewer.camera.positionCartographic;
      if (cameraPosition) {
        const elevation = cameraPosition.height;
        setCameraElevation(elevation);
        setIsAboveThreshold(elevation > threshold);
      }
      
      // Continue monitoring on next frame
      frameRequestId = requestAnimationFrame(updateCameraElevation);
    };

    // Start monitoring
    updateCameraElevation();

    // Cleanup function
    return () => {
      if (frameRequestId) {
        cancelAnimationFrame(frameRequestId);
      }
    };
  }, [viewer, threshold]);

  return {
    cameraElevation,
    isAboveThreshold,
  };
};

export default useCameraElevation;
