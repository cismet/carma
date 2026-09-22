/**
 * The MapLibre map instance of the currently mounted lagis Map component.
 *
 * Kept outside of Redux on purpose: the instance is not serializable and the
 * store runs with the default serializableCheck enabled. Reducers and plain
 * components that need to drive the camera (fitBounds on an already selected
 * feature, double click on a table row) read it from here.
 */
let libreMapInstance = null;

export const setLibreMapInstance = (map) => {
  libreMapInstance = map;
};

export const getLibreMapInstance = () => libreMapInstance;
