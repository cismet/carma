import type { ReactNode } from "react";
import type { Cartesian3, Scene } from "@carma-cesium";
import type {
  AnnotationInfoBoxHelpItem,
  AnnotationInfoBoxSlots,
} from "@carma-mapping/annotations/ui";
import type { LabelOverlayContextType } from "@carma-providers/label-overlay";

import type { RuntimeAnnotationInfoBoxContext } from "../components/annotation-info-box/annotation-info-box.types";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import type { AnnotationLabelTextRequester } from "../context/use-annotation-label-text-request";
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
  AnnotationElevationDisplayMode,
  CesiumGeographicCoordinate,
  AnnotationEdge,
  AnnotationNodeLink,
  AnnotationNodeLinkId,
  AnnotationNode,
} from "../store";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
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
  id: AnnotationToolId;
  order: number;
  label: string;
  tooltip: string;
  shortcutKey?: string;
  icon?: ReactNode;
};

export type AnnotationToolDraftState = {
  coordinates: readonly CesiumGeographicCoordinate[];
  linkedNodeGroupIds: readonly (AnnotationNodeLinkId | null)[];
  feedback?: {
    kind: "warning";
    message: string;
  } | null;
};

export type AnnotationToolDraftStore = {
  get: (toolId: AnnotationToolId) => AnnotationToolDraftState;
  set: (toolId: AnnotationToolId, draft: AnnotationToolDraftState) => void;
  clear: (toolId: AnnotationToolId) => void;
  subscribe: (toolId: AnnotationToolId, listener: () => void) => () => void;
};

export type AnnotationToolHelpTextContext = {
  draftState: AnnotationToolDraftState;
  pointQueryPickResult?: PointQueryPickResult | null;
};

export type AnnotationToolSessionContext = {
  getState: () => AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
  setActiveToolType: (toolId: AnnotationToolId) => void;
  drafts: AnnotationToolDraftStore;
  requestLabelText?: AnnotationLabelTextRequester;
  addAnnotation: (
    annotationType: StoredAnnotation["toolType"],
    coordinates: readonly CesiumGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
};

export type AnnotationToolAddAnnotationContext = {
  annotationType: StoredAnnotation["toolType"];
  toolId: AnnotationToolId | null;
  scene: Scene | null;
  coordinates: readonly CesiumGeographicCoordinate[];
  options?: AddAnnotationOptions;
  linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[];
};

export type PointQueryCreatedContext = {
  coordinate: CesiumGeographicCoordinate;
  linkedNodeGroupId: AnnotationNodeLinkId | null;
  forceAccepted?: boolean;
  activeToolType: AnnotationToolId;
  activeToolSession: AnnotationModeSession | null;
  toolSessions: AnnotationModeSessionMap;
  sessionContext: AnnotationToolSessionContext;
};

export type PointQueryPickResult = {
  coordinate: CesiumGeographicCoordinate | null;
  screenPosition: { x: number; y: number } | null;
  pointECEF: Cartesian3 | null;
  surfaceNormalECEF: Cartesian3 | null;
  forceAccepted?: boolean;
};

export type AnnotationPointQueryVisualStyle = Readonly<{
  color?: string;
  opacity?: number;
}> | null;

export type AnnotationToolAuthoringController = {
  setEnabled: (enabled: boolean) => void;
  setPointQueryPickResult: (pickResult: PointQueryPickResult | null) => void;
  isPointQueryPickResultAcceptable?: () => boolean;
  getPointQueryVisualStyle?: () => AnnotationPointQueryVisualStyle | undefined;
  destroy: () => void;
};

export type AnnotationToolAuthoringContext = {
  scene: Scene | null;
  annotationsStore: AnnotationsStore;
  drafts: AnnotationToolDraftStore;
  labelOverlay: LabelOverlayContextType;
  requestRender: () => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions: PartialAnnotationLineLabelOptions;
};

export type AnnotationToolKeyboardContext = {
  event: KeyboardEvent;
  activeToolType: AnnotationToolId;
  activeToolSession: AnnotationModeSession | null;
  requestFinishMeasurement: () => boolean;
  requestActivateTool: (toolId?: AnnotationToolId) => void;
  requestModeChange: (toolId: AnnotationToolId) => void;
  sessionContext: AnnotationToolSessionContext;
};

export type AnnotationToolVisualModelContext = {
  nodes: readonly AnnotationNode[];
  edges: readonly AnnotationEdge[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationEntries: readonly StoredAnnotation[];
  draftStatesByToolType: Readonly<
    Partial<Record<AnnotationToolId, AnnotationToolDraftState>>
  >;
  elevationReferenceAnnotationId: string | null;
  selectedAnnotationId: string | null;
  selectedAnnotationIds: readonly string[];
  isSelectionAdditiveModifierPressed: boolean;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (
    annotationId: string,
    currentElevationDisplayMode?: AnnotationElevationDisplayMode
  ) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
};

export type AnnotationToolPlugin = {
  id: AnnotationToolId;
  kind: AnnotationToolPluginKind;
  annotationType?: StoredAnnotation["toolType"] | null;
  descriptor: AnnotationToolDescriptor;
  helpText?: readonly AnnotationInfoBoxHelpItem[];
  resolveHelpText?: (
    context: AnnotationToolHelpTextContext
  ) => readonly AnnotationInfoBoxHelpItem[];
  alwaysShowHelpTextWhileActive?: boolean;
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
  byId: ReadonlyMap<AnnotationToolId, AnnotationToolPlugin>;
  getPlugin: (toolId: AnnotationToolId) => AnnotationToolPlugin | undefined;
  assertPlugin: (toolId: AnnotationToolId) => AnnotationToolPlugin;
  getPluginsByAnnotationType: (
    annotationType: StoredAnnotation["toolType"]
  ) => readonly AnnotationToolPlugin[];
};
