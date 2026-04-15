import type { ReactNode } from "react";
import type { Cartesian3 } from "@carma-cesium";

import type {
  RuntimeAnnotationInfoBoxContext,
  RuntimeAnnotationInfoBoxSlots,
} from "../components/annotation-info-box/annotation-info-box.types";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "../interaction/lifecycle/annotation-mode-session.types";
import type { RuntimeVisualModels } from "../render/runtime-visual-models";
import type {
  AnnotationsStore,
  AnnotationsStoreState,
  RuntimeAddAnnotationOptions,
  RuntimeAnnotationEntry,
  RuntimeCoordinate,
  RuntimeEdge,
  RuntimeNodeLink,
  RuntimeNodeLinkId,
  RuntimeMeasurement,
  RuntimeNode,
} from "../store";
import type { RuntimeScene } from "../types/runtime-scene.types";
import type { RuntimeToolId } from "../types/runtime-tool.types";
export const ANNOTATION_TOOL_PLUGIN_KINDS = {
  INTERACTION: "interaction",
  MEASUREMENT: "measurement",
} as const;

export const ANNOTATION_TOOL_PLUGIN_CAPABILITIES = {
  SESSION: "session",
  POINT_QUERY: "pointQuery",
  ADD_ANNOTATION: "addAnnotation",
  AUTHORING_VISUALS: "authoringVisuals",
  KEYBOARD: "keyboard",
  VISUAL_MODELS: "visualModels",
  INFO_BOX: "infoBox",
} as const;

export type AnnotationToolPluginKind =
  (typeof ANNOTATION_TOOL_PLUGIN_KINDS)[keyof typeof ANNOTATION_TOOL_PLUGIN_KINDS];

export type AnnotationToolPluginCapability =
  (typeof ANNOTATION_TOOL_PLUGIN_CAPABILITIES)[keyof typeof ANNOTATION_TOOL_PLUGIN_CAPABILITIES];

export type AnnotationToolDescriptor = {
  id: RuntimeToolId;
  order: number;
  label: string;
  tooltip: string;
  icon?: ReactNode;
};

export type AnnotationToolDraftState = {
  coordinates: readonly RuntimeCoordinate[];
  linkedNodeGroupIds: readonly (RuntimeNodeLinkId | null)[];
};

export type AnnotationToolDraftStore = {
  get: (toolType: RuntimeToolId) => AnnotationToolDraftState;
  set: (toolType: RuntimeToolId, draft: AnnotationToolDraftState) => void;
  clear: (toolType: RuntimeToolId) => void;
  subscribe: (toolType: RuntimeToolId, listener: () => void) => () => void;
};

export type AnnotationToolSessionContext = {
  getState: () => AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
  setActiveToolType: (toolType: RuntimeToolId) => void;
  drafts: AnnotationToolDraftStore;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions,
    linkedNodeGroupIds?: readonly (RuntimeNodeLinkId | null | undefined)[]
  ) => RuntimeMeasurement;
};

export type AnnotationToolAddAnnotationContext = {
  toolType: RuntimeMeasurement["toolType"];
  scene: RuntimeScene | null;
  coordinates: readonly RuntimeCoordinate[];
  options?: RuntimeAddAnnotationOptions;
  linkedNodeGroupIds?: readonly (RuntimeNodeLinkId | null | undefined)[];
};

export type PointQueryCreatedContext = {
  coordinate: RuntimeCoordinate;
  linkedNodeGroupId: RuntimeNodeLinkId | null;
  activeToolType: RuntimeToolId;
  activeToolSession: AnnotationModeSession | null;
  toolSessions: AnnotationModeSessionMap;
  sessionContext: AnnotationToolSessionContext;
};

export type PointQueryPickResult = {
  coordinate: RuntimeCoordinate | null;
  screenPosition: { x: number; y: number } | null;
  pointECEF: Cartesian3 | null;
  surfaceNormalECEF: Cartesian3 | null;
};

export type AnnotationToolAuthoringController = {
  setEnabled: (enabled: boolean) => void;
  setPointQueryPickResult: (pickResult: PointQueryPickResult | null) => void;
  destroy: () => void;
};

export type AnnotationToolAuthoringContext = {
  scene: RuntimeScene | null;
  annotationsStore: AnnotationsStore;
  drafts: AnnotationToolDraftStore;
  requestRender: () => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
};

export type AnnotationToolKeyboardContext = {
  event: KeyboardEvent;
  activeToolType: RuntimeToolId;
  activeToolSession: AnnotationModeSession | null;
  requestFinishMeasurement: () => boolean;
  requestStartMeasurement: (toolType?: RuntimeToolId) => void;
  requestModeChange: (toolType: RuntimeToolId) => void;
  sessionContext: AnnotationToolSessionContext;
};

export type AnnotationToolVisualModelContext = {
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
  linkedNodeGroups: readonly RuntimeNodeLink[];
  annotationEntries: readonly RuntimeAnnotationEntry[];
  elevationReferenceAnnotationId: string | null;
  selectedAnnotationId: string | null;
  selectedAnnotationIds: readonly string[];
  isSelectionAdditiveModifierPressed: boolean;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (annotationId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
};

export type AnnotationToolPlugin = {
  id: RuntimeToolId;
  kind: AnnotationToolPluginKind;
  descriptor: AnnotationToolDescriptor;
  helpText?: readonly string[];
  capabilities?: readonly AnnotationToolPluginCapability[];
  session?: {
    createSession: (
      context: AnnotationToolSessionContext
    ) => AnnotationModeSession;
  };
  pointQuery?: {
    onPointCreated: (context: PointQueryCreatedContext) => void;
  };
  addAnnotation?: {
    resolveOptions: (
      context: AnnotationToolAddAnnotationContext
    ) => RuntimeAddAnnotationOptions | undefined;
  };
  authoringVisuals?: {
    createController: (
      context: AnnotationToolAuthoringContext
    ) => AnnotationToolAuthoringController | null;
  };
  keyboard?: {
    onKeyDown: (context: AnnotationToolKeyboardContext) => boolean;
  };
  visualModels?: {
    build: (
      context: AnnotationToolVisualModelContext
    ) => RuntimeVisualModels | null;
  };
  infoBox?: {
    getSlots: (
      context: RuntimeAnnotationInfoBoxContext
    ) => RuntimeAnnotationInfoBoxSlots | null;
  };
};

export type AnnotationToolRegistry = {
  plugins: readonly AnnotationToolPlugin[];
  orderedDescriptors: readonly AnnotationToolDescriptor[];
  byId: ReadonlyMap<RuntimeToolId, AnnotationToolPlugin>;
  getPlugin: (toolType: RuntimeToolId) => AnnotationToolPlugin | undefined;
  assertPlugin: (toolType: RuntimeToolId) => AnnotationToolPlugin;
};
