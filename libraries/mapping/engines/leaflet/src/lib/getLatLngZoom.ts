import L from "leaflet";
import { Degrees, LatLngZoom, Zoom256 } from "@carma/types";
import { isLeafletMap } from "./type-guards";

export const getLatLngZoom = (map: L.Map): LatLngZoom | undefined => {
  if (!isLeafletMap(map)) {
    return;
  }
  const center = map.getCenter();
  const zoom = map.getZoom() as Zoom256;
  return {
    latitude: center.lat as Degrees,
    longitude: center.lng as Degrees,
    zoom,
  };
};
