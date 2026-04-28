import { useCallback, type MouseEvent } from "react";
import { useDispatch } from "react-redux";

import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faEye, faEyeSlash, faX } from "@fortawesome/free-solid-svg-icons";

import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import { isAdhocVectorLayer } from "../helper/adhoc-feature-utils";
import type { AppDispatch } from "../store";
import { updateInfoElementsAfterRemovingFeature } from "../store/slices/features";
import { changeVisibility, removeLayer } from "../store/slices/mapping";

export type ResolveGeoportalLayerButtonCloseIconOptions = {
  showLayerHideButtons: boolean;
  visible: boolean;
};

export const resolveGeoportalLayerButtonCloseIcon = ({
  showLayerHideButtons,
  visible,
}: ResolveGeoportalLayerButtonCloseIconOptions): IconDefinition => {
  if (showLayerHideButtons) {
    return visible ? faEye : faEyeSlash;
  }

  return faX;
};

export const useGeoportalLayerButtonActions = ({
  id,
  layer,
  showLayerHideButtons,
}: {
  id: string;
  layer: Layer | BackgroundLayer;
  showLayerHideButtons: boolean;
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { clearFeatureCollections } = useAdhocFeatureDisplay();

  const handleLayerRemoveButtonClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();

      if (showLayerHideButtons) {
        dispatch(changeVisibility({ id, visible: !layer.visible }));
        return;
      }

      dispatch(removeLayer(id));
      if (isAdhocVectorLayer(layer)) {
        clearFeatureCollections([id]);
      }
      dispatch(updateInfoElementsAfterRemovingFeature(id));
    },
    [clearFeatureCollections, dispatch, id, layer, showLayerHideButtons]
  );

  return {
    closeIcon: resolveGeoportalLayerButtonCloseIcon({
      showLayerHideButtons,
      visible: layer.visible,
    }),
    handleLayerRemoveButtonClick,
  };
};
