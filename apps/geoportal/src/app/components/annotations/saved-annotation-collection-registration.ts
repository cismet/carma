import {
  ADHOC_LAYER_SOURCES,
  type AdhocFeatureCollection,
} from "@carma-appframeworks/portals";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import { isVisible3dAnnotationAdhocLayer } from "../../helper/adhoc-feature-utils";

type LayerWithVisibility = BackgroundLayer | Layer;

const hasRuntimeAnnotationFeature = (
  collection: AdhocFeatureCollection
): boolean =>
  collection.features.some(
    (feature) =>
      (feature.data as { source?: unknown }).source ===
      ADHOC_LAYER_SOURCES.ANNOTATIONS
  );

export const isVisibleSavedAnnotationLayer = (
  layer: LayerWithVisibility
): boolean => isVisible3dAnnotationAdhocLayer(layer);

export const resolveVisibleSavedAnnotationCollectionIds = (
  layers: readonly LayerWithVisibility[]
): ReadonlySet<string> =>
  new Set(
    layers.filter(isVisibleSavedAnnotationLayer).map((layer) => layer.id)
  );

export const shouldRegisterSavedAnnotationCollection = ({
  collection,
  visibleCollectionIds,
}: {
  collection: AdhocFeatureCollection;
  visibleCollectionIds: ReadonlySet<string>;
}): boolean =>
  visibleCollectionIds.has(collection.id) &&
  hasRuntimeAnnotationFeature(collection);

export const resolveActiveSavedAnnotationCollectionIds = ({
  featureCollections,
  layers,
}: {
  featureCollections: readonly AdhocFeatureCollection[];
  layers: readonly LayerWithVisibility[];
}): ReadonlySet<string> => {
  const visibleCollectionIds =
    resolveVisibleSavedAnnotationCollectionIds(layers);

  return new Set(
    featureCollections
      .filter((collection) =>
        shouldRegisterSavedAnnotationCollection({
          collection,
          visibleCollectionIds,
        })
      )
      .map((collection) => collection.id)
  );
};

export const hasVisibleSavedAnnotationCollections = (
  layers: readonly LayerWithVisibility[]
): boolean => layers.some(isVisibleSavedAnnotationLayer);
