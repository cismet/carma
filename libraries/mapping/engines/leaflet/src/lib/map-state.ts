import { isZoom } from "@carma-commons/utils";
import * as L from "leaflet";
import { Zoom256 } from "@carma/types";
import {
  isLeafletLatLng,
  isLeafletMap,
  isLeafletLatLngBounds,
} from "./type-guards";

const validateView = (center: L.LatLng, zoom: Zoom256) => {
  if (!isLeafletLatLng(center)) {
    console.warn("No center available for view");
    return false;
  }
  if (!zoom || !isZoom(zoom)) {
    console.warn("No zoom available for view");
    return false;
  }
  return true;
};

export const gatedLeafletFitBounds = (
  map: L.Map,
  cause: string = "not specified",
  bounds: L.LatLngBounds,
  options?: L.FitBoundsOptions
) => {
  if (!isLeafletMap(map)) {
    console.warn("No map available for fitBounds", cause);
    return;
  }

  if (!isLeafletLatLngBounds(bounds)) {
    console.warn("Invalid view for fitBounds", cause, bounds);
    return;
  }

  console.debug("[LEAFLET] fitBounds", cause, bounds, options);
  map.fitBounds(bounds, options);
};

export const gatedLeafletFlyTo = (
  map: L.Map,
  cause: string = "not specified",
  center: L.LatLng, // only allow LatLng object
  zoom: Zoom256,
  options?: L.ZoomPanOptions
) => {
  if (!isLeafletMap(map)) {
    console.warn("No map available for flyTo", cause);
    return;
  }

  if (!validateView(center, zoom)) {
    console.warn("Invalid view for flyTo", cause, zoom, center);
    return;
  }

  console.debug("[LEAFLET] flyTo", cause, zoom, center, options);
  map.flyTo(center, zoom, options);
};

export const gatedLeafletSetView = (
  map: L.Map,
  cause: string = "not specified",
  center: L.LatLng, // only allow LatLng object
  zoom: Zoom256,
  options?: L.ZoomPanOptions
) => {
  if (!isLeafletMap(map)) {
    console.warn("No map available for setView", cause);
    return;
  }

  if (!validateView(center, zoom)) {
    console.warn("Invalid view for setView", cause, zoom, center);
    return;
  }

  console.debug("[LEAFLET] setView", cause, zoom, center, options);
  map.setView(center, zoom, options);
};

export const gatedLeafletSetZoom = (
  map: L.Map,
  cause: string = "not specified",
  zoom: Zoom256,
  options?: L.ZoomPanOptions
) => {
  if (!isLeafletMap(map)) {
    console.warn("No map available for setZoom", cause);
    return;
  }
  if (!isZoom(zoom)) {
    console.warn("Invalid zoom for setZoom", cause, zoom);
    return;
  }
  console.debug("[LEAFLET] setZoom", cause, zoom, options);
  map.setZoom(zoom, options);
};
