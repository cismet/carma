import type { RefObject } from "react";

export type LabelOverlayFrameSubscription = (
  updateFn: () => void
) => void | (() => void);

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
  subscribeFrame: LabelOverlayFrameSubscription;
  hasViewChanged?: LabelOverlayViewChangeProbe;
  forceLayoutOnPortalRender?: boolean;
};
