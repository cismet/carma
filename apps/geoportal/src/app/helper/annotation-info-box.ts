import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxSlotsState,
} from "@carma-mapping/annotations/runtime";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import { CESIUM_ANNOTATION_LAYER_ID } from "../components/annotations/cesium-annotations.constants";
import { UIMode } from "../store/slices/ui";
import {
  is3dAnnotationAdhocLayer,
  isVisible3dAnnotationAdhocLayer,
} from "./adhoc-feature-utils";

export const layerUsesRuntimeAnnotationVisibility = (
  layer: BackgroundLayer | Layer
): boolean =>
  layer.id === CESIUM_ANNOTATION_LAYER_ID || is3dAnnotationAdhocLayer(layer);

const hasCesiumAnnotationLayer = (
  layers: readonly (BackgroundLayer | Layer)[]
): boolean => layers.some((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID);

export const isExternalAnnotationInfoBoxState = (
  infoBoxState: RuntimeAnnotationInfoBoxSlotsState | null
): boolean =>
  infoBoxState?.kind ===
    RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION &&
  infoBoxState.annotation.externalCollection !== undefined;

const isVisibleExternalAnnotationCollection = (
  layers: readonly (BackgroundLayer | Layer)[],
  infoBoxState: RuntimeAnnotationInfoBoxSlotsState
): boolean => {
  if (
    infoBoxState.kind !== RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION
  ) {
    return false;
  }

  const collectionId = infoBoxState.annotation.externalCollection?.id;
  if (collectionId === undefined) {
    return false;
  }

  return layers.some(
    (layer) =>
      layer.id === collectionId &&
      isVisible3dAnnotationAdhocLayer(layer)
  );
};

export const shouldShowAnnotationInfoBox = ({
  infoBoxState,
  isCesium,
  layers,
  uiMode,
}: {
  infoBoxState: RuntimeAnnotationInfoBoxSlotsState | null;
  isCesium: boolean;
  layers: readonly (BackgroundLayer | Layer)[];
  uiMode: UIMode;
}): boolean => {
  if (!isCesium || infoBoxState === null) {
    return false;
  }

  if (isExternalAnnotationInfoBoxState(infoBoxState)) {
    return isVisibleExternalAnnotationCollection(layers, infoBoxState);
  }

  return uiMode === UIMode.MEASUREMENT && hasCesiumAnnotationLayer(layers);
};
