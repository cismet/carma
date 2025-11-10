import { LatLng as LeafletLatLng } from "leaflet";
import type { Degrees } from "@carma/units/types";

export type LatLngJson = {
  latitude: Degrees;
  longitude: Degrees;
};

/**
 * Convert Leaflet LatLng to CARMA LatLng.deg
 */
export const leafletLatLngToLatLngJson = (
  latLng: LeafletLatLng
): LatLngJson => {
  return {
    latitude: latLng.lat as Degrees,
    longitude: latLng.lng as Degrees,
  };
};

/**
 * Convert CARMA LatLng.deg to Leaflet LatLng tuple
 */
export const latLngUnitsTypedToLatLngJson = (
  latLng: LatLngJson
): LeafletLatLng => {
  return new LeafletLatLng(latLng.latitude, latLng.longitude);
};
