import type {
  LatLng,
  LngLatArray,
  Longitude,
  Latitude,
} from "@carma/geo/types";
import { degToRad, radToDeg } from "@carma-commons/units/helpers";

export function latLngToLngLatArray(latLng: LatLng.deg): LngLatArray.deg;
export function latLngToLngLatArray(latLng: LatLng.rad): LngLatArray.rad;
export function latLngToLngLatArray(latLng: any): any {
  return [latLng.longitude, latLng.latitude];
}

export function lngLatArrayToLatLng(arr: LngLatArray.deg): LatLng.deg;
export function lngLatArrayToLatLng(arr: LngLatArray.rad): LatLng.rad;
export function lngLatArrayToLatLng(arr: any): any {
  return {
    longitude: arr[0],
    latitude: arr[1],
  };
}

export function latLngDegToRad(deg: LatLng.deg): LatLng.rad {
  return {
    longitude: degToRad(deg.longitude as Longitude.deg),
    latitude: degToRad(deg.latitude as Latitude.deg),
  } as LatLng.rad;
}

export function latLngRadToDeg(rad: LatLng.rad): LatLng.deg {
  return {
    longitude: radToDeg(rad.longitude as Longitude.rad),
    latitude: radToDeg(rad.latitude as Latitude.rad),
  } as LatLng.deg;
}

export function lngLatArrayDegToRad(deg: LngLatArray.deg): LngLatArray.rad {
  const [lng, lat, ...rest] = deg;
  return [
    degToRad(lng as Longitude.deg),
    degToRad(lat as Latitude.deg),
    ...rest,
  ] as LngLatArray.rad;
}

export function lngLatArrayRadToDeg(rad: LngLatArray.rad): LngLatArray.deg {
  const [lng, lat, ...rest] = rad;
  return [
    radToDeg(lng as Longitude.rad),
    radToDeg(lat as Latitude.rad),
    ...rest,
  ] as LngLatArray.deg;
}
