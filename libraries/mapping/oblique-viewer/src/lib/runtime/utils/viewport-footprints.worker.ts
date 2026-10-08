/// <reference lib="webworker" />
import { getWebMercatorFromWgs84Deg } from "@carma-geo/proj";
import { degToRadNumeric, type Degrees } from "@carma-units";
import type {
  ObliqueSelectionData,
  ObliqueImageRecord,
} from "../../core/types";
import { createImageSelectionIndex } from "../../core/utils/image-selection-index";
import {
  estimateGroundFootprint,
  rankImagesForView,
} from "../../core/utils/selection";
import {
  indexViewportFootprints,
  selectViewportFootprints,
  footprintPointCandidates,
  type FootprintPointQuery,
  type FootprintViewportQuery,
  type ViewportFootprint,
} from "../../core/utils/viewport-footprints";

let data: ObliqueSelectionData = {
  imageRecords: new Map(),
  centers: new Map(),
  datasets: new Map(),
};
let spatial: ReturnType<typeof createImageSelectionIndex> | null = null;
type Derived = {
  footprint: ViewportFootprint;
  indexed: ReturnType<typeof indexViewportFootprints>[number];
};
const derived = new Map<string, Derived | null>();
// Four sectors × sixteen nearby camera centres keep geometry work local to the view.
const LOCAL_PER_DIRECTION = 16;
const MAX_DERIVED = 512;
const footprint = (record: ObliqueImageRecord): Derived | null => {
  if (derived.has(record.id)) {
    const item = derived.get(record.id)!;
    derived.delete(record.id);
    derived.set(record.id, item);
    return item;
  }
  const dataset = data.datasets.get(record.seriesId);
  let item: Derived | null = null;
  if (dataset && record.pose) {
    try {
      const delivered = !!record.footprint && !record.footprintApproximate;
      const ring = delivered
        ? record.footprint
        : estimateGroundFootprint(record, dataset);
      if (ring) {
        const center = data.centers.get(record.id);
        const value: ViewportFootprint = {
          id: record.id,
          ring,
          groundCenter: center
            ? [center.longitude, center.latitude]
            : undefined,
          headingRad: degToRadNumeric(record.pose.bearingDeg),
          nadir: dataset.cameras[record.cameraId]?.view === "nadir",
          approximate: !delivered,
        };
        const indexed = indexViewportFootprints([value])[0];
        if (indexed) item = { footprint: value, indexed };
      }
    } catch {
      /* Invalid individual cameras do not hide other local images. */
    }
  }
  derived.set(record.id, item);
  while (derived.size > MAX_DERIVED)
    derived.delete(derived.keys().next().value!);
  return item;
};
self.onmessage = (
  event: MessageEvent<
    | {
        type: "init";
        data: ObliqueSelectionData;
        append?: boolean;
        complete?: boolean;
        revision?: number;
      }
    | { type: "query"; requestId: number; query: FootprintViewportQuery }
    | { type: "hover"; requestId: number; query: FootprintPointQuery }
  >
) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      if (!message.append) {
        data = {
          imageRecords: new Map(),
          centers: new Map(),
          datasets: new Map(),
        };
        spatial = null;
        derived.clear();
      }
      for (const [id, record] of message.data.imageRecords)
        data.imageRecords.set(id, record);
      for (const [id, center] of message.data.centers)
        data.centers.set(id, center);
      for (const [id, dataset] of message.data.datasets)
        data.datasets.set(id, dataset);
      if (!spatial)
        spatial = createImageSelectionIndex(
          {
            imageRecords: new Map(),
            centers: new Map(),
            datasets: new Map(),
          },
          { groundCenters: true }
        );
      spatial.append(message.data);
      if (message.complete !== false) {
        self.postMessage({ type: "ready", revision: message.revision });
      }
      return;
    }
    if (!spatial) return;
    const query = message.query;
    const point =
      message.type === "hover"
        ? message.query.point
        : message.query.point ?? message.query.center;
    const corners =
      message.type === "hover"
        ? message.query.viewportCorners
        : message.query.corners;
    const [x, y] = getWebMercatorFromWgs84Deg(
      point[0] as Degrees,
      point[1] as Degrees
    );
    const viewportRadius = Math.max(
      0,
      ...(corners ?? []).map(([lng, lat]) => {
        const [cx, cy] = getWebMercatorFromWgs84Deg(
          lng as Degrees,
          lat as Degrees
        );
        return Math.hypot(cx - x, cy - y);
      })
    );
    const radius =
      Math.max(
        0,
        ...[...data.datasets.values()].map(
          (dataset) => dataset.maxDistanceMeters
        )
      ) + viewportRadius;
    const search = {
      target: { longitude: point[0], latitude: point[1] },
      headingRad: query.headingRad,
      pitchRad: 0,
      maxDistanceMeters: radius,
      cameraView: query.viewMode === "nadir" ? ("nadir" as const) : undefined,
    };
    const local = new Map<string, Derived>();
    const gather = (allDirections: boolean) => {
      for (const record of spatial!.candidates(search, {
        allDirections,
        limitPerDirection: LOCAL_PER_DIRECTION,
      })) {
        const item = footprint(record);
        if (item) local.set(record.id, item);
      }
      return [...local.values()]
        .map((item) => item.indexed)
        .sort((a, b) => a.bounds[0] - b.bounds[0] || a.id.localeCompare(b.id));
    };
    const atPoint: FootprintPointQuery = {
      point,
      headingRad: query.headingRad,
      viewMode: query.viewMode,
      viewportCorners: corners,
      activeImageId:
        message.type === "hover" ? message.query.activeImageId : undefined,
      ...(message.type === "hover"
        ? {
            pitchRad: message.query.pitchRad,
            heightMeters: message.query.heightMeters,
            selectionStrategy: message.query.selectionStrategy,
          }
        : {}),
    };
    let index = gather(false);
    let candidates = footprintPointCandidates(index, atPoint);
    if (candidates.headingFirst && query.viewMode !== "nadir") {
      index = gather(true);
      candidates = footprintPointCandidates(index, atPoint);
    }
    let ids =
      message.type === "hover"
        ? candidates.ids
        : selectViewportFootprints(index, message.query);
    if (
      message.type === "hover" &&
      atPoint.selectionStrategy === "best-resolution"
    ) {
      // Reuse the calibrated ranking shared with camera navigation. The pointer
      // was intersected once in the scene; no per-photo scene raycasts are needed.
      const ranked = rankImagesForView(
        data,
        {
          ...search,
          target: {
            ...search.target,
            heightMeters: atPoint.heightMeters,
            heightDatum: "dhhn2016",
          },
          pitchRad: atPoint.pitchRad ?? Math.PI / 4,
          selectionStrategy: atPoint.selectionStrategy,
          numCandidates: ids.length,
        },
        ids.map((id) => data.imageRecords.get(id)!)
      );
      // Keep the heading-first gap behavior when no camera actually covers it.
      if (ranked.some((candidate) => candidate.coversTarget))
        ids = ranked.map(({ record }) => record.id);
    }
    const footprints = ids.map((id) => local.get(id)!.footprint);
    self.postMessage(
      message.type === "hover"
        ? {
            type: "hoverResult",
            requestId: message.requestId,
            id: ids[0] ?? null,
            ids,
            headingFirst: candidates.headingFirst,
            footprints,
          }
        : { type: "result", requestId: message.requestId, ids, footprints }
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.type === "init" ? undefined : message.requestId,
      requestType: message.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
