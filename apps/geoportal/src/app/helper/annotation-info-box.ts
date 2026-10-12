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

export const GEOPORTAL_ANNOTATION_HELP_LOCALE = "de-DE";
export const EXTERNAL_ANNOTATION_INFO_BOX_HEADER_BACKGROUND_COLOR = "#3b82f6";
export const EXTERNAL_ANNOTATION_INFO_BOX_TITLE = "Informationen";

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

/** Saved (external) annotations show under the "Informationen" heading. */
export const resolveGeoportalInfoBoxState = (
  infoBoxState: RuntimeAnnotationInfoBoxSlotsState | null
): RuntimeAnnotationInfoBoxSlotsState | null => {
  if (!isExternalAnnotationInfoBoxState(infoBoxState)) {
    return infoBoxState;
  }

  return {
    ...infoBoxState,
    slots: {
      ...infoBoxState.slots,
      headingTitle: EXTERNAL_ANNOTATION_INFO_BOX_TITLE,
    },
  };
};

const isVisibleExternalAnnotationCollection = (
  layers: readonly (BackgroundLayer | Layer)[],
  infoBoxState: RuntimeAnnotationInfoBoxSlotsState
): boolean => {
  if (
    infoBoxState.kind !==
    RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION
  ) {
    return false;
  }

  const collectionId = infoBoxState.annotation.externalCollection?.id;
  if (collectionId === undefined) {
    return false;
  }

  return layers.some(
    (layer) =>
      layer.id === collectionId && isVisible3dAnnotationAdhocLayer(layer)
  );
};

export const shouldShowAnnotationInfoBox = ({
  infoBoxState,
  is3dAnnotationHost,
  layers,
  uiMode,
}: {
  infoBoxState: RuntimeAnnotationInfoBoxSlotsState | null;
  is3dAnnotationHost: boolean;
  layers: readonly (BackgroundLayer | Layer)[];
  uiMode: UIMode;
}): boolean => {
  if (!is3dAnnotationHost || infoBoxState === null) {
    return false;
  }

  if (isExternalAnnotationInfoBoxState(infoBoxState)) {
    return isVisibleExternalAnnotationCollection(layers, infoBoxState);
  }

  return uiMode === UIMode.MEASUREMENT && hasCesiumAnnotationLayer(layers);
};
