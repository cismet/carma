import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import { CESIUM_ANNOTATION_LAYER_ID } from "../components/annotations/cesium-annotations.constants";
import { UIMode } from "../store/slices/ui";
import { is3dAnnotationAdhocLayer } from "./adhoc-feature-utils";

export const layerUsesRuntimeAnnotationVisibility = (
  layer: BackgroundLayer | Layer
): boolean =>
  layer.id === CESIUM_ANNOTATION_LAYER_ID || is3dAnnotationAdhocLayer(layer);

export const shouldShowAnnotationInfoBox = ({
  isCesium,
  layers,
  uiMode,
}: {
  isCesium: boolean;
  layers: readonly (BackgroundLayer | Layer)[];
  uiMode: UIMode;
}): boolean =>
  isCesium &&
  ((uiMode === UIMode.MEASUREMENT &&
    layers.some((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID)) ||
    layers.some(
      (layer) => layer.visible !== false && is3dAnnotationAdhocLayer(layer)
    ));
