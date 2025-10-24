import { useCallback } from "react";

import { useCesiumContext } from "../../context";
import { CtxEvent } from "../../context/cesium-context-event-map";

export const useHomeControl = () => {
  const { sceneRef, emit, homeCamera } = useCesiumContext();

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

    // Emit GoHome event - camera positioning is handled by use-context-setup-subscriptions
    emit(CtxEvent.GoHome, undefined);
  }, [sceneRef, homeCamera, emit]);

  return handleHomeClick;
};
