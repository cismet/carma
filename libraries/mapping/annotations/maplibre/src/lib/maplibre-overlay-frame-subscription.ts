import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import type { LabelOverlayFrameSubscription } from "@carma-providers/label-overlay";

/** MapLibre's label layout phase, before scene-marker/stem pre-render placement. */
const subscriptions = new WeakMap<
  AnnotationEngine,
  LabelOverlayFrameSubscription
>();

export const registerMapLibreOverlayFrameSubscription = (
  engine: AnnotationEngine,
  subscribe: LabelOverlayFrameSubscription
): (() => void) => {
  subscriptions.set(engine, subscribe);
  return () => {
    subscriptions.delete(engine);
  };
};

export const readMapLibreOverlayFrameSubscription = (
  engine: AnnotationEngine | null | undefined
): LabelOverlayFrameSubscription | undefined =>
  engine ? subscriptions.get(engine) : undefined;
