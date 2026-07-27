import { isLayerGroup } from "@carma-mapping/layers";
import type {
  BackgroundLayer,
  Layer,
  LayerStackEntry,
} from "@carma-mapping/layers";
import type { FeatureInfo } from "@carma-mapping/utils";

import { layerUsesRuntimeAnnotationVisibility } from "../../helper/annotation-info-box";

export type LayerVisibilityToggleProps = {
  onToggleVisibility?: (visible: boolean) => void;
  visibilityToggleDisabled?: boolean;
  visibilityToggleLabels: LayerVisibilityToggleLabels;
};

export type LayerVisibilityToggleLabels = {
  disabled: string;
  hide: string;
  show: string;
};

export type ChangeLayerVisibility = (layerId: string, visible: boolean) => void;

export const DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS: LayerVisibilityToggleLabels =
  {
    disabled: "Sichtbarkeit hier nicht umschaltbar",
    hide: "Layer ausblenden",
    show: "Layer einblenden",
  };

const getFeatureStringProperty = (
  selectedFeature: FeatureInfo | null | undefined,
  propertyName: string
): string | undefined => {
  const value = (selectedFeature?.properties as Record<string, unknown>)?.[
    propertyName
  ];

  return typeof value === "string" ? value : undefined;
};

export const selectedFeatureBelongsToLayer = (
  selectedFeature: FeatureInfo | null | undefined,
  layerId: string
): boolean =>
  selectedFeature?.id === layerId ||
  getFeatureStringProperty(selectedFeature, "collectionId") === layerId ||
  getFeatureStringProperty(selectedFeature, "layerId") === layerId;

const createRuntimeAnnotationVisibilityHandler =
  (onChangeLayerVisibility: ChangeLayerVisibility, layerId: string) =>
  (visible: boolean) =>
    onChangeLayerVisibility(layerId, visible);

export const layerSupportsCesiumVisibilityToggle = (
  layer: BackgroundLayer | LayerStackEntry
): boolean =>
  // a group can be toggled in 3D as soon as one of its members can
  isLayerGroup(layer)
    ? layer.layers.some(layerSupportsCesiumVisibilityToggle)
    : layerUsesRuntimeAnnotationVisibility(layer) || layer.type === "object";

export const getLayerVisibilityToggleProps = ({
  isCesium,
  labels = DEFAULT_LAYER_VISIBILITY_TOGGLE_LABELS,
  layer,
  onChangeLayerVisibility,
}: {
  isCesium: boolean;
  labels?: LayerVisibilityToggleLabels;
  layer?: BackgroundLayer | LayerStackEntry;
  onChangeLayerVisibility: ChangeLayerVisibility;
}): LayerVisibilityToggleProps => {
  if (!isCesium) {
    return {
      visibilityToggleLabels: labels,
    };
  }
  if (!layer || !layerSupportsCesiumVisibilityToggle(layer)) {
    return {
      visibilityToggleDisabled: true,
      visibilityToggleLabels: labels,
    };
  }
  return {
    onToggleVisibility: createRuntimeAnnotationVisibilityHandler(
      onChangeLayerVisibility,
      layer.id
    ),
    visibilityToggleDisabled: false,
    visibilityToggleLabels: labels,
  };
};
