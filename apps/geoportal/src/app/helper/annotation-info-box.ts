import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import { CESIUM_ANNOTATION_LAYER_ID } from "../components/annotations/cesium-annotations.constants";
import { UIMode } from "../store/slices/ui";

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
  uiMode === UIMode.MEASUREMENT &&
  layers.some((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID);
