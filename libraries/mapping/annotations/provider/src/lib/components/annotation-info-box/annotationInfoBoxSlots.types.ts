import type { ReactNode } from "react";

import type { Cartesian3 } from "@carma/cesium";
import type {
  AnnotationEntry,
  PointAnnotationEntry,
} from "@carma-mapping/annotations/cesium";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationType,
  type LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";

export type AnnotationSlotKind = AnnotationType | "unsupported";

export type AnnotationDisplayPoint = {
  latitude: number;
  longitude: number;
  height: number;
  anchorHeight?: number;
  verticalOffset?: number;
};

export type DistanceTableRow = {
  id: string;
  relationId?: string;
  label: string;
  vertical: number;
  horizontalDistance: number;
  distance: number;
  isImplicitReferenceRow?: boolean;
};

export type AnnotationSlotActions = {
  updateMeasurementNameById: (id: string, name: string) => void;
  updateMeasurementById: (id: string, patch: Partial<AnnotationEntry>) => void;
  deleteMeasurementById: (id: string) => void;
  toggleMeasurementLockById: (id: string) => void;
  flyToMeasurementById: (id: string) => void;
  setReferencePoint: (nextReference: Cartesian3 | null) => void;
  confirmPointLabelInputById: (id: string) => void;
  updatePointLabelAppearanceById: (
    id: string,
    appearance: AnnotationEntry["labelAppearance"] | undefined
  ) => void;
  updatePlanarPolygonNameById: (id: string, name: string) => void;
  updatePlanarPolygonSegmentLineModeById: (
    id: string,
    nextMode: LinearSegmentLineMode
  ) => void;
  deletePlanarPolygonGroupById: (id: string) => void;
};

export type PolylineSummary = {
  segmentCount: number;
  meanSegmentLengthMeters: number;
  totalAbsoluteElevationChangeMeters: number;
  startEndElevationDeltaMeters: number;
  ascentMeters: number;
  descentMeters: number;
};

type BaseAnnotationSlotsInput = {
  measurement: PointAnnotationEntry | null;
  displayPoint: AnnotationDisplayPoint | null;
  relativeElevation: number | null;
  isReference: boolean;
  actions: AnnotationSlotActions;
};

export type PointAnnotationSlotsInput = BaseAnnotationSlotsInput & {
  kind: typeof ANNOTATION_TYPE_POINT;
  currentOrder: number | null;
  nextOrder: number;
  isLivePreview: boolean;
};

export type DistanceAnnotationSlotsInput = BaseAnnotationSlotsInput & {
  kind: typeof ANNOTATION_TYPE_DISTANCE;
  currentOrder: number | null;
  currentOrderToken: string | null;
  nextOrder: number;
  isLivePreview: boolean;
  hasPreviewAnchor: boolean;
  subtitleDirectDistanceMeters: number | null;
  distanceTableRows: DistanceTableRow[];
};

export type LabelAnnotationSlotsInput = BaseAnnotationSlotsInput & {
  kind: typeof ANNOTATION_TYPE_LABEL;
  isLivePreview: boolean;
  autoFocusTitleTrigger?: number | string;
  pureLabelAppearance: {
    fontSizePx: number;
    backgroundColor: string;
    textColor: string;
  } | null;
  pureLabelDefaultFontSizePx: number;
  pureLabelMinFontSizePx: number;
  pureLabelMaxFontSizePx: number;
  pureLabelFontSizeStepPx: number;
  adjustCurrentPureLabelFontSize: (deltaPx: number) => void;
  handlePureLabelBackgroundColorChange: (colorHex: string) => void;
  handlePureLabelTextColorChange: (colorHex: string) => void;
};

export type PolygonPolylineAnnotationSlotsInput = {
  kind:
    | typeof ANNOTATION_TYPE_POLYLINE
    | typeof ANNOTATION_TYPE_AREA_GROUND
    | typeof ANNOTATION_TYPE_AREA_PLANAR
    | typeof ANNOTATION_TYPE_AREA_VERTICAL;
  groupId: string;
  name?: string;
  order: number;
  totalLengthMeters: number;
  areaSquareMeters?: number;
  bearingDeg?: number;
  verticalityDeg?: number;
  segmentLineMode?: LinearSegmentLineMode | null;
  polylineSummary?: PolylineSummary | null;
  surfaceTypeLabel: string;
  actions: AnnotationSlotActions;
};

export type UnsupportedAnnotationSlotsInput = {
  kind: "unsupported";
  unsupportedKind?: string;
};

export type AnnotationSlotsInput =
  | PointAnnotationSlotsInput
  | DistanceAnnotationSlotsInput
  | LabelAnnotationSlotsInput
  | PolygonPolylineAnnotationSlotsInput
  | UnsupportedAnnotationSlotsInput;

export type AnnotationSlots = {
  headingTitle: string;
  subtitle: ReactNode;
  content: ReactNode;
  collapsible: boolean;
  instructionText: string | null;
};
