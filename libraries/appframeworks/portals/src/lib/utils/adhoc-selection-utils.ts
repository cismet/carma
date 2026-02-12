import { DEFAULT_ADHOC_FEATURE_LAYER_ID } from "../constants/adhoc";

export type AdhocCollectionLike<TFeature extends { id: string }> = {
  id: string;
  features: TFeature[];
};

export type AdhocSelectionTarget<
  TFeature extends { id: string; layerId?: string }
> = TFeature & {
  collectionId: string;
  layerId: string;
};

export const resolveAdhocFeatureLayerId = (
  feature: { layerId?: string },
  fallbackLayerId: string = DEFAULT_ADHOC_FEATURE_LAYER_ID
): string => feature.layerId ?? fallbackLayerId;

export const pickPreferredAdhocFeature = <
  TFeature extends { id: string; kind?: string; layerId?: string }
>(
  collection: AdhocCollectionLike<TFeature> | undefined,
  preferredLayerId: string = DEFAULT_ADHOC_FEATURE_LAYER_ID
): TFeature | null => {
  if (!collection) {
    return null;
  }

  const featuresInPreferredLayer = collection.features.filter(
    (feature) => resolveAdhocFeatureLayerId(feature) === preferredLayerId
  );
  const sourceFeatures =
    featuresInPreferredLayer.length > 0
      ? featuresInPreferredLayer
      : collection.features;

  return (
    sourceFeatures.find((feature) => feature.kind === "maplibre-style") ??
    sourceFeatures[0] ??
    null
  );
};

export const resolveAdhocSelectionTargetByCollectionId = <
  TFeature extends { id: string; kind?: string; layerId?: string }
>(
  collections: AdhocCollectionLike<TFeature>[],
  collectionId: string,
  preferredLayerId: string = DEFAULT_ADHOC_FEATURE_LAYER_ID
): AdhocSelectionTarget<TFeature> | null => {
  const collection = collections.find(
    (candidate) => candidate.id === collectionId
  );
  const feature = pickPreferredAdhocFeature(collection, preferredLayerId);
  if (!feature) {
    return null;
  }
  return {
    ...feature,
    collectionId: collection.id,
    layerId: resolveAdhocFeatureLayerId(feature, preferredLayerId),
  };
};
