import {
  getPointLabelOverlayContentSignature,
  renderPointLabelOverlayContent,
} from "./point-label-overlay-content";
import {
  applyPointLabelOverlayState,
  readPointLabelOverlayDomRefs,
} from "./point-label-overlay-dom";
import {
  transientPointLabelOverlayDefaults,
  type PointLabelOverlayDomRefs,
  type PointLabelOverlayRenderState,
  type TransientPointLabelController,
} from "./point-label-overlay-state";
import type { LabelOverlayContextType } from "./types";

/**
 * Mounts one point label on the overlay and re-renders React content only when
 * its content signature changes; position and stem are updated per frame.
 */
export const createTransientPointLabelController = ({
  labelOverlay,
  overlayId,
  requestRender,
  deferLayout = false,
}: {
  labelOverlay: LabelOverlayContextType;
  overlayId: string;
  requestRender?: () => void;
  /** Scene-annotation hosts already lay out on their renderer's frame; other hosts stay synchronous. */
  deferLayout?: boolean;
}): TransientPointLabelController => {
  let mounted = false;
  let destroyed = false;
  let currentState: PointLabelOverlayRenderState | null = null;
  let currentContentSignature: string | null = null;
  let cachedDomRefs: PointLabelOverlayDomRefs | null = null;

  const updatePosition = (elementDiv: HTMLElement) => {
    if (!currentState) {
      return false;
    }

    const domRefs =
      cachedDomRefs &&
      cachedDomRefs.stem.isConnected &&
      cachedDomRefs.stemLine.isConnected &&
      cachedDomRefs.labelRoot.isConnected &&
      cachedDomRefs.pointLabelRoot.isConnected
        ? cachedDomRefs
        : readPointLabelOverlayDomRefs(elementDiv);

    if (!domRefs) {
      return false;
    }

    cachedDomRefs = domRefs;
    return applyPointLabelOverlayState({
      elementDiv,
      domRefs,
      state: currentState,
    });
  };

  const refreshOverlayPositions = () => {
    if (deferLayout) labelOverlay.invalidatePositions();
    else labelOverlay.updatePositions();
  };

  const syncOverlayElement = () => {
    if (destroyed) {
      return;
    }

    if (!currentState) {
      if (mounted) {
        refreshOverlayPositions();
        requestRender?.();
      }
      return;
    }

    const nextContentSignature =
      getPointLabelOverlayContentSignature(currentState);

    if (nextContentSignature !== currentContentSignature) {
      currentContentSignature = nextContentSignature;
      cachedDomRefs = null;
    }

    labelOverlay.setLabelOverlayElement({
      id: overlayId,
      zIndex: currentState.zIndex ?? transientPointLabelOverlayDefaults.zIndex,
      contentKey: nextContentSignature,
      content: renderPointLabelOverlayContent(currentState),
      updatePosition,
    });
    mounted = true;
    refreshOverlayPositions();
    requestRender?.();
  };

  return {
    setState: (state) => {
      currentState = state;
      syncOverlayElement();
    },
    destroy: () => {
      if (destroyed) {
        return;
      }

      destroyed = true;
      currentState = null;
      currentContentSignature = null;
      cachedDomRefs = null;

      if (!mounted) {
        return;
      }

      mounted = false;
      labelOverlay.removeLabelOverlayElement(overlayId);
    },
  };
};
