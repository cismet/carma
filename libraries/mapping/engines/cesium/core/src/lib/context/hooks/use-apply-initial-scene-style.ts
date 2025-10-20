import { useEffect } from "react";
import {
  CtxEvent,
  type SubscribeCesiumCtxFn,
  type EmitCesiumCtxFn,
} from "../cesium-context-event-map";

export const useApplyInitialSceneStyle = (
  subscribe: SubscribeCesiumCtxFn,
  emit: EmitCesiumCtxFn,
  initialStyle: string | undefined
) => {
  useEffect(
    function applyInitialSceneStyle() {
      const unsubscribe = subscribe(CtxEvent.SceneReady, () => {
        if (initialStyle) {
          console.debug(
            "[CesiumContext] Applying initial scene style:",
            initialStyle
          );
          emit(CtxEvent.SetSceneStyle, initialStyle);
        }
      });
      return unsubscribe;
    },
    [subscribe, emit, initialStyle]
  );
};
