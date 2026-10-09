import { useEffect, useState, type RefObject } from "react";

import {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayMountConfig,
} from "@carma-mapping/annotations/runtime";
import { useCesiumLabelOverlayHost } from "@carma-mapping/engines/cesium/react/interactions";
import type { Scene } from "@carma-cesium";
import type { LabelOverlayHostBinding } from "@carma-providers/label-overlay";

import { GEOPORTAL_CESIUM_CONTAINER_ID } from "../components/annotations/cesium-annotations.constants";

// Read live: the runtime may remount its overlay roots, and a ref filled once
// would keep pointing at the detached old label root.
const LIVE_LABEL_OVERLAY_ROOT_REF: RefObject<HTMLElement | null> = {
  get current() {
    const { rootSelector } = resolveAnnotationOverlayMountConfig(
      ANNOTATION_OVERLAY_GROUP.LABEL
    );
    const root = document
      .getElementById(GEOPORTAL_CESIUM_CONTAINER_ID)
      ?.querySelector(rootSelector);
    return root instanceof HTMLElement ? root : null;
  },
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
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: LIVE_LABEL_OVERLAY_ROOT_REF,
  });

  useEffect(() => {
    let frameId = 0;

    const syncContainer = () => {
      const nextContainer = document.getElementById(
        GEOPORTAL_CESIUM_CONTAINER_ID
      );
      setOverlayContainer(nextContainer);

      if (!nextContainer || !LIVE_LABEL_OVERLAY_ROOT_REF.current) {
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
