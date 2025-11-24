import L from "leaflet";
import type { Degrees } from "@carma/units/types";

export const LatLng = L.LatLng;
export type LatLng = L.LatLng;

export const latLng = L.latLng;

export type LatLngJson = {
  latitude: Degrees;
  longitude: Degrees;
};

/**
 * Convert Leaflet LatLng to CARMA LatLng.deg
 */
export const leafletLatLngToLatLngJson = (latLng: LatLng): LatLngJson => {
  return {
    latitude: latLng.lat as Degrees,
    longitude: latLng.lng as Degrees,
  };
};

/**
 * Convert CARMA LatLng.deg to Leaflet LatLng tuple
 */
export const latLngUnitsTypedToLatLngJson = (latLng: LatLngJson): LatLng => {
  return new LatLng(latLng.latitude, latLng.longitude);
};
