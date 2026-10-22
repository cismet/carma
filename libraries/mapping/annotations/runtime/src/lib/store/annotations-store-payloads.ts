import type {
  AnnotationEdge,
  AnnotationElevationDisplayMode,
  AnnotationGeographicCoordinate,
  AnnotationLabelAppearance,
  AnnotationNode,
  AnnotationNodeId,
  AnnotationNodeLink,
  StoredAnnotation,
} from "./annotations-store.types";
import type {
  RuntimeDistanceTriangleAnchorCoordinateRole,
  RuntimePointLabelCoordinateSelection,
} from "../render/annotation-render-models";

export type AppendAnnotationEntitiesPayload = {
  annotationEntry: StoredAnnotation;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  edges: readonly AnnotationEdge[];
  selectAnnotationId?: string | null;
};

export type RemoveAnnotationByIdPayload = {
  annotationId: string;
  nextSelectedAnnotationId?: string | null;
};

export type RemoveAnnotationsByIdsPayload = {
  annotationIds: readonly string[];
  nextSelectedAnnotationId?: string | null;
};

export type SetSelectedAnnotationIdsPayload = readonly string[];

export type UpdateNodeCoordinateByIdPayload = {
  nodeId: string;
  coordinate: AnnotationGeographicCoordinate;
  selectedAnnotationIds?: readonly string[];
  movedNodeIds?: readonly AnnotationNodeId[];
  linkToNodeId?: AnnotationNodeId | null;
};

export type InsertNodeIntoMeasurementEdgePayload = {
  annotationId: string;
  startNodeId: string;
  endNodeId: string;
  coordinate: AnnotationGeographicCoordinate;
};

export type RemoveNodeFromAnnotationPayload = {
  annotationId: string;
  nodeId: string;
};

export type UpdateAnnotationEntryByIdPayload = {
  annotationId: string;
  displayName?: string;
  shortLabel?: string;
  shortLabelSource?: StoredAnnotation["shortLabelSource"];
  shortLabelCounter?: StoredAnnotation["shortLabelCounter"];
  hidden?: boolean;
  locked?: boolean;
  annotationRole?: StoredAnnotation["annotationRole"];
  readOnly?: boolean;
  labelAppearance?: AnnotationLabelAppearance;
  elevationDisplayMode?: AnnotationElevationDisplayMode;
  distanceAnchorCoordinateSelection?: RuntimePointLabelCoordinateSelection;
  distanceTriangleAnchorCoordinateRole?: RuntimeDistanceTriangleAnchorCoordinateRole;
};

export type SetElevationReferenceAnnotationIdPayload = string | null;
