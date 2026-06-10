import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSelector } from "react-redux";

import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import { createDefaultAnnotationToolPlugins } from "@carma-mapping/annotations/builtin-tools";
import {
  ANNOTATION_ENTRY_ROLES,
  AnnotationsProvider,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  type AnnotationDeleteConfirmationRequester,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useCesiumContext } from "@carma-mapping/engines/cesium/legacy";

import { APP_KEY } from "../../config";
import { CESIUM_ANNOTATION_CONFIG } from "../../config/app.config";
import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";
import { useGeoportalCesiumAnnotationLayerbar } from "../../hooks/use-geoportal-cesium-annotation-layerbar";
import { useGeoportalCesiumAnnotationModeLifecycle } from "../../hooks/use-geoportal-cesium-annotation-mode-lifecycle";
import { useGeoportalCesiumAnnotationOverlayHost } from "../../hooks/use-geoportal-cesium-annotation-overlay-host";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";
import { getLayers } from "../../store/slices/mapping";
import { getUIMode, UIMode } from "../../store/slices/ui";
import { layerHasRuntimeAnnotationsGeoJson } from "../../helper/annotation-info-box";
import CesiumAnnotationShortcutManager from "./CesiumAnnotationShortcutManager";
import GeoportalLabelTextModal from "./GeoportalLabelTextModal";
import { MeasurementDeleteConfirmationModal } from "./MeasurementDeleteConfirmationModal";
import { CESIUM_ANNOTATION_LAYER_ID } from "./cesium-annotations.constants";

type AnnotationProviderProps = {
  children: ReactNode;
};

type PendingAnnotationDeleteConfirmation = {
  annotationCount: number;
};

const useGeoportalAnnotationDeleteConfirmation = () => {
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingAnnotationDeleteConfirmation | null>(null);

  const closeConfirmation = useCallback((confirmed: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setPendingConfirmation(null);
    resolver?.(confirmed);
  }, []);

  const confirmAnnotationDelete =
    useCallback<AnnotationDeleteConfirmationRequester>(({ annotations }) => {
      if (annotations.length === 0) {
        return false;
      }

      if (resolverRef.current) {
        return false;
      }

      return new Promise((resolve) => {
        resolverRef.current = resolve;
        setPendingConfirmation({
          annotationCount: annotations.length,
        });
      });
    }, []);

  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    []
  );

  const deleteConfirmationModal = (
    <MeasurementDeleteConfirmationModal
      show={pendingConfirmation !== null}
      count={pendingConfirmation?.annotationCount ?? 0}
      onConfirm={() => closeConfirmation(true)}
      onCancel={() => closeConfirmation(false)}
    />
  );

  return {
    confirmAnnotationDelete,
    deleteConfirmationModal,
  };
};

function GeoportalCesiumAnnotationLayerbarRegistration() {
  useGeoportalCesiumAnnotationLayerbar();
  return null;
}

function GeoportalSavedAnnotationFeatureCollectionRegistration() {
  const { featureCollections } = useAdhocFeatureDisplay();
  const {
    appendAnnotationsRuntimePersistenceState,
    removeExternalAnnotationsByCollection,
  } = useAnnotationsRuntime();
  const activeCollectionIds = useMemo(
    () =>
      new Set(
        featureCollections.flatMap((collection) =>
          collection.features.flatMap((feature) => {
            if (feature.metadata?.renderAsRuntimeAnnotations !== true) {
              return [];
            }
            return [collection.id];
          })
        )
      ),
    [featureCollections]
  );
  const registeredCollectionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const collection of featureCollections) {
      for (const feature of collection.features) {
        if (feature.metadata?.renderAsRuntimeAnnotations !== true) {
          continue;
        }

        const externalCollection = {
          type: "saved-measurement" as const,
          id: collection.id,
        };
        const persistenceState =
          resolveAnnotationsRuntimePersistenceFromGeoJson(
            feature.metadata.annotationsGeoJson
          );
        if (!persistenceState) {
          continue;
        }

        appendAnnotationsRuntimePersistenceState(persistenceState, {
          idPrefix: collection.id,
          annotationRole: ANNOTATION_ENTRY_ROLES.EXTERNAL,
          readOnly: true,
          externalCollection,
          selectAnnotationId: null,
          skipExisting: true,
        });
        registeredCollectionIdsRef.current.add(collection.id);
      }
    }

    for (const collectionId of [...registeredCollectionIdsRef.current]) {
      if (activeCollectionIds.has(collectionId)) {
        continue;
      }
      removeExternalAnnotationsByCollection({
        type: "saved-measurement",
        id: collectionId,
      });
      registeredCollectionIdsRef.current.delete(collectionId);
    }
  }, [
    activeCollectionIds,
    appendAnnotationsRuntimePersistenceState,
    featureCollections,
    removeExternalAnnotationsByCollection,
  ]);

  return null;
}

function GeoportalSavedAnnotationInteractionModeGuard() {
  const layers = useSelector(getLayers);
  const uiMode = useSelector(getUIMode);
  const { isCesium } = useMapFrameworkSwitcherContext();
  const { activeToolType, setActiveToolType } = useAnnotationsRuntime();
  const savedAnnotationsVisible =
    isCesium && layers.some(layerHasRuntimeAnnotationsGeoJson);
  const isCesiumAnnotationMode = isCesium && uiMode === UIMode.MEASUREMENT;

  useEffect(() => {
    if (
      savedAnnotationsVisible &&
      !isCesiumAnnotationMode &&
      activeToolType !== ANNOTATION_SELECT_TOOL_ID
    ) {
      setActiveToolType(ANNOTATION_SELECT_TOOL_ID);
    }
  }, [
    activeToolType,
    isCesiumAnnotationMode,
    savedAnnotationsVisible,
    setActiveToolType,
  ]);

  return null;
}

export function AnnotationProvider({ children }: AnnotationProviderProps) {
  const { getScene } = useCesiumContext();
  const { isCesium } = useMapFrameworkSwitcherContext();
  const { confirmAnnotationDelete, deleteConfirmationModal } =
    useGeoportalAnnotationDeleteConfirmation();
  const scene = getScene();
  const uiMode = useSelector(getUIMode);
  const layers = useSelector(getLayers);
  const isCesiumAnnotationMode = isCesium && uiMode === UIMode.MEASUREMENT;
  const annotationsVisible =
    isCesiumAnnotationMode &&
    layers.some((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID);
  const savedAnnotationsVisible =
    isCesium && layers.some(layerHasRuntimeAnnotationsGeoJson);
  useGeoportalCesiumAnnotationModeLifecycle({
    active: isCesiumAnnotationMode,
  });
  const { overlayContainer, overlayHost } =
    useGeoportalCesiumAnnotationOverlayHost(scene);
  const annotationToolPlugins = useMemo(
    () =>
      createDefaultAnnotationToolPlugins({
        measurementLineStyle: CESIUM_ANNOTATION_CONFIG.measurementLineStyle,
        areaOcclusionStyle: CESIUM_ANNOTATION_CONFIG.areaOcclusionStyle,
        texts: geoportalAnnotationModeText.annotationTools,
      }),
    [geoportalAnnotationModeText.annotationTools]
  );
  const availableAnnotationToolPlugins =
    useGeoportalCesiumAnnotationToolPlugins(annotationToolPlugins);

  return (
    <AnnotationsProvider
      scene={scene}
      plugins={availableAnnotationToolPlugins}
      annotationOverlayContainer={overlayContainer}
      initialActiveToolType={CESIUM_ANNOTATION_CONFIG.tools.defaultToolId}
      labelOverlayHost={overlayHost}
      localPersistence={{
        storageKey: "@" + APP_KEY + ".app.cesium-annotations",
      }}
      renderEnabled={annotationsVisible}
      visualRenderEnabled={annotationsVisible || savedAnnotationsVisible}
      visualInteractionEnabled={savedAnnotationsVisible}
      confirmAnnotationDelete={confirmAnnotationDelete}
    >
      <GeoportalCesiumAnnotationLayerbarRegistration />
      <GeoportalSavedAnnotationFeatureCollectionRegistration />
      <GeoportalSavedAnnotationInteractionModeGuard />
      {annotationsVisible ? <CesiumAnnotationShortcutManager /> : null}
      <GeoportalLabelTextModal />
      {deleteConfirmationModal}
      {children}
    </AnnotationsProvider>
  );
}
