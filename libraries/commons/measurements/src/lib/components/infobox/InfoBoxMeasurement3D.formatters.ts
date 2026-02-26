import {
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_LABEL,
  SPATIAL_MARKUP_KIND_PLANAR,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
  SPATIAL_MARKUP_KIND_VERTICAL,
} from "../../types/measurementKindRegistry";
import { type InfoBoxMeasurementViewType } from "./InfoBoxMeasurement3D.types";

export const getActiveMeasurementTypeTitle = (
  measurementViewType: InfoBoxMeasurementViewType
): string => {
  if (measurementViewType.kind === SPATIAL_MARKUP_KIND_POLYLINE) {
    return "3D Polygonzugmessung";
  }

  if (measurementViewType.kind === SPATIAL_MARKUP_KIND_AREA) {
    if (measurementViewType.surfaceType === SPATIAL_MARKUP_KIND_PLANAR) {
      return "3D Flächenmessung · Dach";
    }
    if (measurementViewType.surfaceType === SPATIAL_MARKUP_KIND_VERTICAL) {
      return "3D Flächenmessung · Fassade";
    }
    if (measurementViewType.surfaceTypeLabel === "Grundriss") {
      return "3D Flächenmessung · Grundriss";
    }
    if (measurementViewType.surfaceTypeLabel === "Gelände") {
      return "3D Flächenmessung · Gelände";
    }
    return `3D Flächenmessung · ${measurementViewType.surfaceTypeLabel}`;
  }

  if (measurementViewType.kind === "pureLabel") {
    return "3D Beschriftung";
  }

  if (measurementViewType.kind === SPATIAL_MARKUP_KIND_DISTANCE) {
    return "Distanzmessung";
  }

  if (measurementViewType.kind === SPATIAL_MARKUP_KIND_POINT) {
    return "Punktmessung";
  }

  if (measurementViewType.kind === "annotation") {
    if (measurementViewType.annotationKind === SPATIAL_MARKUP_KIND_LABEL) {
      return "3D Beschriftung";
    }
    return "3D Annotation";
  }

  return "3D Messungen";
};

export const formatCoordinateWithHemisphere = (
  value: number,
  isLatitude: boolean
): string => {
  const absoluteFormatted = Math.abs(value).toLocaleString("de-DE", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
  const suffix = isLatitude ? (value >= 0 ? "N" : "S") : value >= 0 ? "O" : "W";
  return `${absoluteFormatted}° ${suffix}`;
};
