import {
  degToRadNumeric,
  radToDegNumeric,
  zeroToTwoPi,
  type Degrees,
  type Radians,
} from "@carma-units";
import type {
  ObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueDataset,
} from "../types";
import { cardinalLetter } from "./orientation";

export type CatalogImageFilter = {
  query: string;
  id: string;
  series: string[];
  cameras: string[];
  strips: string[];
  waypoints: string[];
  views: string[];
  headingMin: Degrees | null;
  headingMax: Degrees | null;
};
export const EMPTY_CATALOG_IMAGE_FILTER: CatalogImageFilter = {
  query: "",
  id: "",
  series: [],
  cameras: [],
  strips: [],
  waypoints: [],
  views: [],
  headingMin: null,
  headingMax: null,
};
export const catalogImageHeading = (
  record: ObliqueImageRecord
): Degrees | null => {
  const radians =
    record.pose && Number.isFinite(record.pose.bearingDeg)
      ? degToRadNumeric(record.pose.bearingDeg)
      : record.fallbackHeading;
  return Number.isFinite(radians)
    ? (radToDegNumeric(zeroToTwoPi(radians as Radians)) as Degrees)
    : null;
};
export const catalogFilterActive = (filter: CatalogImageFilter) =>
  !!(
    filter.query.trim() ||
    filter.id.trim() ||
    filter.series.length ||
    filter.cameras.length ||
    filter.strips.length ||
    filter.waypoints.length ||
    filter.views.length ||
    filter.headingMin !== null ||
    filter.headingMax !== null
  );
const selected = (values: readonly string[], value: string) =>
  !values.length || values.includes(value);
const field = (value: unknown) =>
  value === undefined || value === null ? "—" : String(value);
export const catalogImageMatches = (
  record: ObliqueImageRecord,
  dataset: ObliqueDataset | undefined,
  filter: CatalogImageFilter
) => {
  const view = dataset?.cameras[record.cameraId]?.view ?? "—";
  if (
    !selected(filter.series, record.seriesId) ||
    !selected(filter.cameras, record.cameraId) ||
    !selected(filter.strips, field(record.lineIndex)) ||
    !selected(filter.waypoints, field(record.waypointIndex)) ||
    !selected(filter.views, view)
  )
    return false;
  if (
    filter.id.trim() &&
    !record.sourceId.toLowerCase().includes(filter.id.trim().toLowerCase())
  )
    return false;
  const heading = catalogImageHeading(record),
    lo = filter.headingMin,
    hi = filter.headingMax;
  if (lo !== null || hi !== null) {
    if (heading === null) return false;
    if (lo !== null && hi !== null && lo > hi) {
      if (heading < lo && heading > hi) return false;
    } else if ((lo !== null && heading < lo) || (hi !== null && heading > hi))
      return false;
  }
  const query = filter.query.trim().toLowerCase();
  if (!query) return true;
  const text = [
    record.sourceId,
    dataset?.label,
    record.seriesId,
    record.cameraId,
    view,
    record.lineIndex,
    record.waypointIndex,
    record.photoIndex,
    record.stationId,
    cardinalLetter(record.sector),
    heading?.toFixed(1),
  ]
    .map(field)
    .join(" ")
    .toLowerCase();
  return query.split(/\s+/).every((part) => text.includes(part));
};
/** One eligible record set feeds both scene footprints and photo selection. */
export const filterObliqueCatalog = (
  data: ObliqueSelectionData | null,
  filter: CatalogImageFilter
): ObliqueSelectionData | null => {
  if (!data || !catalogFilterActive(filter)) return data;
  const imageRecords = new Map(
    [...data.imageRecords].filter(([, record]) =>
      catalogImageMatches(record, data.datasets.get(record.seriesId), filter)
    )
  );
  const centers = new Map(
    [...data.centers].filter(([id]) => imageRecords.has(id))
  );
  return { ...data, imageRecords, centers };
};

/** Use the same calibrated footprint as the scene, with bounded UI yields. */
export const catalogImageExtent = async (
  data: ObliqueSelectionData,
  ids: readonly string[]
) => {
  const { getGeographicRingBounds } = await import("@carma-geo/helpers");
  const { estimateGroundFootprint } = await import("./selection");
  const points: [number, number][] = [];
  for (let index = 0; index < ids.length; index++) {
    const record = data.imageRecords.get(ids[index]);
    if (!record) continue;
    const dataset = data.datasets.get(record.seriesId);
    let ring = record.footprint;
    if (!ring && dataset) {
      try {
        ring = estimateGroundFootprint(record, dataset);
      } catch {
        /* Use an available catalogue centre for this individual camera. */
      }
    }
    const center = record.catalogCenter ?? data.centers.get(record.id);
    const coordinates = ring?.length
      ? ring
      : center
      ? [[center.longitude, center.latitude] as [number, number]]
      : [[record.centerWGS84[0], record.centerWGS84[1]] as [number, number]];
    for (const point of coordinates)
      if (point.length === 2 && point.every(Number.isFinite))
        points.push(point);
    if (index % 256 === 255)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (!points.length) return null;
  const { west, south, east, north } = getGeographicRingBounds(points);
  return [west, south, east, north] as const;
};
