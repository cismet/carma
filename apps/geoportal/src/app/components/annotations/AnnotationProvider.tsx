import { useMemo, type ReactNode } from "react";
import { useSelector } from "react-redux";

import { createDefaultAnnotationToolPlugins } from "@carma-mapping/annotations/builtin-tools";
import { AnnotationsProvider } from "@carma-mapping/annotations/runtime";
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

function GeoportalCesiumAnnotationLayerbarRegistration() {
  useGeoportalCesiumAnnotationLayerbar();
  return null;
}

export function AnnotationProvider({ children }: AnnotationProviderProps) {
  const { getScene } = useCesiumContext();
  const { isCesium } = useMapFrameworkSwitcherContext();
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
    >
      <GeoportalCesiumAnnotationLayerbarRegistration />
      {annotationsVisible ? <CesiumAnnotationShortcutManager /> : null}
      <GeoportalLabelTextModal />
      {children}
    </AnnotationsProvider>
  );
}
