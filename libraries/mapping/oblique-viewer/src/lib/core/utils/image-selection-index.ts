import { shortestAngleDelta } from "@carma-commons/math";
import { getProj4Converter } from "@carma-geo/proj";
import {
  PI_OVER_FOUR,
  degToRad,
  type Degrees,
  type Meters,
  type Radians,
} from "@carma-units";
import type {
  CardinalDirection,
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
  PointWithSector,
} from "../types";
import { getCameraCalibration } from "./calibration";
import { wgs84ToDatasetXY, type DatasetConverter } from "./imageRecord";

const CELL_SIZE_METERS = 1000 as Meters;
type DirectionGroup = {
  meanHeading: Radians;
  headingX: number;
  headingY: number;
  cells: Map<string, ObliqueImageRecord[]>;
};
type SeriesIndex = {
  converter: DatasetConverter;
  maxDistance: Meters;
  oblique: Map<CardinalDirection, DirectionGroup>;
  nadir: DirectionGroup;
};

const emptyGroup = (): DirectionGroup => ({
  meanHeading: 0 as Radians,
  headingX: 0,
  headingY: 0,
  cells: new Map(),
});

/** References into one catalog; direction averages and spatial cells are prepared once. */
export const createImageSelectionIndex = (
  data: ObliqueSelectionData,
  options: { groundCenters?: boolean } = {}
) => {
  const centers = new Map<string, PointWithSector>();
  const indexedIds = new Set<string>();
  const series = new Map<string, SeriesIndex>();
  const ensureSeries = (id: string, dataset: ObliqueDataset) => {
    let index = series.get(id);
    if (!index) {
      index = {
        converter: getProj4Converter(dataset.crs, "EPSG:4326"),
        maxDistance: dataset.maxDistanceMeters as Meters,
        oblique: new Map(),
        nadir: emptyGroup(),
      };
      series.set(id, index);
    }
    return index;
  };
  const append = (part: ObliqueSelectionData) => {
    for (const [id, center] of part.centers) centers.set(id, center);
    const changedGroups = new Set<DirectionGroup>();
    for (const [id, dataset] of part.datasets) {
      const index = ensureSeries(id, dataset);
      // Dataset metadata is static across directional catalog shards; refreshing this
      // reference also supports a future catalog revision without rebuilding the grid.
      index.maxDistance = dataset.maxDistanceMeters as Meters;
    }
    for (const record of part.imageRecords.values()) {
      if (indexedIds.has(record.id)) continue;
      const index = series.get(record.seriesId);
      const dataset = part.datasets.get(record.seriesId);
      const point =
        (options.groundCenters ? centers.get(record.id) : undefined) ?? record;
      if (!index || !dataset || !Number.isFinite(point.x + point.y)) continue;
      const nadir =
        getCameraCalibration(dataset, record.cameraId).view === "nadir";
      const heading = record.pose
        ? degToRad(record.pose.bearingDeg as Degrees)
        : (record.fallbackHeading as Radians);
      if (!nadir && !Number.isFinite(heading)) continue;
      let group = nadir ? index.nadir : index.oblique.get(record.sector);
      if (!group) {
        group = emptyGroup();
        index.oblique.set(record.sector, group);
      }
      if (!nadir) {
        group.headingX += Math.sin(heading);
        group.headingY += Math.cos(heading);
        changedGroups.add(group);
      }
      const cell =
        Math.floor(point.x / CELL_SIZE_METERS) +
        ":" +
        Math.floor(point.y / CELL_SIZE_METERS);
      const records = group.cells.get(cell);
      if (records) records.push(record);
      else group.cells.set(cell, [record]);
      indexedIds.add(record.id);
    }
    for (const group of changedGroups)
      group.meanHeading = Math.atan2(group.headingX, group.headingY) as Radians;
  };
  const position = (record: ObliqueImageRecord) =>
    (options.groundCenters ? centers.get(record.id) : undefined) ?? record;
  const index = {
    append,
    candidates: function* (
      query: ObliqueViewQuery,
      shortlist: { allDirections?: boolean; limitPerDirection?: number } = {}
    ): Iterable<ObliqueImageRecord> {
      if (
        ![
          query.target.longitude,
          query.target.latitude,
          query.headingRad,
        ].every(Number.isFinite)
      )
        return;
      const enabled = query.enabledSeriesIds
        ? new Set(query.enabledSeriesIds)
        : null;
      for (const [id, index] of series) {
        if (enabled && !enabled.has(id)) continue;
        const [x, y] = wgs84ToDatasetXY(
          index.converter,
          query.target.longitude,
          query.target.latitude
        );
        const radius = query.maxDistanceMeters ?? index.maxDistance;
        if (!Number.isFinite(x + y) || !Number.isFinite(radius) || radius < 0)
          continue;
        let group: DirectionGroup | undefined;
        if (query.cameraView === "nadir") group = index.nadir;
        else {
          let difference = Infinity;
          for (const candidate of index.oblique.values()) {
            const delta = Math.abs(
              shortestAngleDelta(query.headingRad, candidate.meanHeading)
            );
            if (delta < difference) {
              difference = delta;
              group = candidate;
            }
          }
          // A loaded sector must not substitute for a still-missing rotation sector.
          if (
            query.excludeImageId &&
            difference > PI_OVER_FOUR &&
            !shortlist.allDirections
          )
            continue;
        }
        const groups =
          shortlist.allDirections && query.cameraView !== "nadir"
            ? [...index.oblique.values()]
            : group
            ? [group]
            : [];
        for (const selectedGroup of groups) {
          const nearby: { record: ObliqueImageRecord; distance: number }[] = [];
          const visit = (records: ObliqueImageRecord[]) => {
            for (const record of records) {
              const point = position(record);
              const distance = Math.hypot(point.x - x, point.y - y);
              if (distance <= radius) nearby.push({ record, distance });
            }
          };
          const minX = Math.floor((x - radius) / CELL_SIZE_METERS);
          const maxX = Math.floor((x + radius) / CELL_SIZE_METERS);
          const minY = Math.floor((y - radius) / CELL_SIZE_METERS);
          const maxY = Math.floor((y + radius) / CELL_SIZE_METERS);
          // Large caller-provided radii must not turn into an unbounded empty-cell scan.
          if (
            (maxX - minX + 1) * (maxY - minY + 1) >
            selectedGroup.cells.size
          ) {
            for (const records of selectedGroup.cells.values()) {
              visit(records);
            }
          } else {
            for (let cx = minX; cx <= maxX; cx++) {
              for (let cy = minY; cy <= maxY; cy++) {
                const records = selectedGroup.cells.get(cx + ":" + cy);
                if (!records) continue;
                visit(records);
              }
            }
          }
          if (shortlist.limitPerDirection !== undefined)
            nearby.sort(
              (a, b) =>
                a.distance - b.distance ||
                a.record.id.localeCompare(b.record.id)
            );
          const limit =
            shortlist.limitPerDirection === undefined
              ? nearby.length
              : Math.max(0, Math.floor(shortlist.limitPerDirection));
          for (let i = 0; i < Math.min(limit, nearby.length); i++)
            yield nearby[i].record;
        }
      }
    },
  };
  append(data);
  return index;
};
