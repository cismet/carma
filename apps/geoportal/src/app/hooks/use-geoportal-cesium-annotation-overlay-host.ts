import { useEffect, useMemo, useState, type RefObject } from "react";

import {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayMountConfig,
} from "@carma-mapping/annotations/runtime";
import { useCesiumLabelOverlayHost } from "@carma-mapping/engines/cesium/react/interactions";
import type { Scene } from "@carma-cesium";
import type { LabelOverlayHostBinding } from "@carma-providers/label-overlay";

import { GEOPORTAL_CESIUM_CONTAINER_ID } from "../components/annotations/cesium-annotations.constants";

const resolveLabelOverlayRoot = (): HTMLElement | null => {
  const { rootSelector } = resolveAnnotationOverlayMountConfig(
    ANNOTATION_OVERLAY_GROUP.LABEL
  );
  const root = document
    .getElementById(GEOPORTAL_CESIUM_CONTAINER_ID)
    ?.querySelector(rootSelector);
  return root instanceof HTMLElement ? root : null;
};

export const useGeoportalCesiumAnnotationOverlayHost = (
  scene: Scene | null
): {
  overlayContainer: HTMLElement | null;
  overlayHost: LabelOverlayHostBinding;
} => {
  const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(
    null
  );
  // Read live: the runtime may remount its overlay roots, and a ref filled once
  // would keep pointing at the detached old label root.
  const labelOverlayRootRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return resolveLabelOverlayRoot();
      },
    }),
    []
  );
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: labelOverlayRootRef,
  });

  useEffect(() => {
    let frameId = 0;

    const syncContainer = () => {
      const nextContainer = document.getElementById(
        GEOPORTAL_CESIUM_CONTAINER_ID
      );
      setOverlayContainer(nextContainer);

      if (!nextContainer || !resolveLabelOverlayRoot()) {
        frameId = window.requestAnimationFrame(syncContainer);
      }
    };

    syncContainer();

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [scene]);

  return {
    overlayContainer,
    overlayHost,
  };
};
