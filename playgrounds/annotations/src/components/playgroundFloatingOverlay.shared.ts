import { clearCesiumScenePointerTracker } from "@carma-mapping/engines/cesium/react/interactions";
import { type Scene } from "@carma-cesium";

import {
  PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
  PLAYGROUND_UI_Z_INDEX,
} from "../playgroundConfig";

export const PLAYGROUND_FLOATING_OVERLAY_ROOT_ATTRIBUTE =
  "data-annotation-floating-overlay-root";
export const PLAYGROUND_FLOATING_OVERLAY_ROOT_SELECTOR = `[${PLAYGROUND_FLOATING_OVERLAY_ROOT_ATTRIBUTE}="true"]`;

export const PLAYGROUND_TOOLBAR_FLOATING_STYLE = {
  position: "absolute",
  top: 12,
  left: 72,
  right: 12,
  zIndex: PLAYGROUND_UI_Z_INDEX,
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
} as const;

export const PLAYGROUND_SELECTION_INFO_BOX_FLOATING_STYLE = {
  position: "absolute",
  bottom: PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
  right: PLAYGROUND_FLOATING_OVERLAY_WINDOW_MARGIN_PX,
  zIndex: PLAYGROUND_UI_Z_INDEX,
  pointerEvents: "auto",
  isolation: "isolate",
} as const;

export const clearPlaygroundPointerQueryPreview = (scene: Scene | null) => {
  if (!scene || scene.isDestroyed()) {
    return;
  }

  clearCesiumScenePointerTracker(scene);
  scene.requestRender();
};

export const createPlaygroundFloatingOverlayInteractionProps = (
  scene: Scene | null
) => ({
  [PLAYGROUND_FLOATING_OVERLAY_ROOT_ATTRIBUTE]: "true",
  onPointerEnter: () => clearPlaygroundPointerQueryPreview(scene),
  onPointerMove: () => clearPlaygroundPointerQueryPreview(scene),
  onPointerDown: () => clearPlaygroundPointerQueryPreview(scene),
});

export const resolvePlaygroundFloatingOverlayTooltipContainer = (
  triggerNode: HTMLElement
) =>
  (triggerNode.closest(
    PLAYGROUND_FLOATING_OVERLAY_ROOT_SELECTOR
  ) as HTMLElement | null) ?? triggerNode.ownerDocument.body;
