import { useMemo, type ReactNode } from "react";

import { createDefaultAnnotationToolPlugins } from "@carma-mapping/annotations/builtin-tools";
import {
  AnnotationsProvider,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

import { useSavedAnnotationCollectionSync } from "../../hooks/use-saved-annotation-collection-sync";
import {
  CESIUM_ANNOTATION_CONFIG,
  GEOPORTAL_ANNOTATIONS_STORAGE_KEY,
} from "../../config/app.config";
import { geoportalAnnotationModeText } from "../../config/geoportalTextConfig";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";
import { useGeoportalAnnotationDeleteConfirmation } from "../../hooks/use-geoportal-annotation-delete-confirmation";
import AnnotationLabelTextModal from "./AnnotationLabelTextModal";

type AnnotationProviderProps = {
  children: ReactNode;
};

function SavedAnnotationCollectionSync() {
  const runtime = useAnnotationsRuntime();
  useSavedAnnotationCollectionSync(runtime);
  return null;
}

/**
 * The app's own annotation runtime, without a rendering engine: the MapLibre
 * 3D view draws its measurements through the `measurement3d` addon, which
 * brings its own runtime; this one holds the tool plugins and saved sets the
 * layer buttons read.
 */
export function AnnotationProvider({ children }: AnnotationProviderProps) {
  const { confirmAnnotationDelete, deleteConfirmationModal } =
    useGeoportalAnnotationDeleteConfirmation();
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
    <AnnotationsProvider
      engine={null}
      plugins={availableAnnotationToolPlugins}
      initialActiveToolType={CESIUM_ANNOTATION_CONFIG.tools.defaultToolId}
      referenceObjectSizing={CESIUM_ANNOTATION_CONFIG.referenceObjectSizing}
      localPersistence={{ storageKey: GEOPORTAL_ANNOTATIONS_STORAGE_KEY }}
      renderEnabled={false}
      visualRenderEnabled={false}
      confirmAnnotationDelete={confirmAnnotationDelete}
    >
      <SavedAnnotationCollectionSync />
      <AnnotationLabelTextModal />
      {deleteConfirmationModal}
      {children}
    </AnnotationsProvider>
  );
}
