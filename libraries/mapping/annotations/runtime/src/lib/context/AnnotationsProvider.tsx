import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";

import type {
  RuntimeAddAnnotationOptions,
  RuntimeCoordinate,
  RuntimeMeasurement,
  RuntimeNodeLinkId,
} from "../store/annotations-store.types";
import {
  selectSelectedAnnotationId,
  AnnotationsReduxContext,
  useAnnotationsSelector,
  type AnnotationsStore,
} from "../store";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import type { AnnotationsRuntimePersistenceEnvelope } from "../persistence/annotations-runtime-persistence";
import type {
  AnnotationToolPlugin,
  AnnotationToolRegistry,
} from "../tools/annotation-tool-plugin.types";
import type { RuntimeScene } from "../types/runtime-scene.types";
import type { RuntimeToolId } from "../types/runtime-tool.types";
import { RuntimeAuthoringHost } from "./RuntimeAuthoringHost";
import { RuntimeToolAvailabilityGuard } from "./RuntimeToolAvailabilityGuard";
import { RuntimeVisualHost } from "./RuntimeVisualHost";
import { useAnnotationsRuntimeAssembly } from "./use-annotations-runtime-assembly";

type AnnotationsRuntimeServices = {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  formatOptions: AnnotationsRuntimeFormatOptions;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions,
    linkedNodeGroupIds?: readonly (RuntimeNodeLinkId | null | undefined)[]
  ) => RuntimeMeasurement;
  setActiveToolType: (toolType: RuntimeToolId) => void;
  requestModeChange: (toolType: RuntimeToolId) => void;
  requestStartMeasurement: (toolType?: RuntimeToolId) => void;
  requestFinishMeasurement: () => boolean;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  focusAnnotationId: (annotationId: string | null) => void;
  flyToAnnotationById: (annotationId: string | null) => void;
  flyToAllAnnotations: () => void;
  removeAnnotationById: (annotationId: string) => void;
  exportAnnotationGeoJson: (annotationId: string) => void;
  toggleAnnotationVisibility: (annotationId: string) => void;
  toggleAnnotationLocked: (annotationId: string) => void;
  removeSelectedAnnotations: () => void;
  selectAllAnnotations: () => void;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (annotationId: string) => void;
  updateAnnotationDisplayName: (
    annotationId: string,
    displayName: string
  ) => void;
  updateAnnotationShortLabel: (
    annotationId: string,
    shortLabel: string
  ) => void;
  setPointTemporaryMode: (temporaryMode: boolean) => void;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  setSelectedAnnotationIds: (annotationIds: readonly string[]) => void;
  setCursorOverlayEnabled: (enabled: boolean) => void;
};

type AnnotationsProviderProps = {
  scene: RuntimeScene | null;
  children?: ReactNode;
  initialActiveToolType?: RuntimeToolId;
  initialPointTemporaryMode?: boolean;
  plugins?: readonly AnnotationToolPlugin[];
  formatOptions?: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
  onPersistenceStateChange?: (
    state: AnnotationsRuntimePersistenceEnvelope
  ) => void;
};

type AnnotationsReduxProviderProps = {
  store: AnnotationsStore;
  context: typeof AnnotationsReduxContext;
  children?: ReactNode;
};

const AnnotationsReduxProvider = ReduxProvider as unknown as (
  props: AnnotationsReduxProviderProps
) => ReactNode;

const AnnotationsRuntimeContext =
  createContext<AnnotationsRuntimeServices | null>(null);
const DEFAULT_RUNTIME_FORMAT_OPTIONS: AnnotationsRuntimeFormatOptions = {};
const DEFAULT_PREVIEW_LINE_LABEL_VISUAL_OPTIONS: Partial<PreviewLineLabelVisualOptions> =
  {};

const useRequiredAnnotationsRuntimeServices = () => {
  const context = useContext(AnnotationsRuntimeContext);

  if (!context) {
    throw new Error(
      "useAnnotationsRuntime must be used within AnnotationsProvider."
    );
  }

  return context;
};

export const AnnotationsProvider = ({
  scene,
  children,
  initialActiveToolType,
  initialPointTemporaryMode = false,
  plugins,
  formatOptions = DEFAULT_RUNTIME_FORMAT_OPTIONS,
  previewLineLabelVisualOptions = DEFAULT_PREVIEW_LINE_LABEL_VISUAL_OPTIONS,
  initialPersistenceState = null,
  onPersistenceStateChange,
}: AnnotationsProviderProps) => {
  const {
    annotationsStore,
    services,
    setActiveToolType,
    runtimeAuthoringHost,
    runtimeVisualHost,
    registry,
  } = useAnnotationsRuntimeAssembly({
    scene,
    plugins,
    initialActiveToolType,
    initialPointTemporaryMode,
    formatOptions,
    previewLineLabelVisualOptions,
    initialPersistenceState,
    onPersistenceStateChange,
  });

  return (
    <AnnotationsReduxProvider
      context={AnnotationsReduxContext}
      store={annotationsStore}
    >
      <AnnotationsRuntimeContext.Provider value={services}>
        <RuntimeToolAvailabilityGuard
          registry={registry}
          setActiveToolType={setActiveToolType}
        />
        <RuntimeAuthoringHost {...runtimeAuthoringHost} />
        <RuntimeVisualHost {...runtimeVisualHost} />
        {children}
      </AnnotationsRuntimeContext.Provider>
    </AnnotationsReduxProvider>
  );
};

export const useAnnotationsRuntime = () => {
  const {
    scene,
    registry,
    formatOptions,
    addAnnotation,
    setActiveToolType,
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
    focusAdjacentAnnotationEntry,
    focusAnnotationId,
    flyToAnnotationById,
    flyToAllAnnotations,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    removeSelectedAnnotations,
    selectAllAnnotations,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    setPointTemporaryMode,
    setSelectedAnnotationId,
    setSelectedAnnotationIds,
    setCursorOverlayEnabled,
  } = useRequiredAnnotationsRuntimeServices();
  const activeToolType = useAnnotationsSelector(
    (state) => state.annotationToolType
  );
  const nodes = useAnnotationsSelector((state) => state.nodes);
  const edges = useAnnotationsSelector((state) => state.edges);
  const annotationEntries = useAnnotationsSelector(
    (state) => state.annotationEntries
  );
  const selectedAnnotationId = useAnnotationsSelector(
    selectSelectedAnnotationId
  );
  const selectedAnnotationIds = useAnnotationsSelector(
    (state) => state.selectionState.selectedAnnotationIds
  );
  const elevationReferenceAnnotationId = useAnnotationsSelector(
    (state) => state.settingsState.elevationReferenceAnnotationId
  );
  const pointTemporaryMode = useAnnotationsSelector(
    (state) => state.settingsState.pointTemporaryMode
  );

  return {
    scene,
    registry,
    formatOptions,
    activeToolType,
    setActiveToolType,
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
    focusAdjacentAnnotationEntry,
    focusAnnotationId,
    flyToAnnotationById,
    flyToAllAnnotations,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    removeSelectedAnnotations,
    selectAllAnnotations,
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    pointTemporaryMode,
    setPointTemporaryMode,
    nodes,
    edges,
    annotationEntries,
    selectedAnnotationId,
    selectedAnnotationIds,
    setSelectedAnnotationId,
    setSelectedAnnotationIds,
    addAnnotation,
    setCursorOverlayEnabled,
  };
};

export const useRuntimeCursorOverlay = (enabled: boolean) => {
  const { setCursorOverlayEnabled } = useRequiredAnnotationsRuntimeServices();

  useEffect(() => {
    setCursorOverlayEnabled(enabled);
  }, [enabled, setCursorOverlayEnabled]);

  useEffect(
    () => () => {
      setCursorOverlayEnabled(false);
    },
    [setCursorOverlayEnabled]
  );
};
