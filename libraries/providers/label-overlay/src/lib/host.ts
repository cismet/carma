import type { RefObject } from "react";

export type LabelOverlayFrameSubscription = (
  updateFn: () => void
) => void | (() => void);

export type LabelOverlayHostBinding = {
  kind?: string;
  instanceId?: string;
  containerRef: RefObject<HTMLElement | null>;
  subscribeFrame?: LabelOverlayFrameSubscription;
  forceLayoutOnPortalRender?: boolean;
};
