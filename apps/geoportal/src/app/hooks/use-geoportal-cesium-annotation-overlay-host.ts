import { useEffect, useRef, useState } from "react";

import {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayMountConfig,
} from "@carma-mapping/annotations/runtime";
import { useCesiumLabelOverlayHost } from "@carma-mapping/engines/cesium/react/interactions";
import type { Scene } from "@carma-cesium";
import type { LabelOverlayHostBinding } from "@carma-providers/label-overlay";

import { GEOPORTAL_CESIUM_CONTAINER_ID } from "../components/annotations/cesium-annotations.constants";

export const useGeoportalCesiumAnnotationOverlayHost = (
  scene: Scene | null
): {
  overlayContainer: HTMLElement | null;
  overlayHost: LabelOverlayHostBinding;
} => {
  const labelOverlayRootRef = useRef<HTMLElement | null>(null);
  const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(
    null
  );
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: labelOverlayRootRef,
  });

  useEffect(() => {
    let frameId = 0;
    const { rootSelector: labelRootSelector } =
      resolveAnnotationOverlayMountConfig(ANNOTATION_OVERLAY_GROUP.LABEL);

    const syncContainer = () => {
      const nextContainer = document.getElementById(
        GEOPORTAL_CESIUM_CONTAINER_ID
      );
      setOverlayContainer(nextContainer);

      const nextLabelOverlayRoot =
        nextContainer?.querySelector(labelRootSelector);
      labelOverlayRootRef.current =
        nextLabelOverlayRoot instanceof HTMLElement
          ? nextLabelOverlayRoot
          : null;

      if (!nextContainer || !labelOverlayRootRef.current) {
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
