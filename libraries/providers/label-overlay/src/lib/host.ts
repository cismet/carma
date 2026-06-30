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

/**
 * Reports — and consumes — whether the engine view (camera pose, frustum) changed
 * since the previous call. Lets the per-frame overlay loop skip re-projecting every
 * element when a frame was rendered for some other reason (e.g. an idle pointer-move
 * `requestRender`) and nothing the overlay depends on actually moved. Stateful:
 * call it once per frame. Omit it to always reproject (the safe default).
 */
export type LabelOverlayViewChangeProbe = () => boolean;

export type LabelOverlayHostBinding = {
  kind?: string;
  instanceId?: string;
  containerRef: RefObject<HTMLElement | null>;
  subscribeFrame?: LabelOverlayFrameSubscription;
  projectWorldAnchor?: LabelOverlayWorldAnchorProjector;
  hasViewChanged?: LabelOverlayViewChangeProbe;
  forceLayoutOnPortalRender?: boolean;
};
