import type {
  FullScreenDocument,
  FullScreenHTMLElement,
  Layer,
} from "@carma-commons/types";

export const getUrlPrefix = () =>
  window.location.origin + window.location.pathname;

export const getQueryableLayers = (layers: Layer[], zoom: number) => {
  return layers.filter(
    (layer) =>
      layer.queryable &&
      layer.visible &&
      layer.useInFeatureInfo &&
      zoom < (layer.props.maxZoom ? layer.props.maxZoom : Infinity) &&
      zoom > (layer.props.minZoom ? layer.props.minZoom : 0)
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
