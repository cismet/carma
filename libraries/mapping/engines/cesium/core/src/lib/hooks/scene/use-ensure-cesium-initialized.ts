import { useCallback } from "react";
import { Cartesian3, HeadingPitchRange, isValidScene } from "@carma/cesium";

import { useCesiumContext } from "../../context/hooks/use-cesium-context";
import { CtxEvent } from "../../context/cesium-context-event-map";
import { promiseWithTimeout } from "@carma-commons/utils";
import { waitForAnimationFrames } from "@carma-commons/dom/window";

export type InitialCesiumPosition = {
  latitude: number;
  longitude: number;
  orientation: HeadingPitchRange;
};

/**
 * Hook that provides a method to ensure Cesium is initialized.
 * If already initialized, returns immediately.
 * If not, initializes at the provided position and waits for scene ready.
 */
export const useEnsureCesiumInitialized = () => {
  const {
    sceneRef,
    homeRef,
    emit: emitCesiumEvent,
    subscribe,
  } = useCesiumContext();

  const ensureInitialized = useCallback(
    async (initialPosition: InitialCesiumPosition) => {
      const scene = sceneRef.current;

      // Already initialized
      if (isValidScene(scene)) {
        console.debug("[Cesium|Init] Scene already initialized");
        return;
      }

      console.debug(
        "[Cesium|Init] Initializing Cesium at position",
        initialPosition
      );

      const { latitude, longitude, orientation } = initialPosition;

      // Set home position for Cesium initialization
      const target = Cartesian3.fromDegrees(longitude, latitude);
      homeRef.current = { target, orientation };

      console.debug("[Cesium|Init] Set home position", {
        latitude,
        longitude,
        heading: orientation.heading,
        pitch: orientation.pitch,
        range: Math.round(orientation.range),
      });

      // Activate Cesium
      emitCesiumEvent(CtxEvent.Activate, {
        source: "ensure-cesium-initialized",
        component: "use-ensure-cesium-initialized",
        reason: "Initial Cesium setup",
      });

      // Wait for scene ready
      await promiseWithTimeout(
        new Promise<void>((resolve) => {
          const unsubscribe = subscribe(CtxEvent.SceneReady, () => {
            console.debug("[Cesium|Init] Scene ready");
            unsubscribe();
            resolve();
          });
        }),
        5000,
        "Cesium initialization timeout"
      );

      // Request initial render
      const initializedScene = sceneRef.current;
      if (isValidScene(initializedScene)) {
        initializedScene.requestRender();
        try {
          await promiseWithTimeout(waitForAnimationFrames(1), 500, {
            timeoutValue: undefined,
          });
          console.debug("[Cesium|Init] Initial render completed");
        } catch (err) {
          console.warn("[Cesium|Init] Initial render timeout:", err);
        }
      }
    },
    [sceneRef, homeRef, emitCesiumEvent, subscribe]
  );

  return { ensureInitialized };
};
