import type {
  RuntimeMeasurementType,
  RuntimeToolId,
} from "../types/runtimeTool.types";

export type RuntimeCoordinate = {
  latitude: number;
  longitude: number;
  altitude: number;
};

export type RuntimeNode = {
  id: string;
  coordinate: RuntimeCoordinate;
};

export type RuntimeEdge = {
  id: string;
  startNodeId: string;
  endNodeId: string;
};

export type RuntimeAnnotationEntry = {
  id: string;
  toolType: RuntimeMeasurementType;
  nodeIds: readonly string[];
  edgeIds: readonly string[];
};

export type RuntimeMeasurement = RuntimeAnnotationEntry;

export type AnnotationSelectionStoreState = {
  selectedAnnotationIds: readonly string[];
  previousSelectedAnnotationId: string | null;
  selectionModeActive: boolean;
  selectModeAdditive: boolean;
  selectModeRectangle: boolean;
};

export type AnnotationInfoBoxStoreState = {
  activeAnnotationId: string | null;
};

export type AnnotationDraftStoreState = {
  polylinePreviewCoordinates: readonly RuntimeCoordinate[];
  distancePreviewCoordinates: readonly RuntimeCoordinate[];
};

export type AnnotationsStoreState = {
  annotationToolType: RuntimeToolId;
  selectionState: AnnotationSelectionStoreState;
  annotationEntries: readonly RuntimeAnnotationEntry[];
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
  infoBoxState: AnnotationInfoBoxStoreState;
  draftState: AnnotationDraftStoreState;
};
