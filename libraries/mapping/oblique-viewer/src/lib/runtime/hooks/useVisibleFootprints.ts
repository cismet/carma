import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { degToRadNumeric } from "@carma-units";
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
  query: FootprintPointQuery;
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
}: {
  map: MaplibreMap | null;
  data: ObliqueSelectionData | null;
  enabled: boolean;
  locked: boolean;
  viewMode: ObliqueViewMode;
  selectionStrategy?: FootprintPointQuery["selectionStrategy"];
}): {
  records: readonly ObliqueImageRecord[];
  findAtGroundPoint: (
    point: [number, number],
    activeImageId?: string | null,
    heightMeters?: number
  ) => Promise<ObliqueImageRecord | null | undefined>;
} => {
  const [records, setRecords] = useState<ObliqueImageRecord[]>([]);
  const workerRef = useRef<Worker | null>(null);
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
  const selectionRef = useRef(selectionStrategy);
  selectionRef.current = selectionStrategy;
  useEffect(stopHover, [selectionStrategy, stopHover]);
  const modeRef = useRef(viewMode);
  modeRef.current = viewMode;
  const findAtGroundPoint = useCallback(
    (
      point: [number, number],
      activeImageId?: string | null,
      heightMeters?: number
    ) =>
      new Promise<ObliqueImageRecord | null | undefined>((resolve) => {
        const worker = workerRef.current;
        if (!map || !worker || !catalogReadyRef.current || lockedRef.current) {
          resolve(undefined);
          return;
        }
        const request: HoverRequest = {
          requestId: ++hoverRequestIdRef.current,
          query: {
            point,
            headingRad: degToRadNumeric(map.getBearing()),
            pitchRad: degToRadNumeric(map.getPitch()),
            viewMode: modeRef.current,
            activeImageId,
            heightMeters,
            selectionStrategy: selectionRef.current,
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
    if (!map || !worker || !catalogReadyRef.current || lockedRef.current) return;
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
  }, [map]);
  useEffect(() => {
    setRecords([]);
    lastQueryKeyRef.current = "";
    viewportCornersRef.current = undefined;
    catalogReadyRef.current = false;
    catalogSenderRef.current = () => undefined;
    if (!map || !enabled || typeof Worker === "undefined")
      return undefined;
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
    let catalogEntries: ReturnType<ObliqueSelectionData["imageRecords"]["values"]>;
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
        if (!active || response.requestId !== active.requestId) return;
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
        else
          finish(
            response.id ? dataRef.current?.imageRecords.get(response.id) ?? null : null
          );
        return;
      }
      if (lockedRef.current) return;
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
            datasets: sentCount > 0 || firstChunk
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
    catalogSenderRef.current = (nextData) => {
      if (disposed || !nextData) return;
      const nextKey = [...nextData.datasets.keys()].sort().join("|");
      const catalogChanged =
        firstChunk ||
        nextKey !== datasetKey ||
        nextData.imageRecords.size !== catalogRecordCount;
      latestData = nextData;
      // Metadata-only publications must not invalidate an in-flight ready reply.
      if (!catalogChanged) return;
      if (
        nextKey !== datasetKey ||
        nextData.imageRecords.size < indexedRecordCount
      ) {
        datasetKey = nextKey;
        indexedRecordCount = 0;
        firstChunk = true;
        catalogReadyRef.current = false;
        setRecords([]);
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
      worker.terminate();
    };
  }, [map, enabled, query, sendHover, stopHover]);
  useEffect(() => {
    catalogSenderRef.current(data);
  }, [data]);
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
  }, [map, data, enabled, locked, viewMode, query, stopHover]);
  return { records, findAtGroundPoint };
};
