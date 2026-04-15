import { normalizeOptions } from "@carma-commons/utils";
import {
  DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationToolType,
  DirectLineLabelMode,
  LinearSegmentLineMode,
  ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationEditStoreState,
  AnnotationSettingsStoreState,
  AnnotationsStore,
  AnnotationsStoreListener,
  AnnotationsStoreState,
  ReplaceAnnotationsStoreStateAction,
} from "./annotations-store.types";
const { SELECT: SELECT_TOOL_TYPE } = ANNOTATION_TOOL_TYPES;

export type CreateInitialAnnotationsStoreStateOptions = {
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

const DEFAULT_INITIAL_SETTINGS_STATE: AnnotationSettingsStoreState = {
  pointQuery: {
    radius: 1,
    heightOffset: 1.5,
  },
  point: {
    verticalOffsetMeters: 0,
    temporaryMode: false,
  },
  distance: {
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
  },
  polyline: {
    defaultVerticalOffsetMeters: 0,
    defaultSegmentLineMode: DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  },
};

const DEFAULT_INITIAL_ANNOTATIONS_STORE_STATE_OPTIONS: Required<
  Omit<
    CreateInitialAnnotationsStoreStateOptions,
    | "initialDistanceStickyToFirstPoint"
    | "initialDistanceCreationLineVisibility"
    | "initialDistanceLabelVisibilityByKind"
    | "initialDistanceDirectLineLabelMode"
  >
> &
  Pick<
    CreateInitialAnnotationsStoreStateOptions,
    | "initialDistanceStickyToFirstPoint"
    | "initialDistanceCreationLineVisibility"
    | "initialDistanceLabelVisibilityByKind"
    | "initialDistanceDirectLineLabelMode"
  > = {
  initialToolType: "point",
  initialPointRadius: 1,
  initialPointVerticalOffsetMeters: 0,
  initialPointTemporaryMode: false,
  initialDistanceStickyToFirstPoint: undefined,
  initialDistanceCreationLineVisibility: undefined,
  initialDistanceLabelVisibilityByKind: undefined,
  initialDistanceDirectLineLabelMode: undefined,
  initialPolylineVerticalOffsetMeters: 0,
  initialPolylineSegmentLineMode: DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  initialHeightOffset: 1.5,
};

const createInitialSettingsState = (
  options: CreateInitialAnnotationsStoreStateOptions
): AnnotationSettingsStoreState => {
  const defaultSettingsState = DEFAULT_INITIAL_SETTINGS_STATE;
  const pointQuery = normalizeOptions(
    {
      radius: options.initialPointRadius,
      heightOffset: options.initialHeightOffset,
    },
    defaultSettingsState.pointQuery
  );
  const point = normalizeOptions(
    {
      verticalOffsetMeters: options.initialPointVerticalOffsetMeters,
      temporaryMode: options.initialPointTemporaryMode,
    },
    defaultSettingsState.point
  );
  const distance = normalizeOptions(
    {
      stickyToFirstPoint: options.initialDistanceStickyToFirstPoint,
      creationLineVisibility: normalizeOptions(
        options.initialDistanceCreationLineVisibility,
        defaultSettingsState.distance.creationLineVisibility
      ),
      defaultLabelVisibilityByKind: normalizeOptions(
        options.initialDistanceLabelVisibilityByKind,
        defaultSettingsState.distance.defaultLabelVisibilityByKind
      ),
      defaultDirectLineLabelMode: options.initialDistanceDirectLineLabelMode,
    },
    defaultSettingsState.distance
  );
  const polyline = normalizeOptions(
    {
      defaultVerticalOffsetMeters: options.initialPolylineVerticalOffsetMeters,
      defaultSegmentLineMode: options.initialPolylineSegmentLineMode,
    },
    defaultSettingsState.polyline
  );

  return {
    pointQuery,
    point,
    distance,
    polyline,
  };
};

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

export const createInitialAnnotationsStoreState = (
  options: CreateInitialAnnotationsStoreStateOptions = {}
): AnnotationsStoreState => {
  const initialOptions = normalizeOptions(
    options,
    DEFAULT_INITIAL_ANNOTATIONS_STORE_STATE_OPTIONS
  );
  const initialSettingsState = createInitialSettingsState(initialOptions);
  const initialSelectionModeActive =
    initialOptions.initialToolType === SELECT_TOOL_TYPE;

  return {
    annotationToolType: initialOptions.initialToolType,
    selectionState: {
      selectedAnnotationIds: [],
      previousSelectedAnnotationId: null,
      selectionModeActive: initialSelectionModeActive,
      selectModeAdditive: false,
      selectModeRectangle: false,
    },
    createdPointIds: [],
    createdRelationIds: [],
    distanceSession: {
      sourcePointId: null,
      createdPointIds: [],
      createdRelationIds: [],
    },
    activeNodeChainAnnotationId: null,
    pendingLabelPlacementAnnotationId: null,
    settingsState: initialSettingsState,
    showLabels: true,
    occlusionChecksEnabled: true,
    editState: createInitialEditState(),
    annotationEntries: [],
    referencePoint: null,
    distanceRelations: [],
    nodeChainAnnotations: [],
  };
};

export const replaceAnnotationsStoreState = (
  payload: AnnotationsStoreState
): ReplaceAnnotationsStoreStateAction => ({
  type: "annotations/replace-state",
  payload,
});

const notifyAnnotationsStoreListeners = (
  listeners: ReadonlySet<AnnotationsStoreListener>
) => {
  listeners.forEach((listener) => {
    listener();
  });
};

export const createAnnotationsStore = (
  initialState: AnnotationsStoreState
): AnnotationsStore => {
  let state = initialState;
  const listeners = new Set<AnnotationsStoreListener>();

  return {
    getState: () => state,
    dispatch: (action) => {
      if (action.type !== "annotations/replace-state") {
        throw new Error(`Unsupported annotations store action: ${action.type}`);
      }

      if (Object.is(action.payload, state)) {
        return action;
      }

      state = action.payload;
      notifyAnnotationsStoreListeners(listeners);
      return action;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
