import { useCallback } from "react";

import { useCesiumContext } from "../../context";

export const useHomeControl = () => {
  const { sceneRef, homeCamera } = useCesiumContext();

  const handleHomeClick = useCallback(() => {
    const home = homeCamera.current;
    const scene = sceneRef.current;

    console.log("[HOME CONTROL] Home button clicked", {
      hasHome: !!home,
      hasScene: !!scene,
    });

    if (!home || !scene || scene.isDestroyed?.()) {
      console.warn(
        "[HOME CONTROL] Cannot fly home - missing scene or home config"
      );
      return;
    }

    // Direct camera positioning - no event system needed
    console.log("[HOME CONTROL] Flying to home position");
    // Camera positioning will be handled by direct scene manipulation
    // This is a placeholder - actual implementation would use scene.camera.setView
  }, [sceneRef, homeCamera]);

  return handleHomeClick;
};
