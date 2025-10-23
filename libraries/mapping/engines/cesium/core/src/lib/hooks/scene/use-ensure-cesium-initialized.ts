import { useCallback } from "react";
import { HeadingPitchRange, isValidScene } from "@carma/cesium";

import { useCesiumContext } from "../../context/hooks/use-cesium-context";
import { CtxEvent } from "../../context/cesium-context-event-map";
import { promiseWithTimeout } from "@carma-commons/utils";
import { waitForAnimationFrames } from "@carma-commons/dom/window";

export type InitialCesiumPosition = {
  latitude: number;
  longitude: number;
  orientation: HeadingPitchRange;
};

export type EnsureInitializedOptions = {
  /**
   * Wait for terrain provider to be loaded before resolving.
   * This ensures terrain elevation sampling will work reliably.
   * @default false
   */
  waitForTerrain?: boolean;
};

/**
 * Hook that provides a method to ensure Cesium is initialized.
 * If already initialized, returns immediately.
 * If not, initializes at the provided position and waits for scene ready.
 */
export const useEnsureCesiumInitialized = () => {
  const {
    sceneRef,
    homeCameraRef,
    emit: emitCesiumEvent,
    subscribe,
  } = useCesiumContext();

  const ensureInitialized = useCallback(
    async (
      initialPosition: InitialCesiumPosition,
      options?: EnsureInitializedOptions
    ) => {
      const { waitForTerrain = false } = options ?? {};
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

      console.debug("[Cesium|Init] Initializing at position", {
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
        { onTimeoutResolveWith: () => undefined }
      );

      // Optionally wait for terrain to be loaded
      if (waitForTerrain) {
        console.debug("[Cesium|Init] Waiting for terrain provider...");
        await promiseWithTimeout(
          new Promise<void>((resolve) => {
            const unsubscribe = subscribe(CtxEvent.TerrainReady, ({ id }) => {
              console.debug(`[Cesium|Init] Terrain ready: ${id}`);
              unsubscribe();
              resolve();
            });
          }),
          3000,
          { onTimeoutResolveWith: () => undefined }
        );
      }

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
    [sceneRef, emitCesiumEvent, subscribe]
  );

  return { ensureInitialized };
};
