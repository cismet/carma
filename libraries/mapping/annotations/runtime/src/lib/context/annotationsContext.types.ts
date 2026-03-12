import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationCollection,
  AnnotationEntry,
  AnnotationCreatePayload,
  AnnotationLabelAppearance,
  AnnotationMode,
  AnnotationToolType,
  LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationEditTarget,
  AnnotationEditUpdateTarget,
} from "../interaction/editing/annotationEdit.types";

export type AnnotationVisualizerOptionsPatch = {
  segmentLineMode?: LinearSegmentLineMode;
};

export type AnnotationSettingsToolKey =
  | typeof ANNOTATION_TYPE_POINT
  | typeof ANNOTATION_TYPE_DISTANCE
  | typeof ANNOTATION_TYPE_POLYLINE;

export type AnnotationPointSettingsValue = {
  verticalOffsetMeters: number;
  temporaryMode: boolean;
};

export type AnnotationDistanceSettingsValue = {
  stickyToFirstPoint: boolean;
  creationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
};

export type AnnotationPolylineSettingsValue = {
  verticalOffsetMeters: number;
  segmentLineMode: LinearSegmentLineMode;
};

export type AnnotationSettingsByToolKey = {
  [ANNOTATION_TYPE_POINT]: AnnotationPointSettingsValue;
  [ANNOTATION_TYPE_DISTANCE]: AnnotationDistanceSettingsValue;
  [ANNOTATION_TYPE_POLYLINE]: AnnotationPolylineSettingsValue;
};

export type AnnotationSettingsPatchByToolKey = {
  [ANNOTATION_TYPE_POINT]: Partial<AnnotationPointSettingsValue>;
  [ANNOTATION_TYPE_DISTANCE]: {
    stickyToFirstPoint?: boolean;
    creationLineVisibility?: Partial<
      AnnotationDistanceSettingsValue["creationLineVisibility"]
    >;
  };
  [ANNOTATION_TYPE_POLYLINE]: Partial<AnnotationPolylineSettingsValue>;
};

export type AnnotationsContextType = {
  tools: {
    activeToolType: AnnotationToolType;
    requestModeChange: (toolType: AnnotationToolType) => void;
    requestStartMeasurement: (toolType?: AnnotationToolType) => void;
    requestFinishMeasurement: () => boolean;
  };
  selection: {
    ids: string[];
    mode: {
      active: boolean;
      additive: boolean;
      rectangle: boolean;
    };
    setModeActive: (active: boolean) => void;
    setAdditiveMode: (active: boolean) => void;
    setRectangleMode: (active: boolean) => void;
    set: (ids: string[], additive?: boolean) => void;
    clear: () => void;
  };
  annotations: {
    items: AnnotationCollection;
    byType: (type: AnnotationMode) => AnnotationEntry[];
    getNavigationItems: () => AnnotationEntry[];
    getIndexByType: (
      type: AnnotationMode,
      id: string | null | undefined
    ) => number;
    getOrderByType: (
      type: AnnotationMode,
      id: string | null | undefined
    ) => number | null;
    getNextOrderByType: (type: AnnotationMode) => number;
    add: (payload: AnnotationCreatePayload<AnnotationEntry>) => string;
    updateById: (id: string, patch: Partial<AnnotationEntry>) => void;
    updateNameById: (id: string, name: string) => void;
    updateVisualizerOptionsById: (
      id: string,
      patch: AnnotationVisualizerOptionsPatch
    ) => void;
    updatePointLabelAppearanceById: (
      id: string,
      appearance: AnnotationLabelAppearance | undefined
    ) => void;
    removeByIds: (ids: string[]) => void;
    removeSelection: () => void;
    removeAll: () => void;
    removeByType: (type: AnnotationMode) => void;
    toggleLockByIds: (ids: string[]) => void;
    toggleVisibilityByIds: (ids: string[]) => void;
    setReferencePointId: (id: string | null) => void;
    confirmLabelPlacementById: (id: string) => void;
    flyToById: (id: string) => void;
    focusById: (id: string | null) => void;
    flyToAll: () => void;
  };
  edit: {
    currentAnnotationId: string | null;
    activeTarget: AnnotationEditTarget | null;
    requestStart: (target: AnnotationEditTarget) => void;
    requestStop: () => void;
    requestUpdateTarget: (target: AnnotationEditUpdateTarget) => boolean;
  };
  settings: {
    get: <TToolKey extends AnnotationSettingsToolKey>(
      toolKey: TToolKey
    ) => AnnotationSettingsByToolKey[TToolKey];
    update: <TToolKey extends AnnotationSettingsToolKey>(
      toolKey: TToolKey,
      patch: AnnotationSettingsPatchByToolKey[TToolKey]
    ) => void;
  };
};

export type AnnotationToolsContextType = AnnotationsContextType["tools"];
export type AnnotationSelectionContextType =
  AnnotationsContextType["selection"];
export type AnnotationCollectionContextType =
  AnnotationsContextType["annotations"];
export type AnnotationEditingContextType = AnnotationsContextType["edit"];
export type AnnotationSettingsContextType = AnnotationsContextType["settings"];
