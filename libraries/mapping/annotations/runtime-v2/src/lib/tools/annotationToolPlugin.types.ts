import type { ReactNode } from "react";

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
  RuntimeAnnotationEntry,
  RuntimeCoordinate,
  RuntimeEdge,
  RuntimeMeasurement,
  RuntimeNode,
} from "../store";
import type { RuntimeToolId } from "../types/runtimeTool.types";

export type AnnotationToolPluginKind = "interaction" | "measurement";

export type AnnotationToolPluginCapability =
  | "session"
  | "settings"
  | "pointQuery"
  | "preview"
  | "previewPrimitives"
  | "toolbarOptions"
  | "infoBox";

export type AnnotationToolDescriptor = {
  id: RuntimeToolId;
  order: number;
  label: string;
  tooltip: string;
  icon?: ReactNode;
};

export type AnnotationToolSessionContext = {
  state: AnnotationsStoreState;
  getState: () => AnnotationsStoreState;
  dispatch: AnnotationsStore["dispatch"];
  setActiveToolType: (toolType: RuntimeToolId) => void;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[]
  ) => RuntimeMeasurement;
};

export type PointQueryCreatedContext = {
  coordinate: RuntimeCoordinate;
  activeToolType: RuntimeToolId;
  activeToolSession: AnnotationModeSession | null;
  toolSessions: AnnotationModeSessionMap;
  sessionContext: AnnotationToolSessionContext;
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
  state: AnnotationsStoreState;
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
  annotationEntries: readonly RuntimeAnnotationEntry[];
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: (annotationId: string | null) => void;
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
