import type { AdhocFeatureCollection } from "@carma-appframeworks/portals";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";

import { layerHasRuntimeAnnotationsGeoJson } from "../../helper/annotation-info-box";

type LayerWithVisibility = Pick<BackgroundLayer | Layer, "id" | "visible">;

const hasRuntimeAnnotationFeature = (
  collection: AdhocFeatureCollection
): boolean =>
  collection.features.some(
    (feature) => feature.metadata?.renderAsRuntimeAnnotations === true
  );

export const isVisibleSavedAnnotationLayer = (
  layer: LayerWithVisibility
): boolean =>
  layer.visible !== false && layerHasRuntimeAnnotationsGeoJson(layer);

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
