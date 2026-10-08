import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Radians } from "@carma-units";
import type { ObliqueDataset } from "../../core/types";
import { summarizeDirectionalCatalogPitch } from "../../core/utils/browsing-pitch";
import { type CatalogPriority } from "../../core/utils/directional-catalog";
import {
  createDirectionalCatalogQueue,
  type CatalogRequestOptions,
} from "../utils/directional-catalog-queue";
import {
  loadObliqueSeriesData,
  type ObliqueData,
} from "../utils/load-oblique-series";
import type { ObliqueSeriesWorkerMessage } from "../utils/oblique-series.worker";
export type { ObliqueData } from "../utils/load-oblique-series";
import {
  OBLIQUE_CATALOG_CACHE_VERSION,
  OBLIQUE_CATALOG_FRESHNESS_MS,
  syncObliqueCatalogCacheVersion,
} from "../utils/oblique-series-cache-version";

export type ObliqueSeriesDataState = {
  id: string;
  isLoading: boolean;
  error: string | null;
  imageCount: number;
  /** All four oblique parts (or the canonical catalog) finished successfully. */
  obliqueComplete: boolean;
};

export type ObliqueDataState = {
  data: ObliqueData | null;
  isLoading: boolean;
  /** At least one loaded series is usable; a second failed series does not block it. */
  isAllDataReady: boolean;
  /** All enabled series have their complete oblique catalogs; lazy nadir is independent. */
  isCatalogComplete: boolean;
  error: string | null;
  perSeries: ObliqueSeriesDataState[];
  /** Finish oblique segments; nadir and failed-segment retry are explicit. */
  awaitAll: (options?: {
    retry?: boolean;
    includeNadir?: boolean;
  }) => Promise<ObliqueData | null>;
  /** Wait for the requested camera group before selecting from its records. */
  awaitDirection: (
    heading: Radians,
    options?: { cameraView?: "nadir"; retry?: boolean }
  ) => Promise<ObliqueData | null>;
  /**
   * Refcounted: defer starting new idle catalog parts until every returned release ran,
   * e.g. while foreground imagery loads. Requested parts (`awaitDirection`/`awaitAll`)
   * and parts already in flight continue.
   */
  holdIdleCatalogLoads: () => () => void;
};

const IDLE: ObliqueDataState = {
  data: null,
  isLoading: false,
  isAllDataReady: false,
  isCatalogComplete: false,
  error: null,
  perSeries: [],
  awaitDirection: async () => null,
  awaitAll: async () => null,
  holdIdleCatalogLoads: () => () => {},
};
type SeriesLoad = {
  promise: Promise<ObliqueData>;
  users: number;
  isPending: () => boolean;
  isFresh: () => boolean;
  cancel: () => void;
};
const cache = new Map<string, SeriesLoad>();

const createSeriesLoad = (
  dataset: ObliqueDataset,
  options?: CatalogRequestOptions
): SeriesLoad => {
  let settled = false;
  let completedAt = 0;
  let cancel = () => {};
  const promise = new Promise<ObliqueData>((resolve, reject) => {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Leading chunks of a large catalog; each arrives as its own short task.
    let chunked: Pick<ObliqueData, "imageRecords" | "centers"> | undefined;
    const controller = new AbortController();
    const finish = (error?: Error, data?: ObliqueData) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      }
      if (error) reject(error);
      else if (data) {
        completedAt = Date.now();
        const resolved = data.datasets.get(dataset.id);
        if (resolved)
          data.datasets.set(dataset.id, {
            ...resolved,
            animations: dataset.animations,
            exteriorOrientationsURI: dataset.exteriorOrientationsURI,
            footprintsURI: dataset.footprintsURI,
          });
        resolve(data);
      } else reject(new Error("Unvollständige Metadatenantwort."));
    };
    cancel = () =>
      finish(new DOMException("Metadatenladen abgebrochen.", "AbortError"));
    timer = setTimeout(
      () =>
        finish(
          new Error("Metadaten konnten nicht rechtzeitig geladen werden.")
        ),
      60000
    );
    if (typeof Worker === "undefined") {
      loadObliqueSeriesData(dataset, controller.signal).then(
        (data) => finish(undefined, data),
        (error: unknown) =>
          finish(error instanceof Error ? error : new Error(String(error)))
      );
      return;
    }
    try {
      worker = new Worker(
        new URL("../utils/oblique-series.worker.ts", import.meta.url),
        { type: "module" }
      );
      worker.onmessage = ({
        data: message,
      }: MessageEvent<ObliqueSeriesWorkerMessage>) => {
        if (message.chunk) {
          chunked ??= { imageRecords: new Map(), centers: new Map() };
          for (const [id, record] of message.chunk.imageRecords)
            chunked.imageRecords.set(id, record);
          for (const [id, center] of message.chunk.centers)
            chunked.centers.set(id, center);
          return;
        }
        if (message.data && chunked) {
          // Keep catalog order: leading chunks first, then the final remainder.
          for (const [id, record] of message.data.imageRecords)
            chunked.imageRecords.set(id, record);
          for (const [id, center] of message.data.centers)
            chunked.centers.set(id, center);
          message.data.imageRecords = chunked.imageRecords;
          message.data.centers = chunked.centers;
        }
        finish(
          message.error ? new Error(message.error) : undefined,
          message.data
        );
      };
      worker.onerror = () =>
        finish(new Error("Metadaten-Worker konnte nicht geladen werden."));
      // Runtime easing callbacks stay in the UI; worker inputs contain only cloneable values.
      worker.postMessage({
        fetchPriority: options?.fetchPriority,
        dataset: {
          ...dataset,
          animations: {},
          exteriorOrientationsURI: new URL(
            dataset.exteriorOrientationsURI,
            window.location.href
          ).href,
          compressedCatalogURI: dataset.compressedCatalogURI
            ? new URL(dataset.compressedCatalogURI, window.location.href).href
            : undefined,
          footprintsURI: dataset.footprintsURI
            ? new URL(dataset.footprintsURI, window.location.href).href
            : undefined,
        },
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
  return {
    promise,
    users: 0,
    isPending: () => !settled,
    isFresh: () =>
      !settled ||
      !!dataset.catalogVersion?.trim() ||
      Date.now() - completedAt < OBLIQUE_CATALOG_FRESHNESS_MS,
    cancel: () => cancel(),
  };
};

/** Share completed catalogs, but stop a pending request when its last viewer releases it. */
const acquireSeries = (
  dataset: ObliqueDataset,
  options?: CatalogRequestOptions
) => {
  // Configuration/calibration changes cannot reuse a differently interpreted catalog.
  const key = JSON.stringify({
    parserVersion: OBLIQUE_CATALOG_CACHE_VERSION,
    dataset,
  });
  let entry = cache.get(key);
  if (!entry?.isFresh()) {
    entry = createSeriesLoad(dataset, options);
    cache.set(key, entry);
    const created = entry;
    entry.promise.catch(() => {
      if (cache.get(key) === created) cache.delete(key);
    });
  }
  const acquired = entry;
  acquired.users++;
  let released = false;
  return {
    promise: acquired.promise,
    release() {
      if (released) return;
      released = true;
      acquired.users--;
      if (acquired.users === 0 && acquired.isPending()) {
        if (cache.get(key) === acquired) cache.delete(key);
        acquired.cancel();
      }
    },
  };
};

import.meta.hot?.dispose(() => {
  for (const entry of cache.values()) if (entry.isPending()) entry.cancel();
  cache.clear();
});

const mergeSeries = (
  loaded: Iterable<ObliqueData>,
  result: ObliqueData = {
    imageRecords: new Map(),
    datasets: new Map(),
    centers: new Map(),
    obliquePitchBySeries: new Map(),
    obliquePitchByDirectionBySeries: new Map(),
  }
): ObliqueData => {
  for (const data of loaded) {
    for (const [id, total] of data.obliquePitchBySeries ?? []) {
      const previous = result.obliquePitchBySeries!.get(id);
      result.obliquePitchBySeries!.set(
        id,
        previous
          ? {
              pitchSumRad: (previous.pitchSumRad +
                total.pitchSumRad) as Radians,
              imageCount: previous.imageCount + total.imageCount,
            }
          : total
      );
    }
    for (const [id, directions] of data.obliquePitchByDirectionBySeries ?? []) {
      let target = result.obliquePitchByDirectionBySeries!.get(id);
      if (!target) {
        target = new Map();
        result.obliquePitchByDirectionBySeries!.set(id, target);
      }
      for (const [direction, total] of directions) {
        const previous = target.get(direction);
        target.set(
          direction,
          previous
            ? {
                pitchSumRad: (previous.pitchSumRad +
                  total.pitchSumRad) as Radians,
                imageCount: previous.imageCount + total.imageCount,
              }
            : total
        );
      }
    }
    for (const [id, record] of data.imageRecords)
      result.imageRecords.set(id, record);
    for (const [id, dataset] of data.datasets) {
      const previous = result.datasets.get(id);
      result.datasets.set(
        id,
        previous
          ? {
              ...dataset,
              cameras: { ...previous.cameras, ...dataset.cameras },
              interiorOrientationOffsets: {
                ...previous.interiorOrientationOffsets,
                ...dataset.interiorOrientationOffsets,
              },
            }
          : dataset
      );
    }
    for (const [id, center] of data.centers) result.centers.set(id, center);
  }
  for (const [id, dataset] of result.datasets) {
    const summaries = summarizeDirectionalCatalogPitch(dataset);
    if (summaries.total) result.obliquePitchBySeries!.set(id, summaries.total);
    if (summaries.byDirection.size) {
      let target = result.obliquePitchByDirectionBySeries!.get(id);
      if (!target) {
        target = new Map();
        result.obliquePitchByDirectionBySeries!.set(id, target);
      }
      for (const [direction, total] of summaries.byDirection)
        target.set(direction, total);
    }
  }
  // Publish a new snapshot identity for React, retaining the provisioned maps.
  return { ...result };
};

export const useObliqueData = (
  enabledDatasets: readonly ObliqueDataset[],
  enabled: boolean,
  options?: CatalogPriority
): ObliqueDataState => {
  const [state, setState] = useState<ObliqueDataState>(IDLE);
  const publicationSources = useRef(
    new WeakMap<ObliqueData, Map<string, string>>()
  );
  const datasetsRef = useRef(enabledDatasets);
  datasetsRef.current = enabledDatasets;
  const sourceKey = useMemo(
    () =>
      JSON.stringify(
        enabledDatasets.map(({ animations, ...source }) => source)
      ),
    [enabledDatasets]
  );
  const catalogSources = useMemo(
    () =>
      new Map(
        enabledDatasets.map(({ animations, ...source }) => [
          source.id,
          JSON.stringify(source),
        ])
      ),
    [enabledDatasets]
  );
  const priorityRef = useRef(options);
  priorityRef.current = options;
  const directionRef = useRef<
    (
      priority: CatalogPriority & { retry?: boolean }
    ) => Promise<ObliqueData | null>
  >(async () => null);
  const allRef = useRef<
    (options?: {
      retry?: boolean;
      includeNadir?: boolean;
    }) => Promise<ObliqueData | null>
  >(async () => null);
  const lifecycleRef = useRef(0);
  const committedRef = useRef<ObliqueData | null>(null);
  const publicationRevisions = useRef(new WeakMap<ObliqueData, number>());
  const publicationRevision = useRef(0);
  const committedRevision = useRef(0);
  const commitWaiters = useRef<
    Array<{ revision: number; resolve: (data: ObliqueData | null) => void }>
  >([]);
  const awaitCommitted = useCallback(
    async (load: () => Promise<ObliqueData | null>) => {
      const lifecycle = lifecycleRef.current;
      const target = await load();
      if (!target || lifecycle !== lifecycleRef.current) return null;
      if (committedRef.current === target) return target;
      const revision = publicationRevisions.current.get(target);
      if (revision === undefined) return null;
      if (committedRef.current && committedRevision.current >= revision)
        return committedRef.current;
      return new Promise<ObliqueData | null>((resolve) =>
        commitWaiters.current.push({ revision, resolve })
      );
    },
    []
  );
  const awaitDirection = useCallback(
    (heading: Radians, request?: { cameraView?: "nadir"; retry?: boolean }) =>
      awaitCommitted(() =>
        directionRef.current({
          priorityHeadingRad: heading,
          priorityCameraView: request?.cameraView,
          retry: request?.retry,
        })
      ),
    [awaitCommitted]
  );
  const awaitAll = useCallback(
    (request?: { retry?: boolean; includeNadir?: boolean }) =>
      awaitCommitted(() => allRef.current(request)),
    [awaitCommitted]
  );
  // Holds outlive queue restarts (series or priority changes): a new queue starts held.
  const idleHoldsRef = useRef(0);
  const idleQueueRef = useRef<{ hold: () => () => void } | null>(null);
  const releaseIdleQueueRef = useRef<(() => void) | null>(null);
  const holdIdleCatalogLoads = useCallback(() => {
    if (idleHoldsRef.current++ === 0)
      releaseIdleQueueRef.current = idleQueueRef.current?.hold() ?? null;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--idleHoldsRef.current > 0) return;
      releaseIdleQueueRef.current?.();
      releaseIdleQueueRef.current = null;
    };
  }, []);
  useEffect(() => {
    committedRef.current = enabled ? state.data : null;
    committedRevision.current = state.data
      ? publicationRevisions.current.get(state.data) ?? 0
      : 0;
    commitWaiters.current = commitWaiters.current.filter((waiter) => {
      if (
        !enabled ||
        (committedRef.current && committedRevision.current >= waiter.revision)
      ) {
        waiter.resolve(committedRef.current);
        return false;
      }
      return true;
    });
  }, [state.data, enabled]);
  const lastHintRef = useRef("");
  const hintKey = `${sourceKey}:${options?.priorityHeadingRad}:${options?.priorityCameraView}`;
  const prioritySeriesId = options?.prioritySeriesId;
  useEffect(() => {
    const datasets = datasetsRef.current;
    lastHintRef.current = hintKey;
    if (!enabled || datasets.length === 0) {
      setState(IDLE);
      return undefined;
    }
    syncObliqueCatalogCacheVersion();
    let cancelled = false;
    const statuses = new Map(
      datasets.map((dataset) => [
        dataset.id,
        {
          id: dataset.id,
          isLoading: true,
          error: null,
          imageCount: 0,
          obliqueComplete: false,
        } as ObliqueSeriesDataState,
      ])
    );
    const loaded = new Map<string, ObliqueData>();
    const assembledParts = new Set<ObliqueData>();
    let assembled: ObliqueData | undefined;
    const appendParts = (parts: Iterable<ObliqueData>) => {
      const additions: ObliqueData[] = [];
      for (const part of parts) {
        if (assembledParts.has(part)) continue;
        assembledParts.add(part);
        additions.push(part);
      }
      assembled = mergeSeries(additions, assembled);
      return assembled;
    };
    let mergedCount = 0;
    let merged: ObliqueData | null = null;
    const publish = () => {
      if (cancelled) return;
      const perSeries = [...statuses.values()];
      if (loaded.size !== mergedCount) {
        mergedCount = loaded.size;
        merged = loaded.size ? appendParts(loaded.values()) : null;
      }
      const data = merged;
      if (data) publicationSources.current.set(data, catalogSources);
      if (data && !publicationRevisions.current.has(data))
        publicationRevisions.current.set(data, ++publicationRevision.current);
      setState({
        data,
        perSeries,
        awaitDirection,
        awaitAll,
        holdIdleCatalogLoads,
        isLoading: perSeries.some((status) => status.isLoading),
        isAllDataReady: (data?.imageRecords.size ?? 0) > 0,
        isCatalogComplete:
          datasets.length > 0 &&
          perSeries.length === datasets.length &&
          perSeries.every((status) => status.obliqueComplete) &&
          (data?.imageRecords.size ?? 0) > 0,
        error:
          perSeries
            .filter((status) => status.error)
            .map(
              (status) =>
                `${
                  datasets.find((dataset) => dataset.id === status.id)?.label ??
                  status.id
                }: ${status.error}`
            )
            .join("; ") || null,
      });
    };
    publish();
    if (datasets.some((dataset) => dataset.directionalCatalogs?.length)) {
      const queue = createDirectionalCatalogQueue({
        datasets,
        priority: priorityRef.current ?? {},
        acquire: acquireSeries,
        publish: (parts, perSeries, data) => {
          if (cancelled) return;
          loaded.clear();
          for (const [key, data] of parts) loaded.set(key, data);
          mergedCount = loaded.size;
          merged = data;
          for (const status of perSeries) statuses.set(status.id, status);
          publish();
        },
        merge: appendParts,
      });
      directionRef.current = queue.promote;
      allRef.current = queue.all;
      idleQueueRef.current = queue;
      if (idleHoldsRef.current > 0) releaseIdleQueueRef.current = queue.hold();
      return () => {
        cancelled = true;
        lifecycleRef.current++;
        directionRef.current = async () => null;
        allRef.current = async () => null;
        committedRef.current = null;
        idleQueueRef.current = null;
        releaseIdleQueueRef.current = null;
        queue.cancel();
        for (const waiter of commitWaiters.current) waiter.resolve(null);
        commitWaiters.current = [];
      };
    }
    directionRef.current = async () => merged;
    const releases: (() => void)[] = [];
    const pending: Promise<ObliqueData>[] = [];
    allRef.current = async () => {
      let observed = 0;
      while (!cancelled && observed < pending.length) {
        const batch = pending.slice(observed);
        observed = pending.length;
        await Promise.allSettled(batch);
      }
      return cancelled ? null : merged;
    };
    directionRef.current = () => allRef.current();
    const load = (dataset: ObliqueDataset) => {
      if (cancelled) return;
      const request = acquireSeries(dataset);
      releases.push(request.release);
      pending.push(request.promise);
      request.promise
        .then((data) => {
          loaded.set(dataset.id, data);
          statuses.set(dataset.id, {
            id: dataset.id,
            isLoading: false,
            error:
              data.imageRecords.size > 0
                ? null
                : "Keine Bilder in den Metadaten.",
            imageCount: data.imageRecords.size,
            obliqueComplete: data.imageRecords.size > 0,
          });
          publish();
        })
        .catch((error: unknown) => {
          statuses.set(dataset.id, {
            id: dataset.id,
            isLoading: false,
            error:
              error instanceof Error
                ? error.message
                : "Metadaten konnten nicht geladen werden.",
            imageCount: 0,
            obliqueComplete: false,
          });
          publish();
        });
      return request.promise;
    };
    const priority = datasets.find(
      (dataset) => dataset.id === prioritySeriesId
    );
    if (priority) {
      const loadRemaining = () => {
        if (!cancelled)
          for (const dataset of datasets)
            if (dataset.id !== priority.id) load(dataset);
      };
      void load(priority)?.then(loadRemaining, loadRemaining);
    } else for (const dataset of datasets) load(dataset);
    return () => {
      cancelled = true;
      lifecycleRef.current++;
      directionRef.current = async () => null;
      allRef.current = async () => null;
      for (const waiter of commitWaiters.current) waiter.resolve(null);
      commitWaiters.current = [];
      for (const release of releases) release();
    };
  }, [sourceKey, enabled, prioritySeriesId]);
  useEffect(() => {
    if (lastHintRef.current === hintKey) return;
    lastHintRef.current = hintKey;
    if (
      enabled &&
      enabledDatasets.some((dataset) => dataset.directionalCatalogs?.length)
    )
      void directionRef.current({
        ...options,
        priorityImageId: undefined,
      });
  }, [enabled, hintKey]);
  // Series changes take effect in this render, before the fetch effect can publish.
  const filtered = useMemo(() => {
    const enabledIds = new Set(enabledDatasets.map((dataset) => dataset.id));
    if (
      state.data &&
      [...state.data.datasets.keys()].every((id) => enabledIds.has(id))
    )
      return state.data;
    return state.data
      ? {
          obliquePitchBySeries: new Map(
            [...(state.data.obliquePitchBySeries ?? [])].filter(([id]) =>
              enabledIds.has(id)
            )
          ),
          obliquePitchByDirectionBySeries: new Map(
            [...(state.data.obliquePitchByDirectionBySeries ?? [])].filter(
              ([id]) => enabledIds.has(id)
            )
          ),
          imageRecords: new Map(
            [...state.data.imageRecords].filter(([, record]) =>
              enabledIds.has(record.seriesId)
            )
          ),
          datasets: new Map(
            [...state.data.datasets].filter(([id]) => enabledIds.has(id))
          ),
          centers: new Map(
            [...state.data.centers].filter(
              ([id]) =>
                state.data?.imageRecords.get(id) &&
                enabledIds.has(state.data.imageRecords.get(id)!.seriesId)
            )
          ),
        }
      : null;
  }, [enabledDatasets, state.data]);
  const visibleStatuses = state.perSeries.filter((status) =>
    enabledDatasets.some((dataset) => dataset.id === status.id)
  );
  return {
    ...state,
    awaitDirection,
    awaitAll,
    holdIdleCatalogLoads,
    data: enabled ? filtered : null,
    isLoading: enabled && visibleStatuses.some((status) => status.isLoading),
    isAllDataReady: enabled && (filtered?.imageRecords.size ?? 0) > 0,
    isCatalogComplete:
      enabled &&
      enabledDatasets.length > 0 &&
      (filtered?.imageRecords.size ?? 0) > 0 &&
      enabledDatasets.every(
        (source) =>
          visibleStatuses.find((status) => status.id === source.id)
            ?.obliqueComplete === true &&
          state.data &&
          publicationSources.current.get(state.data)?.get(source.id) ===
            catalogSources.get(source.id)
      ),
    perSeries: visibleStatuses,
    error:
      visibleStatuses
        .filter((status) => status.error)
        .map(
          (status) =>
            `${
              enabledDatasets.find((dataset) => dataset.id === status.id)
                ?.label ?? status.id
            }: ${status.error}`
        )
        .join("; ") || null,
  };
};
