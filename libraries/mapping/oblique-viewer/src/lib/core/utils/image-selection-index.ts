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
  ObliqueImageRecord,
  ObliqueSelectionData,
  ObliqueViewQuery,
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
export const createImageSelectionIndex = (data: ObliqueSelectionData) => {
  const series = new Map<string, SeriesIndex>();
  for (const [id, dataset] of data.datasets) {
    series.set(id, {
      converter: getProj4Converter(dataset.crs, "EPSG:4326"),
      maxDistance: dataset.maxDistanceMeters as Meters,
      oblique: new Map(),
      nadir: emptyGroup(),
    });
  }
  for (const record of data.imageRecords.values()) {
    const index = series.get(record.seriesId);
    const dataset = data.datasets.get(record.seriesId);
    if (!index || !dataset || !Number.isFinite(record.x + record.y)) continue;
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
    }
    const cell =
      Math.floor(record.x / CELL_SIZE_METERS) +
      ":" +
      Math.floor(record.y / CELL_SIZE_METERS);
    const records = group.cells.get(cell);
    if (records) records.push(record);
    else group.cells.set(cell, [record]);
  }
  for (const index of series.values()) {
    for (const group of index.oblique.values()) {
      group.meanHeading = Math.atan2(group.headingX, group.headingY) as Radians;
    }
  }
  return {
    candidates: function* (
      query: ObliqueViewQuery
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
          if (query.excludeImageId && difference > PI_OVER_FOUR) continue;
        }
        if (!group) continue;
        const minX = Math.floor((x - radius) / CELL_SIZE_METERS);
        const maxX = Math.floor((x + radius) / CELL_SIZE_METERS);
        const minY = Math.floor((y - radius) / CELL_SIZE_METERS);
        const maxY = Math.floor((y + radius) / CELL_SIZE_METERS);
        // Large caller-provided radii must not turn into an unbounded empty-cell scan.
        if ((maxX - minX + 1) * (maxY - minY + 1) > group.cells.size) {
          for (const records of group.cells.values()) {
            for (const record of records) {
              if (Math.hypot(record.x - x, record.y - y) <= radius)
                yield record;
            }
          }
        } else {
          for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
              const records = group.cells.get(cx + ":" + cy);
              if (!records) continue;
              for (const record of records) {
                if (Math.hypot(record.x - x, record.y - y) <= radius)
                  yield record;
              }
            }
          }
        }
      }
    },
  };
};
