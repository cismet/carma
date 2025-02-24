import bbox from "@turf/bbox";
import bboxPolygon from "@turf/bbox-polygon";
import proj4 from "proj4";
import L from "leaflet";

export const getBoundsForFeatureArray = (featureArray) => {
  // Convert your featureArray into a FeatureCollection
  const featureCollection = {
    type: "FeatureCollection",
    features: featureArray,
  };
  return getBoundsForFeatureCollection(featureCollection);
};

export const getBoundsForFeatureCollection = (featureCollection) => {
  // Get bbox in EPSG:3857 from Turf.js
  const boundingBox3857 = bbox(featureCollection);

  // Convert the bounding box from EPSG:3857 to EPSG:4326
  const southWest4326 = proj4("EPSG:25832", "EPSG:4326", [
    boundingBox3857[0],
    boundingBox3857[1],
  ]);
  const northEast4326 = proj4("EPSG:25832", "EPSG:4326", [
    boundingBox3857[2],
    boundingBox3857[3],
  ]);

  // Return Leaflet LatLngBounds
  return L.latLngBounds(
    L.latLng(southWest4326[1], southWest4326[0]), // southwest corner
    L.latLng(northEast4326[1], northEast4326[0]) // northeast corner
  );
};

export const convertLatLngToXY = (latlng) => {
  const xy = proj4("EPSG:4326", "EPSG:25832", [latlng.lng, latlng.lat]);
  return xy;
};
