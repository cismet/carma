import type { RefObject } from "react";

export type LabelOverlayFrameSubscription = (
  updateFn: () => void
) => void | (() => void);

/** Stateful probe that consumes the host's view-change signal once per frame. */
export type LabelOverlayViewChangeProbe = () => boolean;

export type LabelOverlayHostBinding = {
  kind?: string;
  instanceId?: string;
  containerRef: RefObject<HTMLElement | null>;
  subscribeFrame: LabelOverlayFrameSubscription;
  probeViewChange?: LabelOverlayViewChangeProbe;
  forceLayoutOnPortalRender?: boolean;
};
