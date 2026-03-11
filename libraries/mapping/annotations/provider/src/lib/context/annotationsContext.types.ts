import type {
  AnnotationCollection,
  AnnotationEntry,
  AnnotationLabelAppearance,
  AnnotationMode,
  AnnotationToolType,
  LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";

import type { AnnotationCreatePayload } from "./annotation-entries/annotationCreatePayload";
import type {
  AnnotationEditTarget,
  AnnotationEditUpdateTarget,
} from "./interaction/editing/annotationEdit.types";

export type AnnotationVisualizerOptionsPatch = {
  segmentLineMode?: LinearSegmentLineMode;
};

export type AnnotationsContextType = {
  tools: {
    activeToolType: AnnotationToolType;
    requestModeChange: (toolType: AnnotationToolType) => void;
    requestStartMeasurement: (toolType?: AnnotationToolType) => void;
    requestCloseActiveMeasurement: () => void;
  };
  selection: {
    activeAnnotationId: string | null;
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
    activeTarget: AnnotationEditTarget | null;
    requestStart: (target: AnnotationEditTarget) => void;
    requestStop: () => void;
    requestUpdateTarget: (target: AnnotationEditUpdateTarget) => boolean;
  };
  settings: {
    point: {
      verticalOffsetMeters: number;
      setVerticalOffsetMeters: (offsetMeters: number) => void;
      temporaryMode: boolean;
      setTemporaryMode: (temporary: boolean) => void;
    };
    distance: {
      stickyToFirstPoint: boolean;
      setStickyToFirstPoint: (enabled: boolean) => void;
      creationLineVisibility: {
        direct: boolean;
        vertical: boolean;
        horizontal: boolean;
      };
      setCreationLineVisibilityByKind: (
        kind: "direct" | "vertical" | "horizontal",
        visible: boolean
      ) => void;
    };
    polyline: {
      verticalOffsetMeters: number;
      setVerticalOffsetMeters: (offsetMeters: number) => void;
      segmentLineMode: LinearSegmentLineMode;
      setSegmentLineMode: (mode: LinearSegmentLineMode) => void;
    };
  };
};

export type AnnotationToolsContextType = AnnotationsContextType["tools"];
export type AnnotationSelectionContextType =
  AnnotationsContextType["selection"];
export type AnnotationCollectionContextType =
  AnnotationsContextType["annotations"];
export type AnnotationEditingContextType = AnnotationsContextType["edit"];
export type AnnotationSettingsContextType = AnnotationsContextType["settings"];
