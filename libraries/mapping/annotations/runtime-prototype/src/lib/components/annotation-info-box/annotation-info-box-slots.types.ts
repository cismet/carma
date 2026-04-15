import type { ReactNode } from "react";
import {
  AnnotationEntry,
  AnnotationPointEntry,
  PointMeasurementEntry,
  type DerivedPolylinePath,
  type NodeChainAnnotation,
  type PointDistanceRelation,
  type AnnotationType,
  type LinearSegmentLineMode,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma-cesium";
import type { AnnotationVisualizerOptionsPatch } from "../../context/annotations-context.types";
import type { AnnotationDisplayPoint } from "./utils/point-annotation-display";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
} = ANNOTATION_TYPES;

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
  exportGeoJsonById: (id: string) => void;
  setReferencePointId: (id: string | null) => void;
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

export type AnnotationInfoBoxEntryPayload = {
  kind: AnnotationSlotKind;
  annotationId: string | null;
  pointAnnotation: AnnotationPointEntry | null;
  nodeChainAnnotation: NodeChainAnnotation | null;
  annotations: ReadonlyArray<AnnotationEntry>;
  pointEntries: ReadonlyArray<AnnotationPointEntry>;
  labelMeasurements: ReadonlyArray<PointMeasurementEntry>;
  distanceRelations: ReadonlyArray<PointDistanceRelation>;
  referencePoint: Cartesian3 | null;
  pointMarkerBadgeByPointId: Readonly<Record<string, { text?: string }>>;
  polylinePath: DerivedPolylinePath | null;
  polylineAnnotations: ReadonlyArray<NodeChainAnnotation>;
  groundPolygons: ReadonlyArray<NodeChainAnnotation>;
  planarPolygons: ReadonlyArray<NodeChainAnnotation>;
  verticalPolygons: ReadonlyArray<NodeChainAnnotation>;
  fallbackPolylineSegmentLineMode: LinearSegmentLineMode;
  pendingLabelPlacementAnnotationId: string | null;
  actions: AnnotationSlotActions;
};

export type AnnotationSlots = {
  headingTitle: string;
  subtitle: ReactNode;
  content: ReactNode;
  collapsible: boolean;
  instructionText: string | null;
};
