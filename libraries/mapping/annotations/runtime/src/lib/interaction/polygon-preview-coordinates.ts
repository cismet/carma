import type { Vector3 } from "three";
import type { AnnotationGeographicCoordinate } from "@carma-mapping/annotations/core";

import type { PointQueryPickResult } from "../registry";
import {
  canAppendAreaPointWithoutActualEdgeCrossing,
  type AreaEdgeCrossingProjectionMode,
} from "./area-edge-crossing.helpers";

type CoordinateList = readonly AnnotationGeographicCoordinate[];

type PolygonAuthoringMeasurementCoordinates = {
  lineCoordinates: CoordinateList;
  fillCoordinates: CoordinateList | null;
  fillCoordinateRings?: readonly CoordinateList[];
  markerCoordinates?: CoordinateList;
};

export type PolygonAuthoringMeasurementCoordinatesResolution =
  | CoordinateList
  | PolygonAuthoringMeasurementCoordinates;

export type PolygonAuthoringMeasurementCoordinatesResolver = (args: {
  coordinates: CoordinateList;
  previousCoordinates?: CoordinateList;
  preferredFacingPositionECEF?: Vector3 | null;
  inputModifier?: PointQueryPickResult["inputModifier"];
}) => PolygonAuthoringMeasurementCoordinatesResolution | null;

export type PolygonPreviewGeometry = {
  lineCoordinates: CoordinateList;
  markerCoordinates: CoordinateList;
  fillCoordinateRings: readonly CoordinateList[];
  hasLineCoordinates: boolean;
  hasFillCoordinates: boolean;
  /** False when the hovered point would make an actual edge cross another. */
  pickAcceptable: boolean;
};

const isCoordinateList = (
  resolution: PolygonAuthoringMeasurementCoordinatesResolution | null
): resolution is CoordinateList => Array.isArray(resolution);

const normalizeMeasurementCoordinatesResolution = (
  resolution: PolygonAuthoringMeasurementCoordinatesResolution | null
): PolygonAuthoringMeasurementCoordinates | null =>
  isCoordinateList(resolution)
    ? {
        lineCoordinates: resolution,
        fillCoordinates: resolution,
        fillCoordinateRings: [resolution],
        markerCoordinates: resolution,
      }
    : resolution;

const buildClosedLoopCoordinates = (
  coordinates: CoordinateList
): CoordinateList =>
  coordinates.length < 3 ? [] : [...coordinates, coordinates[0]!];

/** The outline of the fill rings; several rings are joined through their first and last points. */
export const buildFillLoopPreviewCoordinates = (
  fillCoordinateRings: readonly CoordinateList[]
): CoordinateList => {
  const validFillCoordinateRings = fillCoordinateRings.filter(
    (coordinates) => coordinates.length >= 3
  );
  if (validFillCoordinateRings.length === 0) {
    return [];
  }
  if (validFillCoordinateRings.length === 1) {
    return buildClosedLoopCoordinates(validFillCoordinateRings[0]!);
  }

  return [
    validFillCoordinateRings[0]![0]!,
    ...validFillCoordinateRings.map(
      (coordinates) => coordinates[coordinates.length - 1]!
    ),
  ];
};

/**
 * The line, marker and fill coordinates of the draft with the hovered point
 * appended. Without a resolver the hover sample is drawn as it is; with one,
 * the resolver's result decides, and a sample that would cross an existing
 * edge is dropped.
 */
export const resolvePolygonPreviewGeometry = ({
  draftCoordinates,
  hoverCoordinate,
  hoverInputModifier,
  resolveMeasurementCoordinates,
  getPreferredFacingPositionECEF,
  projectionMode,
}: {
  draftCoordinates: CoordinateList;
  hoverCoordinate: AnnotationGeographicCoordinate | null;
  hoverInputModifier: PointQueryPickResult["inputModifier"];
  resolveMeasurementCoordinates?: PolygonAuthoringMeasurementCoordinatesResolver;
  getPreferredFacingPositionECEF: () => Vector3 | null;
  projectionMode: AreaEdgeCrossingProjectionMode;
}): PolygonPreviewGeometry => {
  const sampleCoordinates = hoverCoordinate
    ? [...draftCoordinates, hoverCoordinate]
    : [...draftCoordinates];
  const resolveCoordinates = (
    coordinates: CoordinateList,
    options: { inputModifier?: PointQueryPickResult["inputModifier"] } = {}
  ) =>
    normalizeMeasurementCoordinatesResolution(
      resolveMeasurementCoordinates
        ? resolveMeasurementCoordinates({
            coordinates,
            previousCoordinates: draftCoordinates,
            preferredFacingPositionECEF: getPreferredFacingPositionECEF(),
            ...(options.inputModifier
              ? { inputModifier: options.inputModifier }
              : {}),
          })
        : coordinates
    );
  const rawResolvedSampleCoordinates = resolveCoordinates(sampleCoordinates, {
    inputModifier: hoverInputModifier,
  });
  const resolvedDraftCoordinates =
    resolveMeasurementCoordinates && hoverCoordinate
      ? resolveCoordinates(draftCoordinates)
      : null;
  const sampleLineCoordinates =
    rawResolvedSampleCoordinates?.lineCoordinates ?? null;
  const sampleRejectedByActualEdgeCrossing = Boolean(
    hoverCoordinate &&
      sampleLineCoordinates &&
      !canAppendAreaPointWithoutActualEdgeCrossing({
        previousCoordinates:
          resolvedDraftCoordinates?.lineCoordinates ?? draftCoordinates,
        nextCoordinates: sampleLineCoordinates,
        projectionMode,
      })
  );
  const resolvedSampleCoordinates = sampleRejectedByActualEdgeCrossing
    ? null
    : rawResolvedSampleCoordinates;
  const resolvedMeasurementCoordinates =
    resolvedSampleCoordinates ?? resolvedDraftCoordinates;
  const isSamplingInitialSegment =
    resolveMeasurementCoordinates !== undefined && sampleCoordinates.length < 3;
  const lineCoordinates =
    resolvedMeasurementCoordinates?.lineCoordinates ??
    (sampleRejectedByActualEdgeCrossing
      ? draftCoordinates
      : isSamplingInitialSegment || !resolveMeasurementCoordinates
      ? sampleCoordinates
      : draftCoordinates);
  const fillCoordinates = sampleRejectedByActualEdgeCrossing
    ? null
    : !resolveMeasurementCoordinates
    ? sampleCoordinates
    : isSamplingInitialSegment
    ? null
    : resolvedMeasurementCoordinates?.fillCoordinates ?? null;
  const fillCoordinateRings = sampleRejectedByActualEdgeCrossing
    ? []
    : !resolveMeasurementCoordinates
    ? [sampleCoordinates]
    : isSamplingInitialSegment
    ? []
    : resolvedMeasurementCoordinates?.fillCoordinateRings ??
      (fillCoordinates ? [fillCoordinates] : []);
  const markerCoordinates = isSamplingInitialSegment
    ? resolvedSampleCoordinates?.markerCoordinates ?? lineCoordinates
    : sampleRejectedByActualEdgeCrossing
    ? draftCoordinates
    : resolvedSampleCoordinates || !hoverCoordinate
    ? sampleCoordinates
    : draftCoordinates;

  return {
    lineCoordinates,
    markerCoordinates,
    fillCoordinateRings,
    hasLineCoordinates:
      !resolveMeasurementCoordinates ||
      isSamplingInitialSegment ||
      resolvedMeasurementCoordinates !== null,
    hasFillCoordinates: fillCoordinateRings.some(
      (coordinates) => coordinates.length >= 3
    ),
    pickAcceptable: !hoverCoordinate || resolvedSampleCoordinates !== null,
  };
};
