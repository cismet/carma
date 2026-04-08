import type { ReactNode } from "react";
import type { Cartesian3 } from "@carma-cesium";

import type {
  RuntimeAnnotationInfoBoxContext,
  RuntimeAnnotationInfoBoxSlots,
} from "../components/annotation-info-box/annotationInfoBox.types";
import type {
  AnnotationModeSession,
  AnnotationModeSessionMap,
} from "../interaction/lifecycle/annotationModeSession.types";
import type { RuntimeRenderLayer } from "../render/runtimeRenderLayer";
import type {
  AnnotationsStore,
  AnnotationsStoreState,
  RuntimeAddAnnotationOptions,
  RuntimeAnnotationEntry,
  RuntimeCoordinate,
  RuntimeEdge,
  RuntimeMeasurement,
  RuntimeNode,
} from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";
import type { RuntimeToolId } from "../types/runtimeTool.types";
export const ANNOTATION_TOOL_PLUGIN_KINDS = {
  INTERACTION: "interaction",
  MEASUREMENT: "measurement",
} as const;

export const ANNOTATION_TOOL_PLUGIN_CAPABILITIES = {
  SESSION: "session",
  SETTINGS: "settings",
  POINT_QUERY: "pointQuery",
  PREVIEW: "preview",
  PREVIEW_PRIMITIVES: "previewPrimitives",
  TOOLBAR_OPTIONS: "toolbarOptions",
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

export type AnnotationToolSessionContext = {
  getState: () => AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
  setActiveToolType: (toolType: RuntimeToolId) => void;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions
  ) => RuntimeMeasurement;
};

export type PointQueryCreatedContext = {
  coordinate: RuntimeCoordinate;
  activeToolType: RuntimeToolId;
  activeToolSession: AnnotationModeSession | null;
  toolSessions: AnnotationModeSessionMap;
  sessionContext: AnnotationToolSessionContext;
};

export type AnnotationToolPreviewSample = {
  coordinate: RuntimeCoordinate | null;
  screenPosition: { x: number; y: number } | null;
  pointECEF: Cartesian3 | null;
  surfaceNormalECEF: Cartesian3 | null;
};

export type AnnotationToolPreviewController = {
  setEnabled: (enabled: boolean) => void;
  setHoverSample: (sample: AnnotationToolPreviewSample | null) => void;
  destroy: () => void;
};

export type AnnotationToolPreviewContext = {
  scene: RuntimeScene | null;
  annotationsStore: AnnotationsStore;
  requestRender: () => void;
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

export type AnnotationToolRenderLayerContext = {
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
  annotationEntries: readonly RuntimeAnnotationEntry[];
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
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
  preview?: {
    createController: (
      context: AnnotationToolPreviewContext
    ) => AnnotationToolPreviewController | null;
  };
  keyboard?: {
    onKeyDown: (context: AnnotationToolKeyboardContext) => boolean;
  };
  renderLayer?: {
    build: (
      context: AnnotationToolRenderLayerContext
    ) => RuntimeRenderLayer | null;
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
