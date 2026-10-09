import { useCallback, type RefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  useLabelOverlayHost,
  type LabelOverlayFrameSubscription,
  type LabelOverlayHostBinding,
} from "@carma-providers/label-overlay";

import { MAPLIBRE_EVENT } from "./maplibre-events";

type UseMapLibreLabelOverlayHostOptions = {
  map: MaplibreMap | null;
  containerRef: RefObject<HTMLElement | null>;
  kind?: string;
  instanceId?: string;
  forceLayoutOnPortalRender?: boolean;
};

/**
 * MapLibre counterpart of `useCesiumLabelOverlayHost`: the label overlay
 * re-lays out after every map frame and asks the map for one when it needs
 * a frame of its own.
 */
export const useMapLibreLabelOverlayHost = ({
  map,
  containerRef,
  kind = "maplibre",
  instanceId,
  forceLayoutOnPortalRender = true,
}: UseMapLibreLabelOverlayHostOptions): LabelOverlayHostBinding => {
  const subscribeFrame = useCallback<LabelOverlayFrameSubscription>(
    (updateFn) => {
      if (!map) {
        return;
      }
      map.on(MAPLIBRE_EVENT.RENDER, updateFn);
      return () => {
        map.off(MAPLIBRE_EVENT.RENDER, updateFn);
      };
    },
    [map]
  );

  return useLabelOverlayHost({
    kind,
    instanceId,
    containerRef,
    subscribeFrame,
    forceLayoutOnPortalRender,
  });
};
