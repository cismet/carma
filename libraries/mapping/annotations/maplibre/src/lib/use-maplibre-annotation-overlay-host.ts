import { useEffect, useMemo, useState, type RefObject } from "react";
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
  // Read live: the runtime may remount its overlay roots, and a ref filled
  // once would keep pointing at the detached old label root.
  const labelOverlayRootRef = useMemo<RefObject<HTMLElement | null>>(() => {
    const { rootSelector } = resolveAnnotationOverlayMountConfig(
      ANNOTATION_OVERLAY_GROUP.LABEL
    );
    return {
      get current() {
        const root = map?.getContainer()?.querySelector(rootSelector);
        return root instanceof HTMLElement ? root : null;
      },
    };
  }, [map]);
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
      setOverlayContainer(null);
      setReady(false);
      return;
    }
    let frameId = 0;
    const syncContainer = () => {
      const nextContainer = map.getContainer();
      setOverlayContainer(nextContainer);
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
  }, [labelOverlayRootRef, map]);
  return { overlayContainer, overlayHost, ready };
};
