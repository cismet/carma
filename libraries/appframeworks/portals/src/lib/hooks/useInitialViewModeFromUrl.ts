import { useEffect } from "react";

import {
  useCesiumContext,
  CtxEvent as CesiumCtxEvent,
} from "@carma-mapping/engines/cesium/core";
import {
  useCarmaTopicMapContext,
  TopicMapCtxEvent,
} from "@carma-mapping/engines/carma-cismap";
import { getHashParams } from "@carma-commons/utils";

export interface UseInitialViewModeFromUrlOptions {
  /**
   * URL parameter key for 3D mode (e.g., "is3d")
   */
  is3dKey: string;
  /**
   * Value that indicates 3D mode is enabled (e.g., "1")
   */
  is3dEnabledValue?: string;
  /**
   * Callback to update app-level UI state
   */
  setUIMode: (isMode2d: boolean) => void;
}

/**
 * Generic hook to initialize view mode (2D/3D) from URL parameters on app load.
 * Coordinates UI state and engine context events.
 *
 * @example
 * ```ts
 * useInitialViewModeFromUrl({
 *   is3dKey: "is3d",
 *   is3dEnabledValue: "1",
 *   setUIMode: (isMode2d) => dispatch(setUIIsMode2d(isMode2d))
 * });
 * ```
 */
export const useInitialViewModeFromUrl = ({
  is3dKey,
  is3dEnabledValue = "1",
  setUIMode,
}: UseInitialViewModeFromUrlOptions) => {
  const { emit: emitCesiumEvent } = useCesiumContext();
  const { emit: emitTopicMapEvent } = useCarmaTopicMapContext();

  useEffect(() => {
    const hashParams = getHashParams();
    const isTo2D = hashParams[is3dKey] !== is3dEnabledValue; // Default to 2D unless explicitly 3D

    // Update app-level UI state via callback
    setUIMode(isTo2D);

    // Emit engine events to coordinate initial state
    if (isTo2D) {
      emitTopicMapEvent(TopicMapCtxEvent.Activate, undefined);
      emitCesiumEvent(CesiumCtxEvent.Suspend, undefined);
      console.debug("[useInitialViewModeFromUrl] Initial mode: 2D");
    } else {
      emitCesiumEvent(CesiumCtxEvent.Activate, undefined);
      emitTopicMapEvent(TopicMapCtxEvent.Suspend, undefined);
      console.debug("[useInitialViewModeFromUrl] Initial mode: 3D");
    }
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
