import { useEffect, useMemo, type ReactNode } from "react";
import { useSelector } from "react-redux";

import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import { createDefaultAnnotationToolPlugins } from "@carma-mapping/annotations/builtin-tools";
import {
  ANNOTATION_ENTRY_ROLES,
  AnnotationsProvider,
  SharedAnnotationsImport,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { confirmSharedAnnotationsConflicts } from "@carma-mapping/annotations/ui";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

import { useSavedAnnotationCollectionSync } from "../../hooks/use-saved-annotation-collection-sync";
import {
  CESIUM_ANNOTATION_CONFIG,
  GEOPORTAL_ANNOTATIONS_STORAGE_KEY,
} from "../../config/app.config";
import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";
import { IS_MEASUREMENT3D_AVAILABLE } from "../../config/measurement3d-availability";
import { useGeoportalCesiumAnnotationLayerbar } from "../../hooks/use-geoportal-cesium-annotation-layerbar";
import { useGeoportalCesiumAnnotationModeLifecycle } from "../../hooks/use-geoportal-cesium-annotation-mode-lifecycle";
import { useGeoportalCesiumAnnotationOverlayHost } from "../../hooks/use-geoportal-cesium-annotation-overlay-host";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";
import { useGeoportalAnnotationDeleteConfirmation } from "../../hooks/use-geoportal-annotation-delete-confirmation";
import { useGeoportalAnnotationEngine } from "../../hooks/use-geoportal-annotation-engine";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode, UIMode } from "../../store/slices/ui";
import AnnotationLabelTextModal from "./AnnotationLabelTextModal";
import AnnotationShortcutBindings from "./AnnotationShortcutBindings";
import { CESIUM_ANNOTATION_LAYER_ID } from "./cesium-annotations.constants";
import {
  GeoportalAnnotationHostContext,
  useGeoportalAnnotationHost,
} from "./GeoportalAnnotationHostContext";
import { hasVisibleSavedAnnotationCollections } from "./saved-annotation-collection-registration";

type AnnotationProviderProps = {
  children: ReactNode;
};

const EXTERNAL_ANNOTATION_ENTRY_ROLES = [
  ANNOTATION_ENTRY_ROLES.EXTERNAL,
] as const;

function AnnotationLayerbarSync() {
  useGeoportalCesiumAnnotationLayerbar();
  return null;
}

function SavedAnnotationCollectionSync() {
  const runtime = useAnnotationsRuntime();
  useSavedAnnotationCollectionSync(runtime);
  return null;
}

function SavedAnnotationModeGuard() {
  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const { is3dAnnotationHost } = useGeoportalAnnotationHost();
  const { activeToolType, setActiveToolType } = useAnnotationsRuntime();
  const savedAnnotationsVisible =
    is3dAnnotationHost && hasVisibleSavedAnnotationCollections(layers);
  const isAnnotationMode = is3dAnnotationHost && uiMode === UIMode.MEASUREMENT;

  useEffect(() => {
    if (
      savedAnnotationsVisible &&
      !isAnnotationMode &&
      activeToolType !== ANNOTATION_SELECT_TOOL_ID
    ) {
      setActiveToolType(ANNOTATION_SELECT_TOOL_ID);
    }
  }, [
    activeToolType,
    isAnnotationMode,
    savedAnnotationsVisible,
    setActiveToolType,
  ]);

  return null;
}

export function AnnotationProvider({ children }: AnnotationProviderProps) {
  const { getScene } = useCesiumContext();
  const { isCesium } = useMapFrameworkSwitcherContext();
  const annotationHost = useGeoportalAnnotationEngine();
  const { engine, is3dAnnotationHost } = annotationHost;
  const { confirmAnnotationDelete, deleteConfirmationModal } =
    useGeoportalAnnotationDeleteConfirmation();
  const scene = getScene();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const isAnnotationMode = is3dAnnotationHost && uiMode === UIMode.MEASUREMENT;
  const annotationsVisible =
    isAnnotationMode &&
    layers.some((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID);
  const savedAnnotationsVisible =
    is3dAnnotationHost && hasVisibleSavedAnnotationCollections(layers);
  // the camera limiter toggle is a Cesium concern; the MapLibre host keeps
  // its own camera restriction
  useGeoportalCesiumAnnotationModeLifecycle({
    active: isCesium && isAnnotationMode,
  });
  const { overlayContainer, overlayHost } =
    useGeoportalCesiumAnnotationOverlayHost(isCesium ? scene : null);
  const annotationToolPlugins = useMemo(
    () =>
      createDefaultAnnotationToolPlugins({
        annotationLineStyle: CESIUM_ANNOTATION_CONFIG.style.lines,
        areaOcclusionStyle: CESIUM_ANNOTATION_CONFIG.style.areaOcclusion,
        texts: geoportalAnnotationModeText.annotationTools,
      }),
    [geoportalAnnotationModeText.annotationTools]
  );
  const availableAnnotationToolPlugins =
    useGeoportalCesiumAnnotationToolPlugins(annotationToolPlugins);

  return (
    <GeoportalAnnotationHostContext.Provider value={annotationHost}>
      <AnnotationsProvider
        engine={engine}
        plugins={availableAnnotationToolPlugins}
        annotationOverlayContainer={overlayContainer}
        initialActiveToolType={CESIUM_ANNOTATION_CONFIG.tools.defaultToolId}
        referenceObjectSizing={CESIUM_ANNOTATION_CONFIG.referenceObjectSizing}
        labelOverlayHost={overlayHost}
        localPersistence={{ storageKey: GEOPORTAL_ANNOTATIONS_STORAGE_KEY }}
        renderEnabled={annotationsVisible}
        visualRenderEnabled={annotationsVisible || savedAnnotationsVisible}
        visualAnnotationEntryRoles={
          !annotationsVisible && savedAnnotationsVisible
            ? EXTERNAL_ANNOTATION_ENTRY_ROLES
            : undefined
        }
        visualInteractionEnabled={savedAnnotationsVisible}
        confirmAnnotationDelete={confirmAnnotationDelete}
      >
        <AnnotationLayerbarSync />
        <SavedAnnotationCollectionSync />
        <SavedAnnotationModeGuard />
        {annotationsVisible ? <AnnotationShortcutBindings /> : null}
        <AnnotationLabelTextModal />
        {/* Both views persist to one key; only the view on screen takes a
            shared set, so its own store holds what it just saved. */}
        {isCesium && IS_MEASUREMENT3D_AVAILABLE ? (
          <SharedAnnotationsImport
            consumerKey={GEOPORTAL_ANNOTATIONS_STORAGE_KEY}
            confirmConflicts={confirmSharedAnnotationsConflicts}
          />
        ) : null}
        {deleteConfirmationModal}
        {children}
      </AnnotationsProvider>
    </GeoportalAnnotationHostContext.Provider>
  );
}
