import type { Layer } from "@carma-mapping/layers";

export const getUrlPrefix = () =>
  window.location.origin + window.location.pathname;

export const getQueryableLayers = (layers: Layer[], zoom: number) => {
  return layers.filter(
    (layer) =>
      layer.queryable &&
      layer.visible &&
      layer.useInFeatureInfo &&
      zoom < (layer.props.maxZoom ? layer.props.maxZoom : Infinity) &&
      zoom > layer.props.minZoom,
  );
};

export const getAtLeastOneLayerIsQueryable = (
  layers: Layer[],
  zoom: number,
): boolean => {
  return getQueryableLayers(layers, zoom).length > 0;
};
