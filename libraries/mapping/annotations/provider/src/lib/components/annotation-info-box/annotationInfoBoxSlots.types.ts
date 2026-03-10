import type { ReactNode } from "react";

import {
  AnnotationEntry,
  PointAnnotationEntry,
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
import type { AnnotationVisualizerOptionsPatch } from "../../context/annotationsContext.types";
import type { AnnotationDisplayPoint } from "./utils/pointAnnotationDisplay";

export type AnnotationSlotKind = AnnotationType | "unsupported";
export type { AnnotationDisplayPoint };

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
  updateNameById: (id: string, name: string) => void;
  removeByIds: (ids: string[]) => void;
  toggleLockByIds: (ids: string[]) => void;
  toggleVisibilityByIds: (ids: string[]) => void;
  flyToById: (id: string) => void;
  setReferenceMeasurementById: (id: string | null) => void;
  confirmLabelPlacementById: (id: string) => void;
  updatePointLabelAppearanceById: (
    id: string,
    appearance: AnnotationEntry["labelAppearance"] | undefined
  ) => void;
  updateVisualizerOptionsById: (
    id: string,
    patch: AnnotationVisualizerOptionsPatch
  ) => void;
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
  isCandidate: boolean;
};

export type DistanceAnnotationSlotsInput = BaseAnnotationSlotsInput & {
  kind: typeof ANNOTATION_TYPE_DISTANCE;
  currentOrder: number | null;
  currentOrderToken: string | null;
  nextOrder: number;
  isCandidate: boolean;
  hasCandidateAnchor: boolean;
  subtitleDirectDistanceMeters: number | null;
  distanceTableRows: DistanceTableRow[];
};

export type LabelAnnotationSlotsInput = BaseAnnotationSlotsInput & {
  kind: typeof ANNOTATION_TYPE_LABEL;
  isCandidate: boolean;
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
  measurementId: string;
  name?: string;
  order: number;
  totalLengthMeters: number;
  areaSquareMeters?: number;
  bearingDeg?: number;
  verticalityDeg?: number;
  segmentLineMode?: LinearSegmentLineMode | null;
  polylineSummary?: PolylineSummary | null;
  hidden: boolean;
  locked: boolean;
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
  headingActions?: ReactNode;
  subtitle: ReactNode;
  content: ReactNode;
  collapsible: boolean;
  instructionText: string | null;
};
