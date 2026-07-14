import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Provider as ReduxProvider } from "react-redux";
import {
  LabelOverlayProvider,
  type LabelOverlayHostBinding,
} from "@carma-providers/label-overlay";
import { FORMAT_LOCALE, LENGTH_UNIT_MODE } from "@carma-units";

import type {
  AddAnnotationOptions,
  AnnotationEntryRole,
  AnnotationElevationDisplayMode,
  CesiumGeographicCoordinate,
  StoredAnnotation,
  AnnotationNodeLinkId,
} from "../store/annotations-store.types";
import {
  selectSelectedAnnotationId,
  AnnotationsReduxContext,
  useAnnotationsSelector,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  type AnnotationsRuntimePersistenceEnvelope,
  type AnnotationsStore,
} from "../store";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import {
  ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS,
  type AnnotationReferenceObjectSizingOptions,
} from "../config/annotation-reference-object-sizing";
import type {
  AnnotationToolDraftStore,
  AnnotationToolPlugin,
  AnnotationToolRegistry,
} from "../registry";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type { Scene } from "@carma-cesium";
import type { AppendAnnotationsRuntimePersistenceStateOptions } from "../utils/annotation-tool-collections";
import { RuntimeAuthoringHost } from "./RuntimeAuthoringHost";
import { RuntimeToolAvailabilityGuard } from "./RuntimeToolAvailabilityGuard";
import { RuntimeVisualHost } from "./RuntimeVisualHost";
import { useAnnotationsAssembly } from "./use-annotations-assembly";
import { AnnotationOverlayRoots } from "../components/AnnotationOverlayRoots";
import { useLocalAnnotationsRuntimePersistence } from "../store/persistence/useLocalAnnotationsStorePersistence";
import {
  useAnnotationLabelTextRequest,
  type AnnotationLabelTextDialogState,
} from "./use-annotation-label-text-request";
import type {
  AnnotationDeleteConfirmationRequester,
  AnnotationDeleteRequestOptions,
} from "./annotation-delete-confirmation";
import type { ActivePointQueryPickResultStore } from "./active-point-query-pick-result-store";

type AnnotationsRuntimeServices = {
  scene: Scene | null;
  registry: AnnotationToolRegistry;
  annotationToolDraftStore: AnnotationToolDraftStore;
  annotationsStore: AnnotationsStore;
  formatOptions: AnnotationsRuntimeFormatOptions;
  activeEditedNodeId: string | null;
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    coordinates: readonly CesiumGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
  appendAnnotationsRuntimePersistenceState: (
    persistenceState: AnnotationsRuntimePersistenceEnvelope,
    options?: AppendAnnotationsRuntimePersistenceStateOptions
  ) => readonly string[];
  removeExternalAnnotationsByCollection: (
    externalCollection: NonNullable<StoredAnnotation["externalCollection"]>
  ) => readonly string[];
  setActiveToolType: (toolId: AnnotationToolId) => void;
  requestModeChange: (toolId: AnnotationToolId) => void;
  requestActivateTool: (toolId?: AnnotationToolId) => void;
  requestFinishMeasurement: () => boolean;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  focusAnnotationId: (annotationId: string | null) => void;
  flyToAnnotationById: (annotationId: string | null) => void;
  flyToAllAnnotations: () => void;
  removeAnnotationById: (
    annotationId: string,
    options?: AnnotationDeleteRequestOptions
  ) => void;
  removeAnnotationsByIds: (
    annotationIds: readonly string[],
    options?: AnnotationDeleteRequestOptions
  ) => void;
  buildAllAnnotationsGeoJson: () => AnnotationsRuntimeGeoJsonFeatureCollection;
  exportAnnotationGeoJson: (annotationId: string) => void;
  exportAllAnnotationsGeoJson: () => void;
  toggleAnnotationVisibility: (annotationId: string) => void;
  toggleAnnotationLocked: (annotationId: string) => void;
  removeSelectedAnnotations: (options?: AnnotationDeleteRequestOptions) => void;
  selectAllAnnotations: () => void;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (
    annotationId: string,
    currentElevationDisplayMode?: AnnotationElevationDisplayMode
  ) => void;
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
  labelTextDialogState: AnnotationLabelTextDialogState;
};

type AnnotationsProviderProps = {
  scene: Scene | null;
  plugins: readonly AnnotationToolPlugin[];
  children?: ReactNode;
  annotationOverlayContainer?: Element | DocumentFragment | null;
  initialActiveToolType?: AnnotationToolId;
  initialPointTemporaryMode?: boolean;
  labelOverlayHost?: LabelOverlayHostBinding | null;
  localPersistence?: {
    enabled?: boolean;
    storageKey: string;
  };
  renderEnabled?: boolean;
  visualRenderEnabled?: boolean;
  visualInteractionEnabled?: boolean;
  visualAnnotationEntryRoles?: readonly AnnotationEntryRole[];
  formatOptions?: AnnotationsRuntimeFormatOptions;
  lineLabelOptions?: PartialAnnotationLineLabelOptions;
  referenceObjectSizing?: AnnotationReferenceObjectSizingOptions;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
  onPersistenceStateChange?: (
    state: AnnotationsRuntimePersistenceEnvelope
  ) => void;
  confirmAnnotationDelete?: AnnotationDeleteConfirmationRequester;
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
const ActivePointQueryPickResultStoreContext =
  createContext<ActivePointQueryPickResultStore | null>(null);
const DEFAULT_RUNTIME_FORMAT_OPTIONS: AnnotationsRuntimeFormatOptions = {
  lengthMeters: {
    locale: FORMAT_LOCALE.DE_DE,
    unitMode: LENGTH_UNIT_MODE.METERS,
    maximumFractionDigitsMeters: 2,
  },
  areaSquareMeters: {
    locale: FORMAT_LOCALE.DE_DE,
  },
  degrees: {
    locale: FORMAT_LOCALE.DE_DE,
  },
  geographicCoordinate: {
    locale: FORMAT_LOCALE.DE_DE,
    fractionDigits: 6,
  },
  decimalNumber: {
    locale: FORMAT_LOCALE.DE_DE,
    fractionDigits: 2,
    useGrouping: false,
  },
};
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
  scene,
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
  formatOptions = DEFAULT_RUNTIME_FORMAT_OPTIONS,
  lineLabelOptions = DEFAULT_ANNOTATION_LINE_LABEL_OPTIONS,
  referenceObjectSizing = ANNOTATION_REFERENCE_OBJECT_SIZING_DEFAULTS,
  initialPersistenceState,
  onPersistenceStateChange,
  confirmAnnotationDelete,
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
  const {
    annotationsStore,
    services,
    setActiveToolType,
    runtimeAuthoringHost,
    runtimeVisualHost,
    registry,
    activePointQueryPickResultStore,
  } = useAnnotationsAssembly({
    scene,
    plugins,
    initialActiveToolType,
    initialPointTemporaryMode,
    formatOptions,
    lineLabelOptions,
    initialPersistenceState: resolvedInitialPersistenceState,
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

  const providerContent = (
    <AnnotationsReduxProvider
      context={AnnotationsReduxContext}
      store={annotationsStore}
    >
      <AnnotationsRuntimeContext.Provider value={runtimeServices}>
        <ActivePointQueryPickResultStoreContext.Provider
          value={activePointQueryPickResultStore}
        >
          {annotationOverlayContainer
            ? createPortal(
                <AnnotationOverlayRoots />,
                annotationOverlayContainer
              )
            : null}
          <RuntimeToolAvailabilityGuard
            registry={registry}
            setActiveToolType={setActiveToolType}
          />
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
    scene,
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
    scene,
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
