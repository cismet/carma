import bbox from "@turf/bbox";
import proj4 from "proj4";
import maplibregl from "maplibre-gl";
import ColorHash from "color-hash";
import getArea from "@turf/area";
import { reproject } from "reproject";
import getBuffer from "@turf/buffer";
export const projectionData = {
  25832: {
    def: "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs",
    geojson: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::25832",
      },
    },
  },
  4326: {
    def: "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs",
    geojson: {
      type: "name",
      properties: {
        name: "urn:ogc:def:crs:EPSG::4326",
      },
    },
  },
};

export const fitFeatureArray = (featureArray, map) => {
  const bounds = getBoundsForFeatureArray(featureArray);
  if (!bounds) {
    return;
  }

  //ugly winning to avoid some race condition
  setTimeout(() => {
    map?.fitBounds(bounds, { animate: false });
  }, 1000);
};

export const getBoundsForFeatureArray = (featureArray) => {
  // Convert your featureArray into a FeatureCollection
  const featureCollection = {
    type: "FeatureCollection",
    features: featureArray,
  };
  return getBoundsForFeatureCollection(featureCollection);
};

export const getBoundsForFeatureCollection = (featureCollection) => {
  if (!featureCollection?.features?.length) {
    return undefined;
  }

  // Get bbox in EPSG:25832 from Turf.js
  const boundingBox25832 = bbox(featureCollection);
  if (!boundingBox25832.every((value) => Number.isFinite(value))) {
    return undefined;
  }

  // Convert the bounding box from EPSG:25832 to EPSG:4326
  const southWest4326 = proj4("EPSG:25832", "EPSG:4326", [
    boundingBox25832[0],
    boundingBox25832[1],
  ]);
  const northEast4326 = proj4("EPSG:25832", "EPSG:4326", [
    boundingBox25832[2],
    boundingBox25832[3],
  ]);

  // lng/lat order, unlike Leaflet's lat/lng
  return new maplibregl.LngLatBounds(
    [southWest4326[0], southWest4326[1]], // southwest corner
    [northEast4326[0], northEast4326[1]] // northeast corner
  );
};

export function convertBBox2Bounds(bbox, refDef = proj4crs25832def) {
  const projectedNE = proj4(refDef, proj4.defs("EPSG:4326"), [
    bbox[0],
    bbox[1],
  ]);
  const projectedSW = proj4(refDef, proj4.defs("EPSG:4326"), [
    bbox[2],
    bbox[3],
  ]);
  return [
    [projectedNE[1], projectedSW[0]],
    [projectedSW[1], projectedNE[0]],
  ];
}
export const getCenterAndZoomForBounds = (map, bounds) => {
  // cameraForBounds == Leaflet's getBoundsZoom + getCenter
  const camera = map?.cameraForBounds(bounds);
  const center = camera?.center ?? bounds.getCenter();
  return { center, zoom: camera?.zoom };
};

export const getWGS84GeoJSON = (geoJSON) => {
  try {
    const reprojectedGeoJSON = reproject(
      geoJSON,
      projectionData["25832"].def,
      proj4.WGS84
    );

    return reprojectedGeoJSON;
  } catch (e) {
    console.log("excepotion reproject", e);
    return undefined;
  }
};

export const getArea25832 = (geoJSON) => {
  const wGS84GeoJSON = getWGS84GeoJSON(geoJSON);
  if (wGS84GeoJSON !== undefined) {
    return getArea(wGS84GeoJSON);
  }
};

export const get25832GeoJSON = (geoJSON) => {
  try {
    const reprojectedGeoJSON = reproject(
      geoJSON,
      proj4.WGS84,
      projectionData["25832"].def
    );

    return reprojectedGeoJSON;
  } catch (e) {
    console.log("exception reproject", e);
    return undefined;
  }
};

export const getBuffer25832 = (geoJSON, bufferInMeter) => {
  try {
    const wGS84GeoJSON = getWGS84GeoJSON(geoJSON);

    if (wGS84GeoJSON !== undefined) {
      const bufGeoJSON = getBuffer(wGS84GeoJSON, bufferInMeter / 1000.0, {
        unit: "kilometers",
      });

      let reprojectedGeoJSON = get25832GeoJSON(bufGeoJSON).geometry;
      reprojectedGeoJSON.crs = geoJSON.crs;
      return reprojectedGeoJSON;
    }

    return geoJSON;
  } catch (e) {
    console.log("exception reproject", e);
    return undefined;
  }
};

export const convertLatLngToXY = (latlng) => {
  const xy = proj4("EPSG:4326", "EPSG:25832", [latlng.lng, latlng.lat]);
  return xy;
};
