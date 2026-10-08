import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { degToRad, type Degrees, type Radians } from "@carma-units";
import type {
  CardinalDirection,
  NearestObliqueImageRecord,
  ObliqueGroundTarget,
  ObliqueSelectionData,
  ObliqueViewMode,
} from "../../core/types";
import {
  CARDINALS_CLOCKWISE,
  getHeadingFromCardinalDirection,
} from "../../core/utils/orientation";
import { getCameraCalibration } from "../../core/utils/calibration";
import { panViewTarget } from "../../core/utils/selection";
import { poseOf } from "../utils/flyToImage";
import type { RefreshSearchArgs } from "./useNearestImage";
import type { ImageSelectionBatchResult } from "../utils/image-selection-messages";
import {
  OBLIQUE_NAVIGATION_KEYS,
  OBLIQUE_NAVIGATION_INTENT,
  type ObliqueNavigationIntent,
  type ObliqueNavigationKey,
  type ObliqueNavigationTargets,
} from "../oblique-actions";
const RECOMPUTE_DELAY_MS = 80;
const NAVIGATION_INTERVAL_MS = 200;
const ROTATION_KEYS = new Set<ObliqueNavigationKey>([
  OBLIQUE_NAVIGATION_KEYS.RotateLeft,
  OBLIQUE_NAVIGATION_KEYS.RotateRight,
]);
const PAN_STEPS = [
  { key: OBLIQUE_NAVIGATION_KEYS.Left, right: -1, forward: 0 },
  { key: OBLIQUE_NAVIGATION_KEYS.Right, right: 1, forward: 0 },
  { key: OBLIQUE_NAVIGATION_KEYS.Up, right: 0, forward: 1 },
  { key: OBLIQUE_NAVIGATION_KEYS.Down, right: 0, forward: -1 },
] as const;
export type PreparedObliqueNavigationTarget = {
  candidate: NearestObliqueImageRecord;
  target: ObliqueGroundTarget;
  headingRad: Radians;
  originImageId: string;
  fitNextImage: boolean;
};
type Options = {
  map: MaplibreMap | null;
  data: ObliqueSelectionData | null;
  selectedImage: NearestObliqueImageRecord | null;
  enabled: boolean;
  rotationReady: boolean;
  viewMode: ObliqueViewMode;
  previewCameraActive: boolean;
  nextInterface: boolean;
  targetRef: MutableRefObject<ObliqueGroundTarget | null>;
  busyRef: MutableRefObject<boolean>;
  readTarget: () => ObliqueGroundTarget | null;
  /** Sample the configured NG rotation surface once, before selecting its camera. */
  readRotationTarget?: () => ObliqueGroundTarget | null;
  computeNavigation: (
    queries: RefreshSearchArgs[]
  ) => Promise<ImageSelectionBatchResult>;
  ensureDirections?: (queries: RefreshSearchArgs[]) => Promise<unknown>;
  publish: (targets: ObliqueNavigationTargets | null) => void;
  onLookAhead: (candidate: NearestObliqueImageRecord | null, target?: PreparedObliqueNavigationTarget) => void;
};
type Cache = {
  data: ObliqueSelectionData;
  imageId: string;
  viewMode: ObliqueViewMode;
  originTarget: ObliqueGroundTarget;
  previewCameraActive: boolean;
  rotationReady: boolean;
  targets: Map<ObliqueNavigationKey, PreparedObliqueNavigationTarget>;
  cardinals: Map<CardinalDirection, PreparedObliqueNavigationTarget>;
};
const QUEUE_ENTRY_KIND = { IMAGE: "image", ACTION: "action" } as const;
type NavigationEntry = {
  settle: (executed: boolean) => void;
} & (
  | {
      kind: typeof QUEUE_ENTRY_KIND.IMAGE;
      key: ObliqueNavigationKey;
      activate: (target: PreparedObliqueNavigationTarget) => Promise<unknown>;
    }
  | {
      kind: typeof QUEUE_ENTRY_KIND.ACTION;
      activate: () => Promise<unknown>;
      requiresTargets: boolean;
    }
);
/** The six controls use one prepared geometry batch, independently of media and flight state. */
export const useObliqueNavigationTargets = (options: Options) => {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const cacheRef = useRef<Cache | null>(null),
    generationRef = useRef(0),
    lastDirectionRef = useRef<ObliqueNavigationKey | null>(null);
  const intentRef = useRef<{ pointer: ObliqueNavigationKey | null; focus: ObliqueNavigationKey | null }>({ pointer: null, focus: null });
  const hoverTimerRef = useRef<{ key: ObliqueNavigationKey; timer: ReturnType<typeof setTimeout> } | null>(null);
  const queueRef = useRef<NavigationEntry[]>([]),
    queueEpochRef = useRef(0),
    processingRef = useRef(false),
    activeEntryRef = useRef<NavigationEntry | null>(null),
    mountedRef = useRef(false),
    pumpRef = useRef<() => void>(() => {}),
    refreshRef = useRef<() => Promise<void>>(async () => {}),
    publishedTargetsRef = useRef<string | null>(null),
    navigationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(),
    lastNavigationAtRef = useRef(-Infinity),
    missingThisTickRef = useRef(0),
    lookAheadRef = useRef<string | null>(null);
  const cancel = useCallback(() => {
    clearTimeout(hoverTimerRef.current?.timer);
    hoverTimerRef.current = null;
    queueEpochRef.current++;
    clearTimeout(navigationTimerRef.current);
    navigationTimerRef.current = undefined;
    for (const entry of queueRef.current) entry.settle(false);
    queueRef.current = [];
    activeEntryRef.current?.settle(false);
    missingThisTickRef.current = 0;
    lookAheadRef.current = null;
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancel();
    };
  }, [cancel]);
  useEffect(() => {
    if (!options.enabled || options.viewMode === "objectCoverage") cancel();
  }, [options.enabled, options.viewMode, cancel]);
  const invalidate = useCallback((clearPublished = true) => {
    generationRef.current++;
    cacheRef.current = null;
    if (clearPublished) {
      publishedTargetsRef.current = null;
      optionsRef.current.publish(null);
    }
  }, []);
  const effectiveTarget = useCallback((): ObliqueGroundTarget | null => {
    const o = optionsRef.current,
      selected = o.selectedImage,
      dataset = selected && o.data?.datasets.get(selected.record.seriesId),
      base = o.targetRef.current ?? o.readTarget();
    if (!selected || !dataset) return null;
    return o.nextInterface
      ? base
      : {
          longitude: selected.imageCenter.longitude,
          latitude: selected.imageCenter.latitude,
          heightMeters:
            base?.heightMeters ?? dataset.referenceGroundHeightMeters,
          heightDatum: base?.heightDatum ?? dataset.heightDatum,
        };
  }, []);
  const currentCache = useCallback(() => {
    const o = optionsRef.current,
      c = cacheRef.current;
    if (
      !o.enabled ||
      o.viewMode === "objectCoverage" ||
      !c ||
      c.data !== o.data ||
      c.imageId !== o.selectedImage?.record.id ||
      c.viewMode !== o.viewMode ||
      c.previewCameraActive !== o.previewCameraActive ||
      c.rotationReady !== o.rotationReady
    )
      return null;
    const target = effectiveTarget();
    return target &&
      c.originTarget.longitude === target.longitude &&
      c.originTarget.latitude === target.latitude &&
      c.originTarget.heightMeters === target.heightMeters &&
      c.originTarget.heightDatum === target.heightDatum
      ? c
      : null;
  }, [effectiveTarget]);

  const publishSettled = useCallback(() => {
    const o = optionsRef.current,
      cache = currentCache();
    if (!cache || o.busyRef.current || o.map?.isMoving?.()) return;
    const images = Object.fromEntries(
      Object.values(OBLIQUE_NAVIGATION_KEYS).map((key) => [
        key,
        cache.targets.get(key)?.candidate.record.id ?? null,
      ])
    ) as ObliqueNavigationTargets["images"];
    const cardinalImages = Object.fromEntries(
      CARDINALS_CLOCKWISE.map((cardinal) => [
        cardinal,
        cache.cardinals.get(cardinal)?.candidate.record.id ?? null,
      ])
    ) as Record<CardinalDirection, string | null>;
    const identity = JSON.stringify([cache.imageId, images, cardinalImages]);
    if (publishedTargetsRef.current === identity) return;
    publishedTargetsRef.current = identity;
    o.publish({ imageId: cache.imageId, images, cardinalImages });
  }, [currentCache]);

  const prefetchNext = useCallback(() => {
    const cache = currentCache(),
      entry = queueRef.current[0];
    const key = entry?.kind === QUEUE_ENTRY_KIND.IMAGE
      ? entry.key
      : entry ? null
      : intentRef.current.pointer ?? intentRef.current.focus ?? lastDirectionRef.current;
    const target = key && cache?.targets.get(key);
    if (!target) {
      if (lookAheadRef.current !== null) {
        lookAheadRef.current = null;
        optionsRef.current.onLookAhead(null);
      }
      return;
    }
    const identity = `${generationRef.current}:${key}:${target.candidate.record.id}`;
    if (lookAheadRef.current === identity) return;
    lookAheadRef.current = identity;
    optionsRef.current.onLookAhead(target.candidate, target);
  }, [currentCache]);
  const schedulePump = useCallback((delay: number, resetMissing = false) => {
    if (navigationTimerRef.current !== undefined) return;
    navigationTimerRef.current = setTimeout(() => {
      navigationTimerRef.current = undefined;
      if (resetMissing) missingThisTickRef.current = 0;
      pumpRef.current();
    }, delay);
  }, []);
  const pump = useCallback(async () => {
    if (processingRef.current || !mountedRef.current) return;
    const epoch = queueEpochRef.current;
    processingRef.current = true;
    try {
      while (
        queueRef.current.length &&
        epoch === queueEpochRef.current &&
        mountedRef.current
      ) {
        const o = optionsRef.current;
        if (!o.enabled || o.viewMode === "objectCoverage") {
          cancel();
          return;
        }
        if (o.busyRef.current) {
          schedulePump(50);
          return;
        }
        const entry = queueRef.current[0],
          cache = currentCache();
        if (
          entry.kind === QUEUE_ENTRY_KIND.IMAGE &&
          ROTATION_KEYS.has(entry.key) &&
          !o.rotationReady
        )
          return;
        if (
          (entry.kind === QUEUE_ENTRY_KIND.IMAGE || entry.requiresTargets) &&
          !cache
        )
          return;
        const target =
          entry.kind === QUEUE_ENTRY_KIND.IMAGE
            ? cache?.targets.get(entry.key)
            : undefined;
        if (entry.kind === QUEUE_ENTRY_KIND.IMAGE && !target) {
          if (missingThisTickRef.current >= 8) {
            schedulePump(0, true);
            return;
          }
          queueRef.current.shift();
          entry.settle(false);
          missingThisTickRef.current++;
          if (missingThisTickRef.current >= 8) {
            schedulePump(0, true);
            return;
          }
          continue;
        }
        const remaining =
          NAVIGATION_INTERVAL_MS -
          (performance.now() - lastNavigationAtRef.current);
        if (remaining > 0) {
          schedulePump(remaining);
          return;
        }
        queueRef.current.shift();
        activeEntryRef.current = entry;
        lastNavigationAtRef.current = performance.now();
        if (entry.kind === QUEUE_ENTRY_KIND.IMAGE)
          lastDirectionRef.current = entry.key;
        try {
          const activation =
            entry.kind === QUEUE_ENTRY_KIND.IMAGE
              ? entry.activate(target!)
              : entry.activate();
          // Keep the last settled button state visible while the camera flies.
          invalidate(false);
          await activation;
          entry.settle(epoch === queueEpochRef.current);
        } catch {
          entry.settle(false);
        } finally {
          activeEntryRef.current = null;
        }
        // The completed flight may have published another photo/mode/data revision.
        // A new cache is required before the next image entry can resolve its target.
        if (epoch === queueEpochRef.current)
          await refreshRef.current().catch(() => invalidate());
        publishSettled();
        prefetchNext();
      }
    } finally {
      processingRef.current = false;
      if (
        epoch !== queueEpochRef.current &&
        queueRef.current.length &&
        mountedRef.current
      )
        schedulePump(0);
    }
  }, [
    cancel,
    currentCache,
    prefetchNext,
    schedulePump,
    invalidate,
    publishSettled,
  ]);
  pumpRef.current = () => {
    void pump();
  };

  const refresh = useCallback(async () => {
    const o = optionsRef.current,
      selected = o.selectedImage,
      data = o.data,
      map = o.map;
    if (
      !o.enabled ||
      !selected ||
      !data ||
      !map ||
      o.viewMode === "objectCoverage"
    ) {
      invalidate();
      return;
    }
    const dataset = data.datasets.get(selected.record.seriesId);
    if (
      !dataset ||
      (getCameraCalibration(dataset, selected.record.cameraId).view ===
        "nadir") !==
        (o.viewMode === "nadir")
    ) {
      invalidate();
      return;
    }
    const generation = ++generationRef.current,
      pose = poseOf(selected.record, dataset),
      target = effectiveTarget();
    if (!target) {
      invalidate();
      return;
    }
    // During a flight, prepare around its requested anchor. Once it settles,
    // sample the chosen surface and use that same pivot for ranking and flight.
    const rotationTarget =
      o.nextInterface &&
      o.rotationReady &&
      !o.busyRef.current &&
      o.readRotationTarget
        ? o.readRotationTarget()
        : target;
    const heading = degToRad(
      (o.previewCameraActive || o.busyRef.current
        ? pose.bearingDeg
        : map.getBearing()) as Degrees
    );
    const pitch = degToRad(
      (o.previewCameraActive || o.busyRef.current
        ? pose.pitchDeg
        : map.getPitch()) as Degrees
    );
    const quarterTurn = degToRad(90 as Degrees);
    const plans: {
      key?: ObliqueNavigationKey;
      cardinal?: CardinalDirection;
      target: ObliqueGroundTarget;
      headingRad: Radians;
      fitNextImage: boolean;
    }[] = [
      ...PAN_STEPS.map((step) => ({
        key: step.key,
        target: panViewTarget(selected.record, dataset, target, {
          right: step.right,
          forward: step.forward,
        }),
        headingRad: heading,
        fitNextImage: true,
      })),
      ...(o.rotationReady && rotationTarget
        ? [
            {
              key: OBLIQUE_NAVIGATION_KEYS.RotateLeft,
              target: rotationTarget,
              headingRad: (heading - quarterTurn) as Radians,
              fitNextImage: false,
            },
            {
              key: OBLIQUE_NAVIGATION_KEYS.RotateRight,
              target: rotationTarget,
              headingRad: (heading + quarterTurn) as Radians,
              fitNextImage: false,
            },
          ]
        : []),
      ...(o.rotationReady && o.nextInterface && rotationTarget
        ? CARDINALS_CLOCKWISE.map((cardinal) => ({
            cardinal,
            target: rotationTarget,
            headingRad: getHeadingFromCardinalDirection(cardinal) as Radians,
            fitNextImage: false,
          }))
        : []),
    ];
    const current = () =>
      generation === generationRef.current &&
      optionsRef.current.enabled &&
      optionsRef.current.data === data &&
      optionsRef.current.viewMode === o.viewMode &&
      optionsRef.current.previewCameraActive === o.previewCameraActive &&
      optionsRef.current.rotationReady === o.rotationReady &&
      optionsRef.current.selectedImage?.record.id === selected.record.id;
    const queries = plans.map(
      (plan): RefreshSearchArgs => ({
        target: plan.target,
        headingRad: plan.headingRad,
        pitchRad: pitch,
        cameraView:
          plan.cardinal !== undefined
            ? "oblique"
            : o.viewMode === "nadir"
            ? "nadir"
            : undefined,
        excludeImageId: selected.record.id,
        navigationOrigin: plan.fitNextImage ? target : undefined,
        numCandidates: 4,
      })
    );
    await o.ensureDirections?.(queries);
    if (!current()) return;
    const ranked = await o.computeNavigation(queries);
    if (!current()) return;
    // Keep controls geometry-only. Resolving camera altitude can fetch a geoid
    // grid and must not delay or disable browsing navigation; a flight resolves
    // that value only when the user actually requests the image.
    const prepared = plans.map((plan, index) => {
      const candidate = ranked[index]?.find(
        (candidate) =>
          candidate.coversTarget && data.datasets.has(candidate.record.seriesId)
      );
      if (!candidate) return undefined;
      const source = data.datasets.get(candidate.record.seriesId)!;
      poseOf(candidate.record, source);
      return { ...plan, candidate, originImageId: selected.record.id };
    });
    if (!current()) return;
    const targets = new Map<
        ObliqueNavigationKey,
        PreparedObliqueNavigationTarget
      >(),
      cardinals = new Map<CardinalDirection, PreparedObliqueNavigationTarget>();
    for (const target of prepared) {
      if (!target) continue;
      if (target.key) targets.set(target.key, target);
      if (target.cardinal !== undefined) cardinals.set(target.cardinal, target);
    }
    cacheRef.current = {
      data,
      imageId: selected.record.id,
      viewMode: o.viewMode,
      originTarget: target,
      previewCameraActive: o.previewCameraActive,
      rotationReady: o.rotationReady,
      targets,
      cardinals,
    };
    publishSettled();
    prefetchNext();
    pumpRef.current();
  }, [invalidate, effectiveTarget, prefetchNext, publishSettled]);
  refreshRef.current = refresh;
  useEffect(() => {
    // Keep availability stable until the new camera position has been sampled.
    invalidate(false);
    void refresh().catch(() => invalidate());
    return () => {
      generationRef.current++;
      cacheRef.current = null;
    };
  }, [
    options.map,
    options.data,
    options.selectedImage?.record,
    options.enabled,
    options.rotationReady,
    options.viewMode,
    options.previewCameraActive,
    options.nextInterface,
    options.computeNavigation,
    options.ensureDirections,
    options.readRotationTarget,
    invalidate,
    refresh,
  ]);
  useEffect(() => {
    const map = options.map;
    if (!map) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onStart = (event: { originalEvent?: Event }) => {
      if (event.originalEvent) {
        cancel();
        invalidate(false);
      }
    };
    const onEnd = () => {
      if (cacheRef.current && !currentCache()) invalidate(false);
      clearTimeout(timer);
      timer = setTimeout(
        () => void refresh().catch(() => invalidate()),
        RECOMPUTE_DELAY_MS
      );
    };
    map.on("movestart", onStart);
    map.on("moveend", onEnd);
    return () => {
      clearTimeout(timer);
      map.off("movestart", onStart);
      map.off("moveend", onEnd);
    };
  }, [options.map, invalidate, refresh, cancel, currentCache]);
  const warmNavigation = useCallback((key: ObliqueNavigationKey, active: boolean, channel: ObliqueNavigationIntent) => {
    const options = optionsRef.current;
    if (active && (!options.enabled || options.viewMode === "objectCoverage" ||
      (ROTATION_KEYS.has(key) && !options.rotationReady))) return;
    if (channel === OBLIQUE_NAVIGATION_INTENT.Pointer) {
      if (active || hoverTimerRef.current?.key === key) {
        clearTimeout(hoverTimerRef.current?.timer);
        hoverTimerRef.current = null;
      }
      if (active) {
        // A short pointer dwell avoids metadata churn while crossing buttons.
        // Focus and queued navigation remain immediate.
        hoverTimerRef.current = { key, timer: setTimeout(() => {
          hoverTimerRef.current = null;
          const current = optionsRef.current;
          if (!mountedRef.current || !current.enabled || current.viewMode === "objectCoverage" ||
            (ROTATION_KEYS.has(key) && !current.rotationReady)) return;
          intentRef.current.pointer = key;
          prefetchNext();
        }, 80) };
        return;
      }
    }
    if (active) intentRef.current[channel] = key;
    else if (intentRef.current[channel] === key) intentRef.current[channel] = null;
    prefetchNext();
  }, [prefetchNext]);
  const getTarget = useCallback(
    (key: ObliqueNavigationKey) => currentCache()?.targets.get(key),
    [currentCache]
  );
  const requestTarget = useCallback(
    (
      key: ObliqueNavigationKey,
      activate: (target: PreparedObliqueNavigationTarget) => Promise<unknown>
    ): Promise<boolean> => {
      const o = optionsRef.current;
      if (
        !mountedRef.current ||
        !o.enabled ||
        o.viewMode === "objectCoverage" ||
        (ROTATION_KEYS.has(key) && !o.rotationReady)
      )
        return Promise.resolve(false);
      return new Promise((settle) => {
        queueRef.current.push({
          kind: QUEUE_ENTRY_KIND.IMAGE,
          key,
          activate,
          settle,
        });
        prefetchNext();
        pumpRef.current();
      });
    },
    [prefetchNext]
  );
  const requestAction = useCallback(
    (
      activate: () => Promise<unknown>,
      requiresTargets = false
    ): Promise<boolean> => {
      const o = optionsRef.current;
      if (!mountedRef.current || !o.enabled || o.viewMode === "objectCoverage")
        return Promise.resolve(false);
      return new Promise((settle) => {
        queueRef.current.push({
          kind: QUEUE_ENTRY_KIND.ACTION,
          activate,
          requiresTargets,
          settle,
        });
        pumpRef.current();
      });
    },
    []
  );
  const getCardinal = useCallback(
    (direction: CardinalDirection) => currentCache()?.cardinals.get(direction),
    [currentCache]
  );
  const rememberDirection = useCallback((key: ObliqueNavigationKey) => {
    lastDirectionRef.current = key;
  }, []);
  return {
    warmNavigation,
    getTarget,
    requestTarget,
    requestAction,
    getCardinal,
    rememberDirection,
    invalidate,
    cancel,
  };
};
