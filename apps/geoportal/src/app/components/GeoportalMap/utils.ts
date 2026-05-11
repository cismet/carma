import type {
  FullScreenDocument,
  FullScreenHTMLElement,
  Layer,
} from "@carma-mapping/layers";

import { GEOPORTAL_LEAFLET_MAP_OPTIONS } from "../../config/app.config";

type LayerZoomSource = Pick<Layer, "props"> | undefined;

export const getLayerMinZoom = (layer: LayerZoomSource) =>
  Math.max(
    layer?.props?.minZoom ?? GEOPORTAL_LEAFLET_MAP_OPTIONS.zoomMin,
    GEOPORTAL_LEAFLET_MAP_OPTIONS.zoomMin
  );

export const getLayerMaxZoom = (layer: LayerZoomSource) =>
  Math.min(
    layer?.props?.maxZoom ?? GEOPORTAL_LEAFLET_MAP_OPTIONS.zoomMax,
    GEOPORTAL_LEAFLET_MAP_OPTIONS.zoomMax
  );

export const getUrlPrefix = () =>
  window.location.origin + window.location.pathname;

export const getQueryableLayers = (layers: Layer[], zoom: number) => {
  return layers.filter(
    (layer) =>
      (layer.queryable ||
        layer.layerInfo?.accentColor ||
        layer.layerInfo?.header) &&
      layer.visible &&
      layer.useInFeatureInfo &&
      zoom < getLayerMaxZoom(layer) &&
      zoom > getLayerMinZoom(layer)
  );
};

export const getAtLeastOneLayerIsQueryable = (
  layers: Layer[],
  zoom: number
): boolean => {
  return getQueryableLayers(layers, zoom).length > 0;
};

export const exitFullscreen = (doc: FullScreenDocument) => {
  switch (true) {
    case !!doc.exitFullscreen:
      return doc.exitFullscreen();
    case !!doc.webkitExitFullscreen:
      return doc.webkitExitFullscreen();
    case !!doc.mozCancelFullScreen:
      return doc.mozCancelFullScreen();
    case !!doc.msExitFullscreen:
      return doc.msExitFullscreen();
  }
};

export const requestFullscreen = (element: FullScreenHTMLElement) => {
  switch (true) {
    case !!element.requestFullscreen:
      return element.requestFullscreen();
    case !!element.webkitRequestFullscreen:
      return element.webkitRequestFullscreen();
    case !!element.mozRequestFullScreen:
      return element.mozRequestFullScreen();
    case !!element.msRequestFullscreen:
      return element.msRequestFullscreen();
  }
};

export const isFullscreen = (doc: FullScreenDocument) =>
  doc.fullscreenElement ||
  doc.webkitFullscreenElement ||
  doc.mozFullScreenElement ||
  doc.msFullscreenElement;
