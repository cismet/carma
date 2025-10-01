import * as L from "leaflet";

export const isLeafletMap = (value: unknown): value is L.Map => {
  return value instanceof L.Map;
};

export const isLeafletLatLng = (value: unknown): value is L.LatLng => {
  return value instanceof L.LatLng;
};

export const isLeafletLatLngBounds = (
  value: unknown
): value is L.LatLngBounds => {
  return value instanceof L.LatLngBounds;
};
