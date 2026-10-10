import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Meters } from "@carma-units";
import type { CardinalDirection, ObliqueGroundTarget } from "../../core/types";
import {
  seamlessImageCenterDistance,
  type SeamlessImagePoint,
} from "../../core/utils/seamless-image-center";
import { groundDistanceM } from "../utils/cameraMath";
import type { PreparedObliqueNavigationTarget } from "./useObliqueNavigationTargets";

export type SeamlessPreviewView = {
  imageId: string;
  sector: CardinalDirection;
  target: ObliqueGroundTarget;
  epoch: number;
  /** Optional camera/view signature for host-side freshness checks. */
  viewKey?: string;
  imagePoint: SeamlessImagePoint | null;
  /** Physical ECEF distance from the preferred-ray hit to the shared view target.
   * Undefined selects the legacy UV path; null means the hit is not ready. */
  referenceDistanceMeters?: Meters | null;
};
export type SeamlessPreviewCandidate = {
  /** True when panning moved closer to this photo's configured centre. */
  approaching?: boolean;
  step: PreparedObliqueNavigationTarget;
  imagePoint: SeamlessImagePoint | null;
  /** Physical ECEF distance from the preferred-ray hit to the shared view target.
   * Undefined selects the legacy UV path; null means the hit is not ready. */
  referenceDistanceMeters?: Meters | null;
};
type Options = {
  enabled: boolean;
  /** Permit a prepared handover during a user drag; default keeps settled-only navigation. */
  continuousHandover?: boolean;
  /** Cancels pending settled work even before its first view has resolved. */
  selectionKey?: string;
  /** Preferred full-sensor vertical centre, measured from the bottom. */
  centerY?: number;
  busyRef: MutableRefObject<boolean>;
  readTarget: () => ObliqueGroundTarget | null;
  readView: () => Promise<SeamlessPreviewView | null>;
  findCandidates: (
    view: SeamlessPreviewView,
    panStartTarget?: ObliqueGroundTarget
  ) => Promise<readonly SeamlessPreviewCandidate[]>;
  isCurrent: (view: SeamlessPreviewView) => boolean;
  /** Preparation survives continued panning; selection/epoch must still match. */
  isSelectionCurrent?: (view: SeamlessPreviewView) => boolean;
  /** Prepare at most one neighbour; retain the last ready neighbour until its replacement is ready. */
  prepareCandidate?: (
    view: SeamlessPreviewView,
    candidate: SeamlessPreviewCandidate,
    signal: AbortSignal
  ) => Promise<void>;
  navigate: (step: PreparedObliqueNavigationTarget) => Promise<unknown>;
};
const validReferenceDistance = (
  value: Meters | null | undefined
): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const distance = (a: ObliqueGroundTarget, b: ObliqueGroundTarget) =>
  groundDistanceM(
    { lng: a.longitude, lat: a.latitude },
    { lng: b.longitude, lat: b.latitude }
  );

/** Only explicit user drags may advance; camera flights never schedule another step. */
export const useSeamlessPreviewNavigation = (options: Options) => {
  const current = useRef(options);
  current.current = options;
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const panStart = useRef<ObliqueGroundTarget | null>(null);
  type Job = {
    start: ObliqueGroundTarget;
    request: number;
    navigate: boolean;
    continuous?: boolean;
    stationary?: boolean;
    dueAt?: number;
    retryUntil?: number;
    attempt?: number;
    selectionKey?: string;
    view?: SeamlessPreviewView;
  };
  const queued = useRef<Job>();
  const settling = useRef<number>();
  const querying = useRef(false);
  const nextQueryAt = useRef(0);
  const pump = useRef<() => void>(() => undefined);
  type Preparation = {
    view: SeamlessPreviewView;
    candidate: SeamlessPreviewCandidate;
    request: number;
  };
  const pendingPreparation = useRef<Preparation>();
  const preparation = useRef<{ key: string; controller: AbortController }>();
  const readyPreparation = useRef<Preparation & { key: string }>();
  const waitingPreparation = useRef<{ key: string; job: Job }>();
  const prepareNext = useRef<() => void>(() => undefined);
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
    queued.current = undefined;
    settling.current = undefined;
    pendingPreparation.current = undefined;
    readyPreparation.current = undefined;
    waitingPreparation.current = undefined;
    preparation.current?.controller.abort();
  }, []);
  useEffect(() => {
    if (!options.enabled) {
      cancel();
      lastTransition.current = null;
    }
    return cancel;
  }, [
    options.enabled,
    options.continuousHandover,
    options.centerY,
    options.selectionKey,
    cancel,
  ]);
  const onPanStart = useCallback(() => {
    cancel();
    const o = current.current;
    if (o.enabled && !o.busyRef.current) panStart.current = o.readTarget();
  }, [cancel]);
  prepareNext.current = () => {
    if (preparation.current) return;
    const pending = pendingPreparation.current;
    pendingPreparation.current = undefined;
    const o = current.current;
    if (
      !pending ||
      pending.request !== generation.current ||
      !o.enabled ||
      o.busyRef.current ||
      !(o.isSelectionCurrent ?? o.isCurrent)(pending.view) ||
      !o.prepareCandidate
    )
      return;
    const key = `${pending.view.imageId}:${pending.candidate.step.candidate.record.id}`;
    const controller = new AbortController();
    preparation.current = { key, controller };
    void Promise.resolve()
      .then(() => {
        if (!controller.signal.aborted)
          return o.prepareCandidate!(
            pending.view,
            pending.candidate,
            controller.signal
          );
      })
      .then(() => {
        const active = current.current;
        if (
          controller.signal.aborted ||
          pending.request !== generation.current ||
          !active.enabled ||
          !(active.isSelectionCurrent ?? active.isCurrent)(pending.view)
        )
          return;
        readyPreparation.current = { ...pending, key };
        const waiting = waitingPreparation.current;
        if (
          active.continuousHandover &&
          !active.busyRef.current &&
          waiting?.key === key &&
          waiting.job.request === generation.current &&
          (panStart.current || settling.current === pending.request)
        ) {
          // Re-read and rank the live target; the preparation may have completed
          // after further panning, so its old step must never navigate directly.
          if (!queued.current?.navigate)
            queued.current = { ...waiting.job, view: undefined };
          waitingPreparation.current = undefined;
        }
      })
      .catch(() => {
        const waiting = waitingPreparation.current;
        if (waiting?.key !== key || waiting.job.request !== pending.request)
          return;
        waitingPreparation.current = undefined;
        if (
          !panStart.current &&
          settling.current === pending.request &&
          !queued.current?.navigate
        )
          settling.current = undefined;
      })
      .finally(() => {
        preparation.current = undefined;
        prepareNext.current();
        pump.current();
      });
  };
  pump.current = () => {
    if (querying.current || !queued.current) return;
    const wait =
      Math.max(
        queued.current.dueAt ?? 0,
        queued.current.navigate && !queued.current.continuous
          ? 0
          : nextQueryAt.current
      ) - Date.now();
    if (wait > 0) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => pump.current(), wait);
      return;
    }
    clearTimeout(timer.current);
    timer.current = undefined;
    const job = queued.current;
    queued.current = undefined;
    querying.current = true;
    nextQueryAt.current = Date.now() + 150;
    const run = async () => {
      const o = current.current;
      const valid = () =>
        job.request === generation.current &&
        current.current.enabled &&
        !current.current.busyRef.current &&
        (!job.navigate || job.selectionKey === current.current.selectionKey) &&
        (!job.continuous ||
          (current.current.continuousHandover &&
            (panStart.current !== null || settling.current === job.request)));
      const selectionIsCurrent = (view: SeamlessPreviewView) =>
        !o.isSelectionCurrent || o.isSelectionCurrent(view);
      const retry = () => {
        const dueAt = Date.now() + 200;
        if (
          !job.navigate ||
          !valid() ||
          (job.attempt ?? 0) >= 4 ||
          dueAt > (job.retryUntil ?? 0) ||
          (job.view && !selectionIsCurrent(job.view))
        )
          return;
        if (
          !job.continuous ||
          !queued.current ||
          queued.current.request !== job.request
        )
          queued.current = { ...job, dueAt, attempt: (job.attempt ?? 0) + 1 };
      };
      if (!valid() || (job.view && !selectionIsCurrent(job.view))) return;
      const viewIsCurrent =
        job.navigate && !job.continuous
          ? o.isCurrent
          : o.isSelectionCurrent ?? o.isCurrent;
      const view = await o.readView();
      if (!valid()) return;
      if (!view) {
        retry();
        return;
      }
      if (
        !selectionIsCurrent(view) ||
        (job.view &&
          (job.view.imageId !== view.imageId || job.view.epoch !== view.epoch))
      )
        return;
      if (job.navigate) job.view = view;
      if (!viewIsCurrent(view)) {
        retry();
        return;
      }
      if (!job.stationary && distance(job.start, view.target) < 0.5) return;
      const physicalReference = view.referenceDistanceMeters !== undefined;
      const currentDistance = physicalReference
        ? validReferenceDistance(view.referenceDistanceMeters)
        : seamlessImageCenterDistance(view.imagePoint, o.centerY);
      if (physicalReference && currentDistance === null) {
        pendingPreparation.current = undefined;
        preparation.current?.controller.abort();
        retry();
        return;
      }
      const improvement = physicalReference ? 1 : 0.025;
      const candidates = await (job.stationary ||
      (job.navigate && !job.continuous)
        ? o.findCandidates(view)
        : o.findCandidates(view, job.start));
      if (!valid() || !selectionIsCurrent(view)) return;
      if (!viewIsCurrent(view)) {
        retry();
        return;
      }
      const previous = lastTransition.current;
      let next: SeamlessPreviewCandidate | undefined;
      let nearestDistance = Infinity;
      let missingReference = false;
      // The viewer already bounds its indexed/visible neighbourhood. Rank all
      // of it before choosing; an unrelated GSD shortlist must not hide a centre.
      for (const candidate of candidates.slice(0, 128)) {
        const { step, imagePoint } = candidate;
        // Coverage remains calibrated image coverage even when the ranking
        // reference is a physical surface hit rather than a sensor UV centre.
        const imageDistance = seamlessImageCenterDistance(
          imagePoint,
          o.centerY
        );
        const candidateDistance = physicalReference
          ? validReferenceDistance(candidate.referenceDistanceMeters)
          : imageDistance;
        if (
          step.originImageId !== view.imageId ||
          step.candidate.record.id === view.imageId ||
          step.candidate.record.sector !== view.sector ||
          step.candidate.coversTarget !== true ||
          imageDistance === null
        )
          continue;
        if (candidateDistance === null) {
          if (physicalReference) missingReference = true;
          continue;
        }
        const better =
          (currentDistance ?? Infinity) - candidateDistance >= improvement;
        const eligible = job.continuous
          ? better || candidate.approaching === true
          : job.stationary && o.continuousHandover
          ? true
          : job.navigate || job.stationary
          ? better
          : candidate.approaching === true;
        if (
          !eligible ||
          candidateDistance >= nearestDistance ||
          (previous?.to === view.imageId &&
            previous.from === step.candidate.record.id &&
            (Date.now() - previous.at < 1800 ||
              distance(previous.target, view.target) < 10))
        )
          continue;
        next = candidate;
        nearestDistance = candidateDistance;
      }
      if (!next) {
        waitingPreparation.current = undefined;
        if (missingReference) retry();
        if (!job.navigate) {
          pendingPreparation.current = undefined;
          preparation.current?.controller.abort();
        }
        return;
      }
      if (!job.navigate || job.continuous) {
        const key = `${view.imageId}:${next.step.candidate.record.id}`;
        const ready =
          o.continuousHandover &&
          readyPreparation.current?.key === key &&
          readyPreparation.current.request === job.request &&
          selectionIsCurrent(readyPreparation.current.view);
        const preparing =
          preparation.current?.key === key &&
          !preparation.current.controller.signal.aborted;
        if (!ready && !preparing && o.prepareCandidate) {
          pendingPreparation.current = {
            view,
            candidate: next,
            request: job.request,
          };
          preparation.current?.controller.abort();
          prepareNext.current();
        }
        if (!job.navigate) return;
        if ((currentDistance ?? Infinity) - nearestDistance < improvement) {
          waitingPreparation.current = undefined;
          return;
        }
        if (o.prepareCandidate && !ready) {
          waitingPreparation.current = { key, job };
          return;
        }
        if (!o.isCurrent(view)) {
          retry();
          return;
        }
        // A camera flight is not another user drag. Ignore remaining pointer
        // steps until the host starts a new gesture on the landed image.
        panStart.current = null;
        queued.current = undefined;
        waitingPreparation.current = undefined;
        settling.current = undefined;
      }
      lastTransition.current = {
        from: view.imageId,
        to: next.step.candidate.record.id,
        target: view.target,
        at: Date.now(),
      };
      await o.navigate(next.step);
    };
    void run()
      .catch(() => undefined)
      .finally(() => {
        querying.current = false;
        if (
          job.navigate &&
          settling.current === job.request &&
          !(
            queued.current?.navigate && queued.current.request === job.request
          ) &&
          waitingPreparation.current?.job.request !== job.request
        )
          settling.current = undefined;
        pump.current();
      });
  };
  const onPanStep = useCallback(() => {
    const o = current.current;
    if (
      !panStart.current ||
      !o.enabled ||
      o.busyRef.current ||
      (!o.prepareCandidate && !o.continuousHandover)
    )
      return;
    queued.current = {
      start: panStart.current,
      request: generation.current,
      navigate: !!o.continuousHandover,
      continuous: !!o.continuousHandover,
      selectionKey: o.selectionKey,
      retryUntil: Date.now() + 1500,
    };
    pump.current();
  }, []);
  const onPanEnd = useCallback(() => {
    const start = panStart.current;
    panStart.current = null;
    if (!start) return;
    const continuous = !!current.current.continuousHandover;
    clearTimeout(timer.current);
    queued.current = undefined;
    waitingPreparation.current = undefined;
    if (!continuous) {
      pendingPreparation.current = undefined;
      preparation.current?.controller.abort();
    }
    const request = continuous ? generation.current : ++generation.current;
    settling.current = request;
    queued.current = {
      start,
      request,
      navigate: true,
      continuous,
      selectionKey: current.current.selectionKey,
      dueAt: Date.now() + (continuous ? 0 : 140),
      retryUntil: Date.now() + 1500,
    };
    pump.current();
  }, []);
  const refreshPreparation = useCallback(() => {
    const o = current.current;
    if (
      !o.enabled ||
      o.busyRef.current ||
      panStart.current ||
      settling.current !== undefined ||
      queued.current?.navigate ||
      !o.prepareCandidate
    )
      return;
    const target = o.readTarget();
    if (!target) return;
    queued.current = {
      start: target,
      request: generation.current,
      navigate: false,
      stationary: true,
    };
    pump.current();
  }, []);
  return { onPanStart, onPanStep, onPanEnd, refreshPreparation, cancel };
};
