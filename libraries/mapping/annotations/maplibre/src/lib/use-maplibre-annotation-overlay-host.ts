import { useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayMountConfig,
} from "@carma-mapping/annotations/runtime";
import type { LabelOverlayHostBinding } from "@carma-providers/label-overlay";

import { useMapLibreLabelOverlayHost } from "./use-maplibre-label-overlay-host";

/**
 * Where the runtime's DOM overlays mount on a MapLibre map (its container)
 * and the label-overlay host bound to the label root the runtime renders in
 * there, retried per animation frame until it exists. The MapLibre counterpart
 * of the geoportal's `useGeoportalCesiumAnnotationOverlayHost`; hosts hand
 * `overlayContainer` and `overlayHost` to the `AnnotationsProvider`.
 */
export const useMapLibreAnnotationOverlayHost = (
  map: MaplibreMap | null
): {
  overlayContainer: HTMLElement | null;
  overlayHost: LabelOverlayHostBinding;
  /** The label root exists; labels mounted before it would never place. */
  ready: boolean;
} => {
  const labelOverlayRootRef = useRef<HTMLElement | null>(null);
  const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(
    null
  );
  const [ready, setReady] = useState(false);
  const overlayHost = useMapLibreLabelOverlayHost({
    map,
    containerRef: labelOverlayRootRef,
  });
  useEffect(() => {
    if (!map) {
      labelOverlayRootRef.current = null;
      setOverlayContainer(null);
      setReady(false);
      return;
    }
    let frameId = 0;
    const { rootSelector: labelRootSelector } =
      resolveAnnotationOverlayMountConfig(ANNOTATION_OVERLAY_GROUP.LABEL);
    const syncContainer = () => {
      const nextContainer = map.getContainer();
      setOverlayContainer(nextContainer);
      const nextLabelOverlayRoot =
        nextContainer?.querySelector(labelRootSelector);
      labelOverlayRootRef.current =
        nextLabelOverlayRoot instanceof HTMLElement
          ? nextLabelOverlayRoot
          : null;
      if (!nextContainer || !labelOverlayRootRef.current) {
        setReady(false);
        frameId = window.requestAnimationFrame(syncContainer);
        return;
      }
      setReady(true);
    };
    syncContainer();
    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [map]);
  return { overlayContainer, overlayHost, ready };
};
