import type { FeatureInfo } from "@carma-mapping/utils";

export type LayerVisibilityToggleProps = {
  onToggleVisibility?: (visible: boolean) => void;
  visibilityToggleDisabled?: boolean;
  visibilityToggleLabels?: LayerVisibilityToggleLabels;
};

export type LayerVisibilityToggleLabels = {
  disabled: string;
  hide: string;
  show: string;
};

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
