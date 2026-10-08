import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { CardinalDirection, ObliqueGroundTarget } from "../../core/types";
import { groundDistanceM } from "../utils/cameraMath";
import type { PreparedObliqueNavigationTarget } from "./useObliqueNavigationTargets";

export type SeamlessPreviewView = {
  imageId: string;
  sector: CardinalDirection;
  target: ObliqueGroundTarget;
  epoch: number;
  /** Normalized distance from the centre point to the closest sensor edge. */
  centerMargin: number;
  /** Normalized distance from the requested viewport crop to the closest sensor edge. */
  viewportMargin: number;
};
export type SeamlessPreviewCandidate = {
  step: PreparedObliqueNavigationTarget;
  centerMargin: number;
};
type Options = {
  enabled: boolean;
  busyRef: MutableRefObject<boolean>;
  readTarget: () => ObliqueGroundTarget | null;
  readView: () => Promise<SeamlessPreviewView | null>;
  findCandidates: (
    view: SeamlessPreviewView
  ) => Promise<readonly SeamlessPreviewCandidate[]>;
  isCurrent: (view: SeamlessPreviewView) => boolean;
  navigate: (step: PreparedObliqueNavigationTarget) => Promise<unknown>;
};
const distance = (a: ObliqueGroundTarget, b: ObliqueGroundTarget) =>
  groundDistanceM(
    { lng: a.longitude, lat: a.latitude },
    { lng: b.longitude, lat: b.latitude }
  );

/** Only explicit completed drags may advance; camera flights never schedule another step. */
export const useSeamlessPreviewNavigation = (options: Options) => {
  const current = useRef(options);
  current.current = options;
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const panStart = useRef<ObliqueGroundTarget | null>(null);
  const lastTransition = useRef<{
    from: string;
    to: string;
    target: ObliqueGroundTarget;
    at: number;
  } | null>(null);
  const cancel = useCallback(() => {
    generation.current++;
    clearTimeout(timer.current);
    timer.current = undefined;
    panStart.current = null;
  }, []);
  useEffect(() => {
    if (!options.enabled) {
      cancel();
      lastTransition.current = null;
    }
    return cancel;
  }, [options.enabled, cancel]);
  const onPanStart = useCallback(() => {
    cancel();
    const o = current.current;
    if (o.enabled && !o.busyRef.current) panStart.current = o.readTarget();
  }, [cancel]);
  const onPanEnd = useCallback(() => {
    const start = panStart.current;
    panStart.current = null;
    if (!start) return;
    clearTimeout(timer.current);
    const request = ++generation.current;
    timer.current = setTimeout(() => {
      const run = async () => {
        const o = current.current;
        const valid = () =>
          request === generation.current &&
          current.current.enabled &&
          !o.busyRef.current;
        if (!valid()) return;
        const view = await o.readView();
        if (
          !valid() ||
          !view ||
          !o.isCurrent(view) ||
          distance(start, view.target) < 0.5 ||
          !Number.isFinite(view.centerMargin + view.viewportMargin) ||
          view.centerMargin < 0 ||
          view.viewportMargin > 0.04
        )
          return;
        const candidates = await o.findCandidates(view);
        if (!valid() || !o.isCurrent(view)) return;
        const previous = lastTransition.current;
        const next = candidates.find(
          ({ step, centerMargin }) =>
            step.originImageId === view.imageId &&
            step.candidate.record.id !== view.imageId &&
            step.candidate.record.sector === view.sector &&
            step.candidate.coversTarget === true &&
            Number.isFinite(centerMargin) &&
            centerMargin >= 0.2 &&
            centerMargin >= view.centerMargin + 0.1 &&
            !(
              previous?.to === view.imageId &&
              previous.from === step.candidate.record.id &&
              (Date.now() - previous.at < 1800 ||
                distance(previous.target, view.target) < 10)
            )
        );
        if (!next) return;
        lastTransition.current = {
          from: view.imageId,
          to: next.step.candidate.record.id,
          target: view.target,
          at: Date.now(),
        };
        await o.navigate(next.step);
      };
      // An optional continuation never turns an unavailable catalog/photo into a viewer error.
      void run().catch(() => undefined);
    }, 140);
  }, []);
  return { onPanStart, onPanEnd, cancel };
};
