import { useCallback, type RefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { MAPLIBRE_EVENT } from "@carma-mapping/engines/maplibre";
import {
  useLabelOverlayHost,
  type LabelOverlayFrameSubscription,
  type LabelOverlayHostBinding,
} from "@carma-providers/label-overlay";

type UseMapLibreLabelOverlayHostOptions = {
  map: MaplibreMap | null;
  containerRef: RefObject<HTMLElement | null>;
  kind?: string;
  instanceId?: string;
  forceLayoutOnPortalRender?: boolean;
  /** A scene annotation host lays out in its frame phase before marker/stem placement. */
  layoutFrameSubscription?: LabelOverlayFrameSubscription;
};

/**
 * The label overlay re-lays out after every map frame and asks the map for
 * one when it needs a frame of its own.
 */
export const useMapLibreLabelOverlayHost = ({
  map,
  containerRef,
  kind = "maplibre",
  instanceId,
  forceLayoutOnPortalRender = true,
  layoutFrameSubscription,
}: UseMapLibreLabelOverlayHostOptions): LabelOverlayHostBinding => {
  const subscribeFrame = useCallback<LabelOverlayFrameSubscription>(
    (updateFn) => {
      if (layoutFrameSubscription) return layoutFrameSubscription(updateFn);
      if (!map) {
        return;
      }
      map.on(MAPLIBRE_EVENT.RENDER, updateFn);
      return () => {
        map.off(MAPLIBRE_EVENT.RENDER, updateFn);
      };
    },
    [map, layoutFrameSubscription]
  );

  return useLabelOverlayHost({
    kind,
    instanceId,
    containerRef,
    subscribeFrame,
    forceLayoutOnPortalRender,
  });
};
