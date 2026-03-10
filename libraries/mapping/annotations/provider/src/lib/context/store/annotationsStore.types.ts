import type { Cartesian3 } from "@carma/cesium";
import type { Store } from "@carma-commons/react-store";

import type {
  AnnotationCollection,
  AnnotationEntry,
  AnnotationToolType,
  LinearSegmentLineMode,
  PlanarMeasurementGroup,
  PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import type { AnnotationsContextType } from "../annotationsContext.types";
import type {
  AnnotationEditTarget,
  MoveGizmoAxisCandidate,
  MoveGizmoVerticalOffsetEditMode,
} from "../hooks/editing/annotationEdit.types";

export type AnnotationsStoreSnapshot = {
  tools: AnnotationsContextType["tools"];
  selection: AnnotationsContextType["selection"];
  annotations: AnnotationsContextType["annotations"];
  edit: AnnotationsContextType["edit"];
  settings: AnnotationsContextType["settings"];
};

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
  };
  polyline: {
    defaultVerticalOffsetMeters: number;
    defaultSegmentLineMode: LinearSegmentLineMode;
  };
};

export type AnnotationEditStoreState = {
  activeTarget: AnnotationEditTarget | null;
  moveGizmoPointId: string | null;
  moveGizmoAxisDirection: Cartesian3 | null;
  moveGizmoAxisTitle: string | null;
  moveGizmoAxisCandidates: MoveGizmoAxisCandidate[] | null;
  moveGizmoPreferredAxisId: string | null;
  moveGizmoVerticalOffsetEditMode: MoveGizmoVerticalOffsetEditMode;
  moveGizmoVerticalOffsetPlanarMeasurementId: string | null;
  isMoveGizmoDragging: boolean;
};

export type AnnotationsStoreState = AnnotationsStoreSnapshot & {
  annotationToolType: AnnotationToolType;
  selectionState: AnnotationSelectionStoreState;
  createdPointIds: readonly string[];
  createdRelationIds: readonly string[];
  activePlanarMeasurementId: string | null;
  pendingLabelPlacementAnnotationId: string | null;
  openChainPointId: string | null;
  pendingPolylineRingPromotionPointId: string | null;
  settingsState: AnnotationSettingsStoreState;
  showLabels: boolean;
  occlusionChecksEnabled: boolean;
  editState: AnnotationEditStoreState;
  annotationEntries: AnnotationCollection;
  candidateAnnotation: AnnotationEntry | null;
  referencePoint: Cartesian3 | null;
  distanceRelations: PointDistanceRelation[];
  planarMeasurements: PlanarMeasurementGroup[];
};

export type AnnotationsStore = Store<AnnotationsStoreState>;
