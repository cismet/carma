import type { Layer } from "@carma-mapping/layers";

export const getUrlPrefix = () => window.location.origin + window.location.pathname;

export const getQueryableLayers = (layers: Layer[]) => {
  return layers.filter(
    (layer) => layer.queryable === true && layer.useInFeatureInfo === true,
  );
};

export const getAtLeastOneLayerIsQueryable = (layers: Layer[]): boolean => {
  return getQueryableLayers(layers).length > 0;
};
