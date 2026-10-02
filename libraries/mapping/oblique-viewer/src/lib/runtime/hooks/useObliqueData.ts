import { useEffect, useMemo, useState } from "react";
import type { ObliqueDataset } from "../../core/types";
import {
  loadObliqueSeriesData,
  type ObliqueData,
} from "../utils/load-oblique-series";
export type { ObliqueData } from "../utils/load-oblique-series";
import {
  OBLIQUE_CATALOG_FRESHNESS_MS,
  syncObliqueCatalogCacheVersion,
} from "../utils/oblique-series-cache-version";

export type ObliqueSeriesDataState = {
  id: string;
  isLoading: boolean;
  error: string | null;
  imageCount: number;
};

export type ObliqueDataState = {
  data: ObliqueData | null;
  isLoading: boolean;
  /** At least one loaded series is usable; a second failed series does not block it. */
  isAllDataReady: boolean;
  error: string | null;
  perSeries: ObliqueSeriesDataState[];
};

const IDLE: ObliqueDataState = {
  data: null,
  isLoading: false,
  isAllDataReady: false,
  error: null,
  perSeries: [],
};
type SeriesLoad = {
  promise: Promise<ObliqueData>;
  users: number;
  isPending: () => boolean;
  isFresh: () => boolean;
  cancel: () => void;
};
const cache = new Map<string, SeriesLoad>();

const createSeriesLoad = (dataset: ObliqueDataset): SeriesLoad => {
  let settled = false;
  let completedAt = 0;
  let cancel = () => {};
  const promise = new Promise<ObliqueData>((resolve, reject) => {
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      worker.onmessage = (
        event: MessageEvent<{ data?: ObliqueData; error?: string }>
      ) =>
        finish(
          event.data.error ? new Error(event.data.error) : undefined,
          event.data.data
        );
      worker.onerror = () =>
        finish(new Error("Metadaten-Worker konnte nicht geladen werden."));
      // Runtime easing callbacks stay in the UI; worker inputs contain only cloneable values.
      worker.postMessage({
        dataset: {
          ...dataset,
          animations: {},
          exteriorOrientationsURI: new URL(
            dataset.exteriorOrientationsURI,
            window.location.href
          ).href,
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
      !settled || Date.now() - completedAt < OBLIQUE_CATALOG_FRESHNESS_MS,
    cancel: () => cancel(),
  };
};

/** Share completed catalogs, but stop a pending request when its last viewer releases it. */
const acquireSeries = (dataset: ObliqueDataset) => {
  // Configuration/calibration changes cannot reuse a differently interpreted catalog.
  const key = JSON.stringify(dataset);
  let entry = cache.get(key);
  if (!entry?.isFresh()) {
    entry = createSeriesLoad(dataset);
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

const mergeSeries = (loaded: Iterable<ObliqueData>): ObliqueData => {
  const result: ObliqueData = {
    imageRecords: new Map(),
    datasets: new Map(),
    centers: new Map(),
  };
  for (const data of loaded) {
    for (const [id, record] of data.imageRecords)
      result.imageRecords.set(id, record);
    for (const [id, dataset] of data.datasets) result.datasets.set(id, dataset);
    for (const [id, center] of data.centers) result.centers.set(id, center);
  }
  return result;
};

export const useObliqueData = (
  enabledDatasets: readonly ObliqueDataset[],
  enabled: boolean
): ObliqueDataState => {
  const [state, setState] = useState<ObliqueDataState>(IDLE);
  useEffect(() => {
    if (!enabled || enabledDatasets.length === 0) {
      setState(IDLE);
      return undefined;
    }
    syncObliqueCatalogCacheVersion();
    let cancelled = false;
    const statuses = new Map(
      enabledDatasets.map((dataset) => [
        dataset.id,
        {
          id: dataset.id,
          isLoading: true,
          error: null,
          imageCount: 0,
        } as ObliqueSeriesDataState,
      ])
    );
    const loaded = new Map<string, ObliqueData>();
    const publish = () => {
      if (cancelled) return;
      const perSeries = [...statuses.values()];
      const data = loaded.size > 0 ? mergeSeries(loaded.values()) : null;
      setState({
        data,
        perSeries,
        isLoading: perSeries.some((status) => status.isLoading),
        isAllDataReady: (data?.imageRecords.size ?? 0) > 0,
        error:
          perSeries
            .filter((status) => status.error)
            .map(
              (status) =>
                `${
                  enabledDatasets.find((dataset) => dataset.id === status.id)
                    ?.label ?? status.id
                }: ${status.error}`
            )
            .join("; ") || null,
      });
    };
    publish();
    const releases: (() => void)[] = [];
    for (const dataset of enabledDatasets) {
      const request = acquireSeries(dataset);
      releases.push(request.release);
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
          });
          publish();
        });
    }
    return () => {
      cancelled = true;
      for (const release of releases) release();
    };
  }, [enabledDatasets, enabled]);
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
    data: enabled ? filtered : null,
    isLoading: enabled && visibleStatuses.some((status) => status.isLoading),
    isAllDataReady: enabled && (filtered?.imageRecords.size ?? 0) > 0,
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
