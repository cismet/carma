import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSelector } from "react-redux";
import { Button, Modal } from "react-bootstrap";

import { createDefaultAnnotationToolPlugins } from "@carma-mapping/annotations/builtin-tools";
import {
  AnnotationsProvider,
  type AnnotationDeleteConfirmationRequester,
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
import CesiumAnnotationShortcutManager from "./CesiumAnnotationShortcutManager";
import GeoportalLabelTextModal from "./GeoportalLabelTextModal";
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

  const deleteConfirmationModal = pendingConfirmation ? (
    <Modal
      show
      onHide={() => closeConfirmation(false)}
      style={{ zIndex: 2900000000 }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {pendingConfirmation.annotationCount === 1
            ? "Messung löschen"
            : "Messungen löschen"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {pendingConfirmation.annotationCount === 1
          ? "Möchten Sie diese Messung wirklich löschen?"
          : `Möchten Sie diese ${pendingConfirmation.annotationCount} Messungen wirklich löschen?`}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => closeConfirmation(false)}>
          Abbrechen
        </Button>
        <Button variant="danger" onClick={() => closeConfirmation(true)}>
          Löschen
        </Button>
      </Modal.Footer>
    </Modal>
  ) : null;

  return {
    confirmAnnotationDelete,
    deleteConfirmationModal,
  };
};

function GeoportalCesiumAnnotationLayerbarRegistration() {
  useGeoportalCesiumAnnotationLayerbar();
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
      confirmAnnotationDelete={confirmAnnotationDelete}
    >
      <GeoportalCesiumAnnotationLayerbarRegistration />
      {annotationsVisible ? <CesiumAnnotationShortcutManager /> : null}
      <GeoportalLabelTextModal />
      {deleteConfirmationModal}
      {children}
    </AnnotationsProvider>
  );
}
