import { useEffect, useState } from "react";
import type { Viewer } from "cesium";

const useCameraElevation = (viewer: Viewer | null, threshold: number = 1000) => {
  const [cameraElevation, setCameraElevation] = useState<number>(0);
  const [isAboveThreshold, setIsAboveThreshold] = useState<boolean>(false);

  useEffect(() => {
    if (!viewer) return;

    let frameRequestId: number;
    let isActive = true; // Flag to track if effect is still active

    const updateCameraElevation = () => {
      // Add HMR robustness - check if viewer is not destroyed and effect is still active
      if (!isActive || !viewer || viewer.isDestroyed()) {
        return;
      }

      try {
        const cameraPosition = viewer.camera.positionCartographic;
        if (cameraPosition) {
          const elevation = cameraPosition.height;
          setCameraElevation(elevation);
          setIsAboveThreshold(elevation > threshold);
        }
        
        // Continue monitoring on next frame only if still active
        if (isActive) {
          frameRequestId = requestAnimationFrame(updateCameraElevation);
        }
      } catch (error) {
        console.error("[useCameraElevation] Error updating camera elevation:", error);
      }
    };

    // Start monitoring
    updateCameraElevation();

    // Cleanup function
    return () => {
      isActive = false;
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
