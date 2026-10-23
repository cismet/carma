/**
 * The mounted map instance, for reducers and components that drive the camera.
 * Not in Redux: the instance is not serializable.
 */
let libreMapInstance = null;
let lastView = null;

const rememberView = () => {
  lastView = {
    center: libreMapInstance.getCenter(),
    zoom: libreMapInstance.getZoom(),
    bearing: libreMapInstance.getBearing(),
    pitch: libreMapInstance.getPitch(),
  };
};

export const setLibreMapInstance = (map) => {
  libreMapInstance?.off("moveend", rememberView);
  libreMapInstance = map;
  if (map) {
    map.on("moveend", rememberView);
    rememberView();
  }
};

export const getLastLibreMapView = () => lastView;

export const getLibreMapInstance = () => libreMapInstance;
