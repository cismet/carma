import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import { layerUsesRuntimeAnnotationVisibility } from "../../helper/annotation-info-box";

export type LayerVisibilityToggleProps = {
  onToggleVisibility?: (visible: boolean) => void;
  visibilityToggleDisabled?: boolean;
};

export type ChangeLayerVisibility = (layerId: string, visible: boolean) => void;

const createRuntimeAnnotationVisibilityHandler =
  (onChangeLayerVisibility: ChangeLayerVisibility, layerId: string) =>
  (visible: boolean) =>
    onChangeLayerVisibility(layerId, visible);

export const getLayerVisibilityToggleProps = ({
  isCesium,
  layer,
  onChangeLayerVisibility,
}: {
  isCesium: boolean;
  layer?: BackgroundLayer | Layer;
  onChangeLayerVisibility: ChangeLayerVisibility;
}): LayerVisibilityToggleProps => {
  if (!isCesium) {
    return {};
  }
  if (!layer || !layerUsesRuntimeAnnotationVisibility(layer)) {
    return { visibilityToggleDisabled: true };
  }
  return {
    onToggleVisibility: createRuntimeAnnotationVisibilityHandler(
      onChangeLayerVisibility,
      layer.id
    ),
    visibilityToggleDisabled: false,
  };
};
