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

/** Viewport display and full-catalog hover share one worker-backed footprint index. */
export const useVisibleFootprints = ({
  map,
  data,
  enabled,
  locked,
  viewMode,
}: {
  map: MaplibreMap | null;
  data: ObliqueSelectionData | null;
  enabled: boolean;
  locked: boolean;
  viewMode: ObliqueViewMode;
}): {
  records: readonly ObliqueImageRecord[];
  findAtGroundPoint: (
    point: [number, number],
    activeImageId?: string | null
  ) => Promise<ObliqueImageRecord | null | undefined>;
} => {
  const [records, setRecords] = useState<ObliqueImageRecord[]>([]);
  const workerRef = useRef<Worker | null>(null);
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
        // The pointer also controls whether the viewport keeps its sector filter.
        if (request.query.viewportCorners) {
          worker.postMessage({
            type: "query",
            requestId: ++requestIdRef.current,
            query: {
              corners: request.query.viewportCorners,
              center: request.query.point,
              point: request.query.point,
              headingRad: request.query.headingRad,
              viewMode: request.query.viewMode,
            } satisfies FootprintViewportQuery,
          });
        }
      } catch {
        stopHover();
      }
    },
    [stopHover]
  );
  const lastQueryKeyRef = useRef("");
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const modeRef = useRef(viewMode);
  modeRef.current = viewMode;
  const findAtGroundPoint = useCallback(
    (point: [number, number], activeImageId?: string | null) =>
      new Promise<ObliqueImageRecord | null | undefined>((resolve) => {
        const worker = workerRef.current;
        if (!map || !worker || lockedRef.current) {
          resolve(undefined);
          return;
        }
        const request: HoverRequest = {
          requestId: ++hoverRequestIdRef.current,
          query: {
            point,
            headingRad: degToRadNumeric(map.getBearing()),
            viewMode: modeRef.current,
            activeImageId,
            viewportCorners: [
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
    if (!map || !worker || lockedRef.current) return;
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
    if (!map || !data || !enabled || typeof Worker === "undefined")
      return undefined;
    const worker = new Worker(
      new URL("../utils/viewport-footprints.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;
    let disposed = false;
    worker.onmessage = (
      event: MessageEvent<{
        type: string;
        requestId?: number;
        ids?: string[];
        id?: string | null;
        requestType?: string;
      }>
    ) => {
      if (disposed) return;
      const response = event.data;
      if (
        response.type === "hoverResult" ||
        (response.type === "error" && response.requestType === "hover")
      ) {
        const active = activeHoverRef.current;
        if (!active || response.requestId !== active.requestId) return;
        clearTimeout(hoverTimeoutRef.current);
        active.resolve(
          lockedRef.current || response.type === "error"
            ? undefined
            : response.id
            ? data.imageRecords.get(response.id) ?? null
            : null
        );
        activeHoverRef.current = null;
        const queued = queuedHoverRef.current;
        queuedHoverRef.current = null;
        if (queued) {
          if (lockedRef.current) queued.resolve(undefined);
          else sendHover(worker, queued);
        }
        return;
      }
      if (lockedRef.current) return;
      if (event.data.type === "ready") query();
      else if (
        event.data.type === "result" &&
        event.data.requestId === requestIdRef.current
      ) {
        const next = (event.data.ids ?? [])
          .map((id) => data.imageRecords.get(id))
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
      stopHover();
      if (workerRef.current === worker) workerRef.current = null;
      worker.terminate();
    };
    const catalog: ViewportFootprint[] = [];
    for (const record of data.imageRecords.values()) {
      if (!record.footprint || !record.pose) continue;
      catalog.push({
        id: record.id,
        ring: record.footprint,
        headingRad: degToRadNumeric(record.pose.bearingDeg),
        nadir:
          data.datasets.get(record.seriesId)?.cameras[record.cameraId]?.view ===
          "nadir",
      });
    }
    worker.postMessage({ type: "init", catalog });
    return () => {
      disposed = true;
      requestIdRef.current++;
      workerRef.current = null;
      stopHover();
      worker.terminate();
    };
  }, [map, data, enabled, query, sendHover, stopHover]);
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
