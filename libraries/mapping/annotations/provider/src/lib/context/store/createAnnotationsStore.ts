import { createStore } from "@carma-commons/react-store";
import {
  DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  SELECT_TOOL_TYPE,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationEntry,
  AnnotationMode,
  AnnotationToolType,
  DirectLineLabelMode,
  LinearSegmentLineMode,
  ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationEditStoreState,
  AnnotationSettingsStoreState,
  AnnotationsStore,
  AnnotationsStoreState,
  AnnotationsStoreSnapshot,
} from "./annotationsStore.types";

type CreateInitialAnnotationsStoreStateOptions = {
  initialToolType?: AnnotationToolType;
  initialPointRadius?: number;
  initialPointVerticalOffsetMeters?: number;
  initialPointTemporaryMode?: boolean;
  initialDistanceStickyToFirstPoint?: boolean;
  initialDistanceCreationLineVisibility?: Partial<
    Record<ReferenceLineLabelKind, boolean>
  >;
  initialDistanceLabelVisibilityByKind?: Partial<
    Record<ReferenceLineLabelKind, boolean>
  >;
  initialDistanceDirectLineLabelMode?: DirectLineLabelMode;
  initialPolylineVerticalOffsetMeters?: number;
  initialPolylineSegmentLineMode?: LinearSegmentLineMode;
  initialHeightOffset?: number;
};

const noop = () => undefined;
const noopString = () => "";
const noopNumber = () => 0;
const noopNull = () => null;

const DEFAULT_DISTANCE_TOOL_SETTINGS = {
  stickyToFirstPoint: false,
  creationLineVisibility: {
    direct: true,
    vertical: true,
    horizontal: true,
  },
  defaultLabelVisibilityByKind: {
    direct: true,
    vertical: true,
    horizontal: true,
  } satisfies Record<ReferenceLineLabelKind, boolean>,
  defaultDirectLineLabelMode: "segment" as DirectLineLabelMode,
};

const createInitialSettingsState = ({
  initialPointRadius = 1,
  initialPointVerticalOffsetMeters = 0,
  initialPointTemporaryMode = false,
  initialDistanceStickyToFirstPoint = DEFAULT_DISTANCE_TOOL_SETTINGS.stickyToFirstPoint,
  initialDistanceCreationLineVisibility,
  initialDistanceLabelVisibilityByKind,
  initialDistanceDirectLineLabelMode = DEFAULT_DISTANCE_TOOL_SETTINGS.defaultDirectLineLabelMode,
  initialPolylineVerticalOffsetMeters = 0,
  initialPolylineSegmentLineMode = DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  initialHeightOffset = 1.5,
}: CreateInitialAnnotationsStoreStateOptions): AnnotationSettingsStoreState => ({
  pointQuery: {
    radius: initialPointRadius,
    heightOffset: initialHeightOffset,
  },
  point: {
    verticalOffsetMeters: initialPointVerticalOffsetMeters,
    temporaryMode: initialPointTemporaryMode,
  },
  distance: {
    stickyToFirstPoint: initialDistanceStickyToFirstPoint,
    creationLineVisibility: {
      ...DEFAULT_DISTANCE_TOOL_SETTINGS.creationLineVisibility,
      ...(initialDistanceCreationLineVisibility ?? {}),
    },
    defaultLabelVisibilityByKind: {
      ...DEFAULT_DISTANCE_TOOL_SETTINGS.defaultLabelVisibilityByKind,
      ...(initialDistanceLabelVisibilityByKind ?? {}),
    },
    defaultDirectLineLabelMode: initialDistanceDirectLineLabelMode,
  },
  polyline: {
    defaultVerticalOffsetMeters: initialPolylineVerticalOffsetMeters,
    defaultSegmentLineMode: initialPolylineSegmentLineMode,
  },
});

const createInitialAnnotationsSnapshot = (
  initialToolType: AnnotationToolType,
  initialSettingsState: AnnotationSettingsStoreState
): AnnotationsStoreSnapshot => ({
  tools: {
    activeToolType: initialToolType,
    requestModeChange: noop,
    requestStartMeasurement: noop,
    requestCloseActiveMeasurement: noop,
  },
  selection: {
    activeAnnotationId: null,
    ids: [],
    mode: {
      active: false,
      additive: false,
      rectangle: false,
    },
    setModeActive: noop,
    setAdditiveMode: noop,
    setRectangleMode: noop,
    set: noop,
    clear: noop,
  },
  annotations: {
    items: [],
    byType: (() => []) as (type: AnnotationMode) => AnnotationEntry[],
    getNavigationItems: () => [],
    getIndexByType: noopNumber,
    getOrderByType: noopNull,
    getNextOrderByType: noopNumber,
    add: noopString,
    updateById: noop,
    updateNameById: noop,
    updateVisualizerOptionsById: noop,
    updatePointLabelAppearanceById: noop,
    removeByIds: noop,
    removeSelection: noop,
    removeAll: noop,
    removeByType: noop,
    toggleLockByIds: noop,
    toggleVisibilityByIds: noop,
    setReferencePointId: noop,
    confirmLabelPlacementById: noop,
    flyToById: noop,
    focusById: noop,
    flyToAll: noop,
  },
  edit: {
    activeTarget: null,
    requestStart: noop,
    requestStop: noop,
    requestUpdateTarget: (() => false) as (target: unknown) => boolean,
  },
  settings: {
    point: {
      verticalOffsetMeters: initialSettingsState.point.verticalOffsetMeters,
      setVerticalOffsetMeters: noop,
      temporaryMode: initialSettingsState.point.temporaryMode,
      setTemporaryMode: noop,
    },
    distance: {
      stickyToFirstPoint: initialSettingsState.distance.stickyToFirstPoint,
      setStickyToFirstPoint: noop,
      creationLineVisibility:
        initialSettingsState.distance.creationLineVisibility,
      setCreationLineVisibilityByKind: noop,
    },
    polyline: {
      verticalOffsetMeters:
        initialSettingsState.polyline.defaultVerticalOffsetMeters,
      setVerticalOffsetMeters: noop,
      segmentLineMode: initialSettingsState.polyline.defaultSegmentLineMode,
      setSegmentLineMode: noop,
    },
  },
});

const createInitialEditState = (): AnnotationEditStoreState => ({
  activeTarget: null,
  moveGizmo: {
    pointId: null,
    axisDirection: null,
    axisTitle: null,
    axisCandidates: null,
    preferredAxisId: null,
    verticalOffsetEditMode: null,
    verticalOffsetNodeChainAnnotationId: null,
    isDragging: false,
  },
});

export const createInitialAnnotationsStoreState = ({
  initialToolType = "point",
  initialPointRadius = 1,
  initialPointVerticalOffsetMeters = 0,
  initialPointTemporaryMode = false,
  initialDistanceStickyToFirstPoint,
  initialDistanceCreationLineVisibility,
  initialDistanceLabelVisibilityByKind,
  initialDistanceDirectLineLabelMode,
  initialPolylineVerticalOffsetMeters = 0,
  initialPolylineSegmentLineMode = DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  initialHeightOffset = 1.5,
}: CreateInitialAnnotationsStoreStateOptions = {}): AnnotationsStoreState => {
  const initialSettingsState = createInitialSettingsState({
    initialPointRadius,
    initialPointVerticalOffsetMeters,
    initialPointTemporaryMode,
    initialDistanceStickyToFirstPoint,
    initialDistanceCreationLineVisibility,
    initialDistanceLabelVisibilityByKind,
    initialDistanceDirectLineLabelMode,
    initialPolylineVerticalOffsetMeters,
    initialPolylineSegmentLineMode,
    initialHeightOffset,
  });
  const initialSelectionModeActive = initialToolType === SELECT_TOOL_TYPE;
  const initialSnapshot = createInitialAnnotationsSnapshot(
    initialToolType,
    initialSettingsState
  );

  return {
    ...initialSnapshot,
    selection: {
      ...initialSnapshot.selection,
      mode: {
        ...initialSnapshot.selection.mode,
        active: initialSelectionModeActive,
      },
    },
    annotationToolType: initialToolType,
    selectionState: {
      selectedAnnotationIds: [],
      previousSelectedAnnotationId: null,
      selectionModeActive: initialSelectionModeActive,
      selectModeAdditive: false,
      selectModeRectangle: false,
    },
    createdPointIds: [],
    createdRelationIds: [],
    activeNodeChainAnnotationId: null,
    pendingLabelPlacementAnnotationId: null,
    openChainPointId: null,
    pendingPolylineRingPromotionPointId: null,
    settingsState: initialSettingsState,
    showLabels: true,
    occlusionChecksEnabled: true,
    editState: createInitialEditState(),
    annotationEntries: [],
    candidateAnnotation: null,
    referencePoint: null,
    distanceRelations: [],
    nodeChainAnnotations: [],
  };
};

export const createAnnotationsStore = (
  initialState: AnnotationsStoreState
): AnnotationsStore => createStore(initialState);
