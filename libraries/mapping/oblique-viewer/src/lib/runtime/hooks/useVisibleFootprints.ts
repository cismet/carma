import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { degToRadNumeric, type CssPixels } from "@carma-units";
import { shortestAngleDelta } from "@carma-commons/math";
import type {
  ObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewMode,
} from "../../core/types";
import type {
  FootprintViewportQuery,
  FootprintPointQuery,
  ViewportFootprint,
} from "../../core/utils/viewport-footprints";

type HoverRequest = {
  requestId: number;
  picking?: boolean;
  query: FootprintPointQuery;
  screenPoint?: Readonly<{ x: CssPixels; y: CssPixels }>;
  resolve: (record: ObliqueImageRecord | null | undefined) => void;
};

/** Spatial metadata is indexed once; only nearby cameras receive derived rings. */
export const useVisibleFootprints = ({
  map,
  data,
  enabled,
  locked,
  viewMode,
  selectionStrategy,
  catalogFilterKey = "",
  mosaicSeriesId = null,
  prewarmEnabled = false,
  uncappedHoverCandidates = false,
  pickHoverCandidates,
}: {
  map: MaplibreMap | null;
  data: ObliqueSelectionData | null;
  enabled: boolean;
  locked: boolean;
  viewMode: ObliqueViewMode;
  selectionStrategy?: FootprintPointQuery["selectionStrategy"];
  /** Filter changes reset the existing worker index, including equally sized subsets. */
  catalogFilterKey?: string;
  mosaicSeriesId?: string | null;
  /** All current-direction overlaps for background loading, independent of outline limits. */
  prewarmEnabled?: boolean;
  uncappedHoverCandidates?: boolean;
  pickHoverCandidates?: (
    records: ObliqueImageRecord[],
    query: FootprintPointQuery,
    headingFirst: boolean,
    isCurrent: () => boolean,
    screenPoint?: Readonly<{ x: CssPixels; y: CssPixels }>
  ) => Promise<ObliqueImageRecord | null | undefined>;
}): {
  records: readonly ObliqueImageRecord[];
  mosaicRecords: readonly ObliqueImageRecord[];
  prewarmRecords: readonly ObliqueImageRecord[];
  /** Latest hydrated NG picker pool, without a per-pointer React publication. */
  readHoverCandidates: () => readonly ObliqueImageRecord[];
  findAtGroundPoint: (
    point: [number, number],
    activeImageId?: string | null,
    heightMeters?: number,
    screenPoint?: Readonly<{ x: CssPixels; y: CssPixels }>
  ) => Promise<ObliqueImageRecord | null | undefined>;
} => {
  const [records, setRecords] = useState<ObliqueImageRecord[]>([]);
  const [mosaicRecords, setMosaicRecords] = useState<ObliqueImageRecord[]>([]);
  const [prewarmRecords, setPrewarmRecords] = useState<ObliqueImageRecord[]>(
    []
  );
  const hoverCandidatesRef = useRef<readonly ObliqueImageRecord[]>([]);
  const readHoverCandidates = useCallback(() => hoverCandidatesRef.current, []);
  const publishHoverCandidates = useCallback(
    (next: readonly ObliqueImageRecord[]) => {
      const previous = hoverCandidatesRef.current;
      const idsChanged =
        previous.length !== next.length ||
        previous.some((record, index) => record.id !== next[index].id);
      if (
        idsChanged ||
        previous.some((record, index) => record !== next[index])
      )
        hoverCandidatesRef.current = next;
      if (idsChanged) map?.triggerRepaint();
    },
    [map]
  );
  const prewarmEnabledRef = useRef(prewarmEnabled);
  prewarmEnabledRef.current = prewarmEnabled;
  const mosaicSeriesRef = useRef(mosaicSeriesId);
  mosaicSeriesRef.current = mosaicSeriesId;
  const workerRef = useRef<Worker | null>(null);
  const catalogFilterKeyRef = useRef(catalogFilterKey);
  catalogFilterKeyRef.current = catalogFilterKey;
  const dataRef = useRef(data);
  dataRef.current = data;
  const catalogSenderRef = useRef<(data: ObliqueSelectionData | null) => void>(
    () => undefined
  );
  const catalogReadyRef = useRef(false);
  const hydratedRef = useRef(new Map<string, ObliqueImageRecord>());
  const requestIdRef = useRef(0);
  const hoverRequestIdRef = useRef(0);
  const activeHoverRef = useRef<HoverRequest | null>(null);
  const queuedHoverRef = useRef<HoverRequest | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const stopHover = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    activeHoverRef.current?.resolve(undefined);
    queuedHoverRef.current?.resolve(undefined);
    activeHoverRef.current = queuedHoverRef.current = null;
  }, []);
  const sendHover = useCallback(
    (worker: Worker, request: HoverRequest) => {
      activeHoverRef.current = request;
      hoverTimeoutRef.current = setTimeout(() => {
        stopHover();
        if (workerRef.current === worker) workerRef.current = null;
        worker.terminate();
      }, 10000);
      try {
        worker.postMessage({
          type: "hover",
          requestId: request.requestId,
          query: request.query,
        });
      } catch {
        stopHover();
      }
    },
    [stopHover]
  );
  const lastQueryKeyRef = useRef("");
  const viewportCornersRef = useRef<[number, number][] | undefined>();
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const uncappedHoverRef = useRef(uncappedHoverCandidates);
  uncappedHoverRef.current = uncappedHoverCandidates;
  const pickerRef = useRef(pickHoverCandidates);
  pickerRef.current = pickHoverCandidates;
  const selectionRef = useRef(selectionStrategy);
  selectionRef.current = selectionStrategy;
  useEffect(stopHover, [
    selectionStrategy,
    uncappedHoverCandidates,
    pickHoverCandidates,
    stopHover,
  ]);
  const modeRef = useRef(viewMode);
  modeRef.current = viewMode;
  const findAtGroundPoint = useCallback(
    (
      point: [number, number],
      activeImageId?: string | null,
      heightMeters?: number,
      screenPoint?: Readonly<{ x: CssPixels; y: CssPixels }>
    ) =>
      new Promise<ObliqueImageRecord | null | undefined>((resolve) => {
        const worker = workerRef.current;
        if (!map || !worker || !catalogReadyRef.current || lockedRef.current) {
          resolve(undefined);
          return;
        }
        const request: HoverRequest = {
          requestId: ++hoverRequestIdRef.current,
          screenPoint,
          query: {
            point,
            headingRad: degToRadNumeric(map.getBearing()),
            pitchRad: degToRadNumeric(map.getPitch()),
            viewMode: modeRef.current,
            activeImageId,
            heightMeters,
            selectionStrategy: selectionRef.current,
            uncappedHoverCandidates: uncappedHoverRef.current,
            viewportCorners:
              viewportCornersRef.current ??
              [
                [0, 0],
                [map.transform.width, 0],
                [map.transform.width, map.transform.height],
                [0, map.transform.height],
              ].map(([x, y]) => {
                const coordinate = map.unproject([x, y]);
                return [coordinate.lng, coordinate.lat] as [number, number];
              }),
          },
          resolve,
        };
        if (!activeHoverRef.current) sendHover(worker, request);
        else {
          queuedHoverRef.current?.resolve(undefined);
          queuedHoverRef.current = request;
        }
      }),
    [map, sendHover]
  );
  const query = useCallback(() => {
    const worker = workerRef.current;
    if (!map || !worker || !catalogReadyRef.current || lockedRef.current)
      return;
    const { width, height, centerOffset } = map.transform;
    if (width <= 0 || height <= 0) return;
    const mapCenter = map.getCenter();
    const key = [
      width,
      height,
      map.getZoom(),
      map.getBearing(),
      map.getPitch(),
      map.getVerticalFieldOfView(),
      centerOffset.x,
      centerOffset.y,
      mapCenter.lng,
      mapCenter.lat,
      modeRef.current,
      mosaicSeriesRef.current,
      prewarmEnabledRef.current,
    ].join("|");
    if (key === lastQueryKeyRef.current) return;
    lastQueryKeyRef.current = key;
    const corners = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ].map(([x, y]) => {
      const point = map.unproject([x, y]);
      return [point.lng, point.lat] as [number, number];
    });
    viewportCornersRef.current = corners;
    const center = map.unproject([width / 2, height / 2]);
    const viewport: FootprintViewportQuery = {
      corners,
      center: [center.lng, center.lat],
      headingRad: degToRadNumeric(map.getBearing()),
      viewMode: modeRef.current,
    };
    worker.postMessage({
      type: "query",
      requestId: ++requestIdRef.current,
      query: viewport,
    });
    if (prewarmEnabledRef.current)
      worker.postMessage({
        type: "prewarm",
        requestId: requestIdRef.current,
        query: viewport,
      });
    if (mosaicSeriesRef.current)
      worker.postMessage({
        type: "mosaic",
        requestId: requestIdRef.current,
        seriesId: mosaicSeriesRef.current,
        query: viewport,
      });
  }, [map]);
  useEffect(() => {
    setRecords([]);
    setMosaicRecords([]);
    setPrewarmRecords([]);
    lastQueryKeyRef.current = "";
    viewportCornersRef.current = undefined;
    catalogReadyRef.current = false;
    catalogSenderRef.current = () => undefined;
    if (!map || !enabled || typeof Worker === "undefined") return undefined;
    const worker = new Worker(
      new URL("../utils/viewport-footprints.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;
    let disposed = false;
    let catalogTimer: ReturnType<typeof setTimeout> | undefined;
    let latestData = dataRef.current;
    let indexedRecordCount = 0;
    let firstChunk = true;
    let pumpingCatalog = false;
    let catalogRevision = 0;
    let catalogRecordCount = 0;
    let catalogEntries: ReturnType<
      ObliqueSelectionData["imageRecords"]["values"]
    >;
    let nextCatalogRecord: ReturnType<typeof catalogEntries.next>;
    let datasetKey = latestData
      ? [...latestData.datasets.keys()].sort().join("|")
      : "";
    const hydrated = hydratedRef.current;
    const pruneHydrated = (nextData: ObliqueSelectionData) => {
      for (const [id, record] of hydrated) {
        if (nextData.imageRecords.get(id) === record) continue;
        if (record.footprintApproximate) delete record.footprint;
        hydrated.delete(id);
      }
    };
    const hydrate = (footprints: ViewportFootprint[] = []) => {
      const currentData = dataRef.current;
      for (const footprint of [...footprints].reverse()) {
        const record = currentData?.imageRecords.get(footprint.id);
        if (!record) continue;
        if (
          !record.footprint ||
          record.footprint.length !== footprint.ring.length ||
          record.footprint.some(
            (point, i) =>
              point[0] !== footprint.ring[i][0] ||
              point[1] !== footprint.ring[i][1]
          )
        )
          record.footprint = footprint.ring.map((point) => [
            point[0],
            point[1],
          ]);
        record.footprintApproximate = footprint.approximate !== false;
        hydrated.delete(record.id);
        hydrated.set(record.id, record);
      }
      while (hydrated.size > 512) {
        const [id, record] = hydrated.entries().next().value!;
        hydrated.delete(id);
        if (record.footprintApproximate) delete record.footprint;
      }
    };
    worker.onmessage = (
      event: MessageEvent<{
        type: string;
        requestId?: number;
        revision?: number;
        ids?: string[];
        id?: string | null;
        headingFirst?: boolean;
        footprints?: ViewportFootprint[];
        requestType?: string;
        seriesId?: string;
      }>
    ) => {
      if (disposed) return;
      const response = event.data;
      if (response.type === "ready") {
        if (response.revision !== catalogRevision) return;
        catalogReadyRef.current = true;
        query();
        return;
      }
      if (
        response.type === "hoverResult" ||
        (response.type === "error" && response.requestType === "hover")
      ) {
        const active = activeHoverRef.current;
        if (
          !active ||
          active.picking ||
          response.requestId !== active.requestId
        )
          return;
        clearTimeout(hoverTimeoutRef.current);
        hydrate(response.footprints);
        const finish = (record: ObliqueImageRecord | null | undefined) => {
          if (disposed || activeHoverRef.current !== active) {
            active.resolve(undefined);
            return;
          }
          active.resolve(lockedRef.current ? undefined : record);
          activeHoverRef.current = null;
          const queued = queuedHoverRef.current;
          queuedHoverRef.current = null;
          if (queued) {
            if (lockedRef.current) queued.resolve(undefined);
            else sendHover(worker, queued);
          }
        };
        if (lockedRef.current || response.type === "error") finish(undefined);
        else {
          let selectedId = response.id;
          const screenPoint = active.screenPoint;
          const current = dataRef.current;
          const picker = pickerRef.current;
          if (screenPoint && current && picker) {
            active.picking = true;
            const ids = response.ids ?? (response.id ? [response.id] : []);
            const candidates = ids
              .map((id) => current.imageRecords.get(id))
              .filter((record): record is ObliqueImageRecord => !!record);
            const isCurrent = () =>
              !disposed &&
              !lockedRef.current &&
              activeHoverRef.current === active &&
              !queuedHoverRef.current &&
              pickerRef.current === picker;
            // Keep one active pick and coalesce subsequent pointer positions.
            // A stale result drains the queue without publishing its old winner.
            void Promise.resolve()
              .then(() => {
                if (!isCurrent()) return undefined;
                publishHoverCandidates(candidates);
                return picker(
                  candidates,
                  active.query,
                  !!response.headingFirst,
                  isCurrent,
                  screenPoint
                );
              })
              .then((record) => finish(isCurrent() ? record : undefined))
              .catch(() => finish(undefined));
            return;
          }
          if (screenPoint && current && typeof map.project === "function") {
            let bestDistance = Infinity;
            const ids = response.ids ?? (response.id ? [response.id] : []);
            const headingDistance = (id: string) => {
              const bearing = current.imageRecords.get(id)?.pose?.bearingDeg;
              return bearing === undefined
                ? Infinity
                : Math.abs(
                    shortestAngleDelta(
                      active.query.headingRad,
                      degToRadNumeric(bearing)
                    )
                  );
            };
            const bestHeading =
              response.headingFirst && ids.length
                ? headingDistance(ids[0])
                : undefined;
            for (const id of ids) {
              if (
                bestHeading !== undefined &&
                id !== ids[0] &&
                (!Number.isFinite(bestHeading) ||
                  Math.abs(headingDistance(id) - bestHeading) > 1e-8)
              )
                continue;
              const center = current.centers.get(id);
              if (!center) continue;
              let projected;
              try {
                projected = map.project([center.longitude, center.latitude]);
              } catch {
                continue;
              }
              const distance =
                (projected.x - screenPoint.x) ** 2 +
                (projected.y - screenPoint.y) ** 2;
              if (Number.isFinite(distance) && distance < bestDistance) {
                selectedId = id;
                bestDistance = distance;
              }
            }
          }
          finish(
            selectedId ? current?.imageRecords.get(selectedId) ?? null : null
          );
        }
        return;
      }
      if (lockedRef.current) return;
      if (
        response.type === "prewarmResult" &&
        prewarmEnabledRef.current &&
        response.requestId === requestIdRef.current
      ) {
        const next = (response.ids ?? [])
          .map((id) => dataRef.current?.imageRecords.get(id))
          .filter(
            (record): record is ObliqueImageRecord =>
              !!record && !!dataRef.current?.datasets.has(record.seriesId)
          );
        setPrewarmRecords((previous) =>
          previous.length === next.length &&
          previous.every((record, i) => record === next[i])
            ? previous
            : next
        );
        return;
      }
      if (
        response.type === "mosaicResult" &&
        response.requestId === requestIdRef.current &&
        response.seriesId === mosaicSeriesRef.current
      ) {
        const next = (response.ids ?? [])
          .map((id) => dataRef.current?.imageRecords.get(id))
          .filter(
            (record): record is ObliqueImageRecord =>
              !!record && record.seriesId === mosaicSeriesRef.current
          );
        setMosaicRecords((previous) =>
          previous.length === next.length &&
          previous.every((record, i) => record === next[i])
            ? previous
            : next
        );
        return;
      }
      if (
        event.data.type === "result" &&
        event.data.requestId === requestIdRef.current
      ) {
        hydrate(response.footprints);
        const next = (event.data.ids ?? [])
          .map((id) => dataRef.current?.imageRecords.get(id))
          .filter((record): record is ObliqueImageRecord => !!record);
        setRecords((previous) =>
          previous.length === next.length &&
          previous.every((record, i) => record === next[i])
            ? previous
            : next
        );
      }
    };
    worker.onerror = worker.onmessageerror = () => {
      disposed = true;
      clearTimeout(catalogTimer);
      stopHover();
      if (workerRef.current === worker) workerRef.current = null;
      catalogReadyRef.current = false;
      catalogSenderRef.current = () => undefined;
      worker.terminate();
    };
    const sendCatalog = () => {
      if (disposed || pumpingCatalog || !latestData) return;
      pumpingCatalog = true;
      const imageRecords: ObliqueSelectionData["imageRecords"] = new Map();
      const centers: ObliqueSelectionData["centers"] = new Map();
      const sourceData = latestData;
      for (let i = 0; i < 512 && !nextCatalogRecord.done; i++) {
        const record = nextCatalogRecord.value;
        nextCatalogRecord = catalogEntries.next();
        if (record.footprintApproximate && record.footprint) {
          const { footprint: _ring, ...metadata } = record;
          imageRecords.set(record.id, metadata);
        } else imageRecords.set(record.id, record);
        const center = sourceData.centers.get(record.id);
        if (center) centers.set(record.id, center);
      }
      const done = nextCatalogRecord.done;
      const sentCount = imageRecords.size;
      const revision = catalogRevision;
      try {
        worker.postMessage({
          type: "init",
          data: {
            imageRecords,
            centers,
            datasets:
              sentCount > 0 || firstChunk
                ? new Map(
                    [...sourceData.datasets].map(([id, dataset]) => [
                      id,
                      { ...dataset, animations: {} },
                    ])
                  )
                : new Map(),
          },
          append: !firstChunk,
          complete: done,
          revision: done ? revision : undefined,
        });
        indexedRecordCount += sentCount;
        firstChunk = false;
        if (done) {
          pumpingCatalog = false;
          if (latestData.imageRecords.size > indexedRecordCount)
            catalogTimer = setTimeout(sendCatalog, 0);
        } else {
          pumpingCatalog = false;
          catalogTimer = setTimeout(sendCatalog, 0);
        }
      } catch {
        pumpingCatalog = false;
        disposed = true;
        catalogReadyRef.current = false;
        catalogSenderRef.current = () => undefined;
        if (workerRef.current === worker) workerRef.current = null;
        stopHover();
        worker.terminate();
      }
    };
    let indexedFilterKey = catalogFilterKeyRef.current;
    catalogSenderRef.current = (nextData) => {
      if (disposed || !nextData) return;
      const nextKey = [...nextData.datasets.keys()].sort().join("|");
      const filterChanged = indexedFilterKey !== catalogFilterKeyRef.current;
      const catalogChanged =
        filterChanged ||
        firstChunk ||
        nextKey !== datasetKey ||
        nextData.imageRecords.size !== catalogRecordCount;
      latestData = nextData;
      // Metadata-only publications must not invalidate an in-flight ready reply.
      if (!catalogChanged) return;
      if (
        filterChanged ||
        nextKey !== datasetKey ||
        nextData.imageRecords.size < indexedRecordCount
      ) {
        indexedFilterKey = catalogFilterKeyRef.current;
        datasetKey = nextKey;
        indexedRecordCount = 0;
        firstChunk = true;
        catalogReadyRef.current = false;
        setRecords([]);
        setMosaicRecords([]);
        setPrewarmRecords([]);
        publishHoverCandidates([]);
        pruneHydrated(nextData);
      }
      requestIdRef.current++;
      lastQueryKeyRef.current = "";
      catalogRecordCount = nextData.imageRecords.size;
      catalogRevision++;
      // Retain the cursor across chunks; revisit the existing prefix only when a
      // newly published map appends another cardinal catalog segment.
      catalogEntries = nextData.imageRecords.values();
      nextCatalogRecord = catalogEntries.next();
      for (let i = 0; i < indexedRecordCount && !nextCatalogRecord.done; i++)
        nextCatalogRecord = catalogEntries.next();
      if (nextData.imageRecords.size > indexedRecordCount || firstChunk) {
        catalogReadyRef.current = false;
        clearTimeout(catalogTimer);
        catalogTimer = setTimeout(sendCatalog, 0);
      }
    };
    if (latestData) catalogSenderRef.current(latestData);
    return () => {
      disposed = true;
      clearTimeout(catalogTimer);
      requestIdRef.current++;
      workerRef.current = null;
      catalogReadyRef.current = false;
      catalogSenderRef.current = () => undefined;
      stopHover();
      publishHoverCandidates([]);
      worker.terminate();
    };
  }, [map, enabled, query, sendHover, stopHover, publishHoverCandidates]);
  useEffect(() => {
    catalogSenderRef.current(data);
    if (!data) publishHoverCandidates([]);
  }, [data, catalogFilterKey, publishHoverCandidates]);
  useEffect(() => {
    requestIdRef.current++;
    stopHover();
    lastQueryKeyRef.current = "";
    if (!map || !enabled || locked) return undefined;
    let timer: number | undefined;
    const schedule = () => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        query();
      }, 100);
    };
    const flush = () => {
      window.clearTimeout(timer);
      timer = undefined;
      query();
    };
    map.on("move", schedule);
    map.on("moveend", flush);
    map.on("resize", flush);
    query();
    return () => {
      window.clearTimeout(timer);
      map.off("move", schedule);
      map.off("moveend", flush);
      map.off("resize", flush);
    };
  }, [
    map,
    data,
    enabled,
    locked,
    viewMode,
    mosaicSeriesId,
    prewarmEnabled,
    query,
    stopHover,
  ]);
  useEffect(() => {
    if (!prewarmEnabled) setPrewarmRecords([]);
  }, [prewarmEnabled]);
  const activePrewarmRecords = useMemo(
    () =>
      enabled && prewarmEnabled
        ? prewarmRecords.filter((record) => data?.datasets.has(record.seriesId))
        : [],
    [enabled, prewarmEnabled, prewarmRecords, data]
  );
  const activeMosaicRecords = useMemo(
    () =>
      enabled && mosaicSeriesId
        ? mosaicRecords.filter((record) => record.seriesId === mosaicSeriesId)
        : [],
    [enabled, mosaicSeriesId, mosaicRecords]
  );
  return {
    records,
    mosaicRecords: activeMosaicRecords,
    prewarmRecords: activePrewarmRecords,
    readHoverCandidates,
    findAtGroundPoint,
  };
};
