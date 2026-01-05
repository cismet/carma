// prevent namespace collisions with other mapping libraries and JavaScript built-in Map type
import L from "leaflet";

export const LeafletMap = L.Map;
export type LeafletMap = L.Map;

export type LeafletView = {
  center: L.LatLng;
  zoom: number;
};

export const isLeafletMap = (map: unknown): map is LeafletMap => {
  return map instanceof L.Map;
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
