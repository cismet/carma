import type { ReactNode } from "react";
import type { Cartesian3, Scene } from "@carma-cesium";
import type { AnnotationToolType } from "@carma-mapping/annotations/core";
import type { AnnotationInfoBoxSlots } from "@carma-mapping/annotations/ui";
import type { LabelOverlayContextType } from "@carma-providers/label-overlay";

import type {
  RuntimeAnnotationInfoBoxContext,
} from "../components/annotation-info-box/annotation-info-box.types";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "../interaction/lifecycle/annotation-mode-session.types";
import type { RuntimeVisualModels } from "../render/visual-models";
import type {
  AnnotationsStore,
  AnnotationsStoreState,
  AddAnnotationOptions,
  StoredAnnotation,
  CesiumGeographicCoordinate,
  AnnotationEdge,
  AnnotationNodeLink,
  AnnotationNodeLinkId,
  AnnotationNode,
} from "../store";
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
  id: AnnotationToolType;
  order: number;
  label: string;
  tooltip: string;
  icon?: ReactNode;
};

export type AnnotationToolDraftState = {
  coordinates: readonly CesiumGeographicCoordinate[];
  linkedNodeGroupIds: readonly (AnnotationNodeLinkId | null)[];
};

export type AnnotationToolDraftStore = {
  get: (toolType: AnnotationToolType) => AnnotationToolDraftState;
  set: (toolType: AnnotationToolType, draft: AnnotationToolDraftState) => void;
  clear: (toolType: AnnotationToolType) => void;
  subscribe: (toolType: AnnotationToolType, listener: () => void) => () => void;
};

export type AnnotationToolSessionContext = {
  getState: () => AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
  setActiveToolType: (toolType: AnnotationToolType) => void;
  drafts: AnnotationToolDraftStore;
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    coordinates: readonly CesiumGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[]
  ) => StoredAnnotation;
};

export type AnnotationToolAddAnnotationContext = {
  toolType: StoredAnnotation["toolType"];
  scene: Scene | null;
  coordinates: readonly CesiumGeographicCoordinate[];
  options?: AddAnnotationOptions;
  linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[];
};

export type PointQueryCreatedContext = {
  coordinate: CesiumGeographicCoordinate;
  linkedNodeGroupId: AnnotationNodeLinkId | null;
  activeToolType: AnnotationToolType;
  activeToolSession: AnnotationModeSession | null;
  toolSessions: AnnotationModeSessionMap;
  sessionContext: AnnotationToolSessionContext;
};

export type PointQueryPickResult = {
  coordinate: CesiumGeographicCoordinate | null;
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
  scene: Scene | null;
  annotationsStore: AnnotationsStore;
  drafts: AnnotationToolDraftStore;
  labelOverlay: LabelOverlayContextType;
  requestRender: () => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
};

export type AnnotationToolKeyboardContext = {
  event: KeyboardEvent;
  activeToolType: AnnotationToolType;
  activeToolSession: AnnotationModeSession | null;
  requestFinishMeasurement: () => boolean;
  requestStartMeasurement: (toolType?: AnnotationToolType) => void;
  requestModeChange: (toolType: AnnotationToolType) => void;
  sessionContext: AnnotationToolSessionContext;
};

export type AnnotationToolVisualModelContext = {
  nodes: readonly AnnotationNode[];
  edges: readonly AnnotationEdge[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationEntries: readonly StoredAnnotation[];
  draftStatesByToolType: Readonly<
    Partial<Record<AnnotationToolType, AnnotationToolDraftState>>
  >;
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
  id: AnnotationToolType;
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
    ) => AddAnnotationOptions | undefined;
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
    ) => AnnotationInfoBoxSlots | null;
  };
};

export type AnnotationToolRegistry = {
  plugins: readonly AnnotationToolPlugin[];
  orderedDescriptors: readonly AnnotationToolDescriptor[];
  byId: ReadonlyMap<AnnotationToolType, AnnotationToolPlugin>;
  getPlugin: (toolType: AnnotationToolType) => AnnotationToolPlugin | undefined;
  assertPlugin: (toolType: AnnotationToolType) => AnnotationToolPlugin;
};
