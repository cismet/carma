import type { Cartesian3 } from "@carma/cesium";
import type { Store } from "redux";

import type {
  AnnotationCollection,
  AnnotationToolType,
  DirectLineLabelMode,
  LinearSegmentLineMode,
  NodeChainAnnotation,
  PointDistanceRelation,
  ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

import type {
  AnnotationEditTarget,
  MoveGizmoSession,
} from "../interaction/editing/annotationEdit.types";

export type AnnotationSelectionStoreState = {
  selectedAnnotationIds: string[];
  previousSelectedAnnotationId: string | null;
  selectionModeActive: boolean;
  selectModeAdditive: boolean;
  selectModeRectangle: boolean;
};

export type AnnotationSettingsStoreState = {
  pointQuery: {
    radius: number;
    heightOffset: number;
  };
  point: {
    verticalOffsetMeters: number;
    temporaryMode: boolean;
  };
  distance: {
    stickyToFirstPoint: boolean;
    creationLineVisibility: {
      direct: boolean;
      vertical: boolean;
      horizontal: boolean;
    };
    defaultLabelVisibilityByKind: Record<ReferenceLineLabelKind, boolean>;
    defaultDirectLineLabelMode: DirectLineLabelMode;
  };
  polyline: {
    defaultVerticalOffsetMeters: number;
    defaultSegmentLineMode: LinearSegmentLineMode;
  };
};

export type AnnotationEditStoreState = {
  activeTarget: AnnotationEditTarget | null;
  moveGizmo: MoveGizmoSession;
};

export type DistanceSessionState = {
  sourcePointId: string | null;
  createdPointIds: readonly string[];
  createdRelationIds: readonly string[];
};

export type AnnotationsStoreState = {
  annotationToolType: AnnotationToolType;
  selectionState: AnnotationSelectionStoreState;
  createdPointIds: readonly string[];
  createdRelationIds: readonly string[];
  distanceSession: DistanceSessionState;
  activeNodeChainAnnotationId: string | null;
  pendingLabelPlacementAnnotationId: string | null;
  settingsState: AnnotationSettingsStoreState;
  showLabels: boolean;
  occlusionChecksEnabled: boolean;
  editState: AnnotationEditStoreState;
  annotationEntries: AnnotationCollection;
  referencePoint: Cartesian3 | null;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
};

export type AnnotationsStore = Store<AnnotationsStoreState>;
