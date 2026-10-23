/**
 * The mounted map instance, for reducers and components that drive the camera.
 * Not in Redux: the instance is not serializable.
 */
let libreMapInstance = null;

export const setLibreMapInstance = (map) => {
  libreMapInstance = map;
};

export const getLibreMapInstance = () => libreMapInstance;
