import type { RefObject } from "react";

import type { CssPixelPosition } from "@carma-units";

import type { LabelOverlayWorldAnchor } from "./types";

export type LabelOverlayFrameSubscription = (
  updateFn: () => void
) => void | (() => void);

/**
 * Engine-specific projection of a world anchor to a screen position, supplied by
 * the host (e.g. Cesium SceneTransforms.worldToWindowCoordinates). Returns null
 * when the anchor is not currently on screen. Lets the engine-agnostic provider
 * position `worldAnchor` elements without depending on the engine itself.
 */
export type LabelOverlayWorldAnchorProjector = (
  anchor: LabelOverlayWorldAnchor
) => CssPixelPosition | null;

export type LabelOverlayHostBinding = {
  kind?: string;
  instanceId?: string;
  containerRef: RefObject<HTMLElement | null>;
  subscribeFrame?: LabelOverlayFrameSubscription;
  projectWorldAnchor?: LabelOverlayWorldAnchorProjector;
  forceLayoutOnPortalRender?: boolean;
};
