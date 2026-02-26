import type {
  KnownAnnotationType,
  KnownMeasurementType,
} from "../../types/measurementKindRegistry";
import {
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
} from "../../types/measurementKindRegistry";

export type InfoBoxAreaSurfaceType = Extract<
  KnownMeasurementType,
  | typeof SPATIAL_MARKUP_KIND_AREA
  | typeof SPATIAL_MARKUP_KIND_PLANAR
  | typeof SPATIAL_MARKUP_KIND_VERTICAL
>;
export type InfoBoxAnnotationKind = KnownAnnotationType;

export type InfoBoxMeasurementViewType =
  | { kind: typeof SPATIAL_MARKUP_KIND_POINT; isLivePreview: boolean }
  | { kind: typeof SPATIAL_MARKUP_KIND_DISTANCE; isLivePreview: boolean }
  | { kind: typeof SPATIAL_MARKUP_KIND_POLYLINE }
  | {
      kind: typeof SPATIAL_MARKUP_KIND_AREA;
      surfaceType: InfoBoxAreaSurfaceType;
      surfaceTypeLabel: string;
    }
  | { kind: "pureLabel"; isLivePreview: boolean }
  | { kind: "annotation"; annotationKind: InfoBoxAnnotationKind };

type ResolveInfoBoxMeasurementViewTypeParams = {
  isPolygonInfoMode: boolean;
  hasSelectedPolylineSummary: boolean;
  selectedPolygonSurfaceTypeValue: "roof" | "facade" | "terrain" | "footprint";
  selectedPolygonSurfaceTypeLabel: string;
  isTraverseMeasurement: boolean;
  isPureLabelMeasurement: boolean;
  isPureLabelPreviewMode: boolean;
  showPointInfoMode: boolean;
  isPointCreatePreviewMode: boolean;
  isDistanceCreatePreviewMode: boolean;
  isCurrentPointDistanceMeasurement: boolean;
};

const resolveAreaSurfaceType = (
  selectedSurfaceType: "roof" | "facade" | "terrain" | "footprint"
): InfoBoxAreaSurfaceType => {
  if (selectedSurfaceType === "roof") return SPATIAL_MARKUP_KIND_PLANAR;
  if (selectedSurfaceType === "facade") return SPATIAL_MARKUP_KIND_VERTICAL;
  return SPATIAL_MARKUP_KIND_AREA;
};

export const resolveInfoBoxMeasurementViewType = ({
  isPolygonInfoMode,
  hasSelectedPolylineSummary,
  selectedPolygonSurfaceTypeValue,
  selectedPolygonSurfaceTypeLabel,
  isTraverseMeasurement,
  isPureLabelMeasurement,
  isPureLabelPreviewMode,
  showPointInfoMode,
  isPointCreatePreviewMode,
  isDistanceCreatePreviewMode,
  isCurrentPointDistanceMeasurement,
}: ResolveInfoBoxMeasurementViewTypeParams): InfoBoxMeasurementViewType => {
  if (isPolygonInfoMode) {
    if (hasSelectedPolylineSummary) {
      return { kind: SPATIAL_MARKUP_KIND_POLYLINE };
    }
    return {
      kind: SPATIAL_MARKUP_KIND_AREA,
      surfaceType: resolveAreaSurfaceType(selectedPolygonSurfaceTypeValue),
      surfaceTypeLabel: selectedPolygonSurfaceTypeLabel,
    };
  }

  if (isTraverseMeasurement) {
    return { kind: SPATIAL_MARKUP_KIND_POLYLINE };
  }

  if (isPureLabelMeasurement || isPureLabelPreviewMode) {
    return { kind: "pureLabel", isLivePreview: isPureLabelPreviewMode };
  }

  if (isDistanceCreatePreviewMode) {
    return { kind: SPATIAL_MARKUP_KIND_DISTANCE, isLivePreview: true };
  }

  if (isPointCreatePreviewMode) {
    return { kind: SPATIAL_MARKUP_KIND_POINT, isLivePreview: true };
  }

  if (showPointInfoMode) {
    if (isCurrentPointDistanceMeasurement) {
      return { kind: SPATIAL_MARKUP_KIND_DISTANCE, isLivePreview: false };
    }
    return { kind: SPATIAL_MARKUP_KIND_POINT, isLivePreview: false };
  }

  return { kind: "annotation", annotationKind: SPATIAL_MARKUP_KIND_LABEL };
};
