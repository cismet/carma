import {
  Fragment,
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Provider as ReduxProvider } from "react-redux";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";

import {
  selectSelectedAnnotationId,
  AnnotationsReduxContext,
  useAnnotationsSelector,
  type AnnotationsStore,
} from "../store";
import { ANNOTATIONS_RUNTIME_FORMAT_DEFAULTS } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import { ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS } from "../config/annotation-reference-object-sizing";
import { RuntimeAuthoringHost } from "./RuntimeAuthoringHost";
import { RuntimeToolAvailabilityGuard } from "./RuntimeToolAvailabilityGuard";
import { RuntimeVisualHost } from "./RuntimeVisualHost";
import { useAnnotationsAssembly } from "./use-annotations-assembly";
import { AnnotationOverlayRoots } from "../components/AnnotationOverlayRoots";
import { useLocalAnnotationsRuntimePersistence } from "../store/persistence/use-local-annotations-runtime-persistence";
import { useAnnotationLabelTextRequest } from "./use-annotation-label-text-request";
import type { ActivePointQueryPickResultStore } from "./active-point-query-pick-result-store";
import { useCarmaAnnotationsApi } from "../api/use-carma-annotations-api";
import type {
  AnnotationsProviderProps,
  AnnotationsRuntimeServices,
} from "./annotations-provider.types";

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
const ActivePointQueryPickResultStoreContext =
  createContext<ActivePointQueryPickResultStore | null>(null);
const DEFAULT_ANNOTATION_LINE_LABEL_OPTIONS: PartialAnnotationLineLabelOptions =
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

const useRequiredActivePointQueryPickResultStore = () => {
  const store = useContext(ActivePointQueryPickResultStoreContext);

  if (!store) {
    throw new Error(
      "useActivePointQueryPickResult must be used within AnnotationsProvider."
    );
  }

  return store;
};

export const AnnotationsProvider = ({
  engine,
  plugins,
  children,
  annotationOverlayContainer = null,
  initialActiveToolType,
  initialPointTemporaryMode = false,
  labelOverlayHost = null,
  localPersistence,
  renderEnabled = true,
  visualRenderEnabled,
  visualInteractionEnabled,
  visualAnnotationEntryRoles,
  formatOptions = ANNOTATIONS_RUNTIME_FORMAT_DEFAULTS,
  lineLabelOptions = DEFAULT_ANNOTATION_LINE_LABEL_OPTIONS,
  referenceObjectSizing = ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS,
  initialPersistenceState,
  onPersistenceStateChange,
  confirmAnnotationDelete,
  carmaApi = true,
}: AnnotationsProviderProps) => {
  const { labelTextDialogState, requestLabelText } =
    useAnnotationLabelTextRequest({
      enabled: renderEnabled,
    });
  const localPersistenceEnabled =
    Boolean(localPersistence?.storageKey) &&
    (localPersistence?.enabled ?? true);
  const localPersistenceState = useLocalAnnotationsRuntimePersistence({
    enabled: localPersistenceEnabled,
    storageKey: localPersistence?.storageKey ?? "",
  });
  const resolvedInitialPersistenceState =
    initialPersistenceState !== undefined
      ? initialPersistenceState
      : localPersistenceState.initialPersistenceState;
  const resolvedOnPersistenceStateChange =
    onPersistenceStateChange ?? localPersistenceState.onPersistenceStateChange;
  const sharedStoreKey =
    localPersistenceEnabled &&
    initialPersistenceState === undefined &&
    onPersistenceStateChange === undefined
      ? localPersistence?.storageKey
      : undefined;
  const {
    annotationsStore,
    services,
    setActiveToolType,
    runtimeAuthoringHost,
    runtimeVisualHost,
    registry,
    activePointQueryPickResultStore,
  } = useAnnotationsAssembly({
    engine,
    plugins,
    initialActiveToolType,
    initialPointTemporaryMode,
    formatOptions,
    lineLabelOptions,
    initialPersistenceState: resolvedInitialPersistenceState,
    storeKey: sharedStoreKey,
    onPersistenceStateChange: resolvedOnPersistenceStateChange,
    requestLabelText: renderEnabled ? requestLabelText : undefined,
    confirmAnnotationDelete,
  });

  const runtimeServices = useMemo(
    () => ({
      ...services,
      labelTextDialogState,
    }),
    [labelTextDialogState, services]
  );
  useCarmaAnnotationsApi(runtimeServices, carmaApi && renderEnabled);

  // The hosts call the adapter-contributed hooks (`engine.hooks.*`); keying
  // them by the engine kind remounts them for a different engine so the hook
  // order inside a mounted host never changes.
  const engineHostsKey = engine?.kind ?? "none";

  const providerContent = (
    <AnnotationsReduxProvider
      context={AnnotationsReduxContext}
      store={annotationsStore}
    >
      <AnnotationsRuntimeContext.Provider value={runtimeServices}>
        <ActivePointQueryPickResultStoreContext.Provider
          value={activePointQueryPickResultStore}
        >
          {/* Outside the engine-keyed hosts: the roots hold no engine hooks,
              and a remount would strand the label overlay attached to the
              old label root. */}
          {annotationOverlayContainer
            ? createPortal(
                <AnnotationOverlayRoots />,
                annotationOverlayContainer
              )
            : null}
          <Fragment key={engineHostsKey}>
            {/* On a shared store only the rendering runtime falls back
                to an available tool: a hidden runtime with other tools
                would reset the visible runtime's tool. */}
            {renderEnabled || !sharedStoreKey ? (
              <RuntimeToolAvailabilityGuard
                registry={registry}
                setActiveToolType={setActiveToolType}
              />
            ) : null}
            {renderEnabled ? (
              <RuntimeAuthoringHost
                {...runtimeAuthoringHost}
                referenceObjectSizing={referenceObjectSizing}
              />
            ) : null}
            {visualRenderEnabled ?? renderEnabled ? (
              <RuntimeVisualHost
                {...runtimeVisualHost}
                visualAnnotationEntryRoles={visualAnnotationEntryRoles}
                visualInteractionEnabled={visualInteractionEnabled}
                referenceObjectSizing={referenceObjectSizing}
              />
            ) : null}
          </Fragment>
          {children}
        </ActivePointQueryPickResultStoreContext.Provider>
      </AnnotationsRuntimeContext.Provider>
    </AnnotationsReduxProvider>
  );

  if (!labelOverlayHost) {
    return providerContent;
  }

  return (
    <LabelOverlayProvider host={labelOverlayHost}>
      {providerContent}
    </LabelOverlayProvider>
  );
};

export const useAnnotationsRuntime = () => {
  const {
    engine,
    registry,
    annotationToolDraftStore,
    formatOptions,
    addAnnotation,
    appendAnnotationsRuntimePersistenceState,
    removeExternalAnnotationsByCollection,
    setActiveToolType,
    requestModeChange,
    requestActivateTool,
    requestFinishMeasurement,
    focusAdjacentAnnotationEntry,
    focusAnnotationId,
    flyToAnnotationById,
    flyToAllAnnotations,
    removeAnnotationById,
    removeAnnotationsByIds,
    buildAllAnnotationsGeoJson,
    exportAnnotationGeoJson,
    exportAllAnnotationsGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    removeSelectedAnnotations,
    selectAllAnnotations,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    activeEditedNodeId,
    setPointTemporaryMode,
    setSelectedAnnotationId,
    setSelectedAnnotationIds,
    labelTextDialogState,
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
    engine,
    registry,
    annotationToolDraftStore,
    formatOptions,
    activeToolType,
    setActiveToolType,
    requestModeChange,
    requestActivateTool,
    requestFinishMeasurement,
    focusAdjacentAnnotationEntry,
    focusAnnotationId,
    flyToAnnotationById,
    flyToAllAnnotations,
    removeAnnotationById,
    removeAnnotationsByIds,
    buildAllAnnotationsGeoJson,
    exportAnnotationGeoJson,
    exportAllAnnotationsGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    removeSelectedAnnotations,
    selectAllAnnotations,
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    activeEditedNodeId,
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
    appendAnnotationsRuntimePersistenceState,
    removeExternalAnnotationsByCollection,
    labelTextDialogState,
  };
};

export const useActivePointQueryPickResult = () => {
  const store = useRequiredActivePointQueryPickResultStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );
};

export const useAnnotationLabelTextDialogState = () => {
  const { labelTextDialogState } = useRequiredAnnotationsRuntimeServices();
  return labelTextDialogState;
};
