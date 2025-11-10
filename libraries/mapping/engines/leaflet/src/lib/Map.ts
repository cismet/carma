// prevent namespace collisions with other mapping libraries and JavaScript built-in Map type
import { Map as LeafletMap, LatLng } from "leaflet";

export { LeafletMap };

export type LeafletView = {
  center: LatLng;
  zoom: number;
};

export const isLeafletMap = (map: unknown): map is LeafletMap => {
  return map instanceof LeafletMap;
};

export const getLeafletView = (leaflet: LeafletMap): LeafletView => {
  const center = leaflet.getCenter();
  const zoom = leaflet.getZoom();

  return {
    center,
    zoom,
  };
};

export const setLeafletView = (leaflet: LeafletMap, view: LeafletView) => {
  leaflet.setView(view.center, view.zoom);
};
