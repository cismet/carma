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
import { usesFlightStripTopology } from "./capture-neighbors";
import { NAVIGATION_SELECTION } from "../constants";
import { wgs84ToDatasetXY, type DatasetConverter } from "./imageRecord";

const CELL_SIZE_METERS = 1000 as Meters;
type DirectionGroup = {
  meanHeading: Radians;
  headingX: number;
  headingY: number;
  cells: Map<string, ObliqueImageRecord[]>;
};
type SeriesIndex = {
  dataset: ObliqueDataset;
  converter: DatasetConverter;
  maxDistance: Meters;
  oblique: Map<CardinalDirection, DirectionGroup>;
  nadir: DirectionGroup;
  captureLines: Map<number, Map<string, ObliqueImageRecord>>;
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
  const registrations = new Map<string, {
    record: ObliqueImageRecord;
    index: SeriesIndex;
    group: DirectionGroup;
    sector: CardinalDirection;
    cell: string;
    captureLine?: number;
    x: number;
    y: number;
    headingX: number;
    headingY: number;
  }>();
  const series = new Map<string, SeriesIndex>();
  const ensureSeries = (id: string, dataset: ObliqueDataset) => {
    let index = series.get(id);
    if (!index) {
      index = {
        dataset,
        converter: getProj4Converter(dataset.crs, "EPSG:4326"),
        maxDistance: dataset.maxDistanceMeters as Meters,
        oblique: new Map(),
        nadir: emptyGroup(),
        captureLines: new Map(),
      };
      series.set(id, index);
    }
    return index;
  };
  const removeCapture = (index: SeriesIndex, line: number | undefined, id: string) => {
    if (line === undefined) return;
    const records = index.captureLines.get(line);
    records?.delete(id);
    if (!records?.size) index.captureLines.delete(line);
  };
  const addCapture = (index: SeriesIndex, record: ObliqueImageRecord) => {
    if (!usesFlightStripTopology(index.dataset) || record.lineIndex === undefined)
      return undefined;
    let records = index.captureLines.get(record.lineIndex);
    if (!records) { records = new Map(); index.captureLines.set(record.lineIndex, records); }
    records.set(record.id, record);
    return record.lineIndex;
  };
  const append = (part: ObliqueSelectionData) => {
    for (const [id, center] of part.centers) centers.set(id, center);
    const changedGroups = new Set<DirectionGroup>();
    for (const [id, dataset] of part.datasets) {
      const index = ensureSeries(id, dataset);
      // Cardinal shards share one static CRS. Position/pose corrections below
      // change only affected buckets; a different CRS requires a fresh index.
      index.dataset = dataset;
      index.maxDistance = dataset.maxDistanceMeters as Meters;
    }
    const changed = new Map(part.imageRecords);
    if (options.groundCenters)
      for (const id of part.centers.keys()) {
        const previous = registrations.get(id);
        if (previous && !changed.has(id)) changed.set(id, previous.record);
      }
    const remove = (id: string) => {
      const previous = registrations.get(id);
      if (!previous) return;
      const { group, index, cell } = previous;
      removeCapture(index, previous.captureLine, id);
      const records = group.cells.get(cell);
      const at = records?.findIndex((record) => record.id === id) ?? -1;
      if (records && at >= 0) {
        records.splice(at, 1);
        if (!records.length) group.cells.delete(cell);
      }
      group.headingX -= previous.headingX;
      group.headingY -= previous.headingY;
      changedGroups.add(group);
      if (!group.cells.size && group !== index.nadir)
        index.oblique.delete(previous.sector);
      registrations.delete(id);
    };
    for (const record of changed.values()) {
      const index = series.get(record.seriesId);
      const point = (options.groundCenters ? centers.get(record.id) : undefined) ?? record;
      if (!index || !Number.isFinite(point.x + point.y)) { remove(record.id); continue; }
      const nadir = getCameraCalibration(index.dataset, record.cameraId).view === "nadir";
      const heading = record.pose ? degToRad(record.pose.bearingDeg as Degrees) : (record.fallbackHeading as Radians);
      if (!nadir && !Number.isFinite(heading)) { remove(record.id); continue; }
      const headingX = nadir ? 0 : Math.sin(heading), headingY = nadir ? 0 : Math.cos(heading);
      const cell = Math.floor(point.x / CELL_SIZE_METERS) + ":" + Math.floor(point.y / CELL_SIZE_METERS);
      const previous = registrations.get(record.id);
      const existingGroup = nadir ? index.nadir : index.oblique.get(record.sector);
      if (previous && previous.index === index && previous.group === existingGroup && previous.cell === cell) {
        removeCapture(index, previous.captureLine, record.id);
        previous.captureLine = addCapture(index, record);
        if (previous.record !== record) {
          const records = previous.group.cells.get(cell)!;
          const at = records.indexOf(previous.record);
          if (at >= 0) records[at] = record;
          previous.record = record;
        }
        if (previous.headingX !== headingX || previous.headingY !== headingY) {
          previous.group.headingX += headingX - previous.headingX;
          previous.group.headingY += headingY - previous.headingY;
          changedGroups.add(previous.group);
        }
        previous.x = point.x; previous.y = point.y;
        previous.headingX = headingX; previous.headingY = headingY;
        continue;
      }
      remove(record.id);
      let group = nadir ? index.nadir : index.oblique.get(record.sector);
      if (!group) { group = emptyGroup(); index.oblique.set(record.sector, group); }
      group.headingX += headingX; group.headingY += headingY; changedGroups.add(group);
      const records = group.cells.get(cell);
      if (records) records.push(record); else group.cells.set(cell, [record]);
      registrations.set(record.id, { record, index, group, sector: record.sector, cell,
        captureLine: addCapture(index, record), x: point.x, y: point.y, headingX, headingY });
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
      const captureSource = query.navigationSelection === NAVIGATION_SELECTION.CAPTURE_NEIGHBOR &&
        query.excludeImageId ? registrations.get(query.excludeImageId) : undefined;
      const legacyCapture = captureSource && usesFlightStripTopology(captureSource.index.dataset)
        ? captureSource : undefined;
      for (const [id, index] of series) {
        if (enabled && !enabled.has(id)) continue;
        if (legacyCapture && legacyCapture.index !== index) continue;
        if (legacyCapture && legacyCapture.captureLine !== undefined) {
          const current = legacyCapture.record;
          // Camera-neighbor topology must not depend on where its footprint
          // lands. Opposing looks may be kilometers apart on the ground.
          for (let line = legacyCapture.captureLine - 1; line <= legacyCapture.captureLine + 1; line++) {
            for (const record of index.captureLines.get(line)?.values() ?? []) {
              const exactAdjacentCapture = line === legacyCapture.captureLine &&
                current.waypointIndex !== undefined && record.waypointIndex !== undefined &&
                Math.abs(record.waypointIndex - current.waypointIndex) === 1;
              if (exactAdjacentCapture || Math.hypot(record.x - current.x, record.y - current.y) <= 350)
                yield record;
            }
          }
          continue;
        }
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
