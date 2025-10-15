import { LatLng } from "leaflet";

import {
  Altitude,
  Latitude,
  Longitude,
  LngLatArrayTyped,
} from "@carma/geo/types";

export function latLngToTypedLngLatArr(
  latLng: LatLng
):
  | LngLatArrayTyped<Longitude.deg, Latitude.deg>
  | LngLatArrayTyped<Longitude.deg, Latitude.deg, [Altitude.GenericMeters]> {
  const base: [Longitude.deg, Latitude.deg] = [
    latLng.lng as Longitude.deg,
    latLng.lat as Latitude.deg,
  ];

  if (latLng.alt !== undefined) {
    return [...base, latLng.alt as Altitude.GenericMeters];
  }

  return base;
}

export function typedLngLatToLatLng(
  lngLat:
    | LngLatArrayTyped<Longitude.deg, Latitude.deg>
    | LngLatArrayTyped<Longitude.deg, Latitude.deg, [Altitude.GenericMeters]>
): LatLng {
  return new LatLng(lngLat[1], lngLat[0], lngLat[2]);
}
