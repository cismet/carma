import polylabel from "@mapbox/polylabel";
import proj4 from "proj4";
import turfBBox from "@turf/bbox";
import booleanIntersects from "@turf/boolean-intersects";
import Flatbush from "flatbush";
import bbox from "@turf/bbox";
import L from "leaflet";
import { proj4crs25832def } from "./constants";
export function getPolygonfromBBox(bbox) {
  return (
    "POLYGON((" +
    bbox.left +
    " " +
    bbox.top +
    "," +
    bbox.right +
    " " +
    bbox.top +
    "," +
    bbox.right +
    " " +
    bbox.bottom +
    "," +
    bbox.left +
    " " +
    bbox.bottom +
    "," +
    bbox.left +
    " " +
    bbox.top +
    "))"
  );
}

export function getLabelPosition(feature) {
  if (feature.geometry.type === "Polygon") {
    return getLabelPositionForPolygon(feature.geometry.coordinates);
  }
  if (feature.geometry.type === "MultiPolygon") {
    if (feature.geometry.coordinates.length === 1) {
      return getLabelPositionForPolygon(feature.geometry.coordinates[0]);
    } else {
      return getLabelPositionForPolygon(feature.geometry.coordinates[0]);
    }
  }
}

function getLabelPositionForPolygon(coordinates) {
  return polylabel(coordinates);
}

export function convertBBox2Bounds(bbox, refDef = proj4crs25832def) {
  // @ts-expect-error
  const projectedNE = proj4(refDef, proj4.defs("EPSG:4326"), [
    bbox[0],
    bbox[1],
  ]);
  // @ts-expect-error
  const projectedSW = proj4(refDef, proj4.defs("EPSG:4326"), [
    bbox[2],
    bbox[3],
  ]);
  return [
    [projectedNE[1], projectedSW[0]],
    [projectedSW[1], projectedNE[0]],
  ];
}

export function convertPoint(x, y, refDef = proj4crs25832def) {
  let xval;
  let yval;
  if (typeof x === "string") {
    xval = parseFloat(x);
  }
  if (typeof y === "string") {
    yval = parseFloat(y);
  }
  // @ts-expect-error
  const projectedPoint = proj4(proj4.defs("EPSG:4326"), refDef, [yval, xval]);
  return projectedPoint;
}

export function getNamedlayers() {}

export const getBoundsFromArea = (area) => {
  const bboxArray = turfBBox(area);
  const corner1 = [bboxArray[1], bboxArray[0]];
  const corner2 = [bboxArray[3], bboxArray[2]];
  var bounds = [corner1, corner2];

  return bounds;
};

export function getBoundingBoxForLeafletMap(
  leafletMap,
  referenceSystemDefinition
) {
  const bounds = leafletMap.leafletElement.getBounds();
  const projectedNE = proj4(
    // @ts-expect-error
    proj4.defs("EPSG:4326"),
    referenceSystemDefinition,
    [bounds._northEast.lng, bounds._northEast.lat]
  );
  const projectedSW = proj4(
    // @ts-expect-error
    proj4.defs("EPSG:4326"),
    referenceSystemDefinition,
    [bounds._southWest.lng, bounds._southWest.lat]
  );
  return {
    left: projectedSW[0],
    top: projectedNE[1],
    right: projectedNE[0],
    bottom: projectedSW[1],
  };
}

export const getBoundsForFeatureCollection = (featureCollection) => {
  // Get bbox in EPSG:3857 from Turf.js
  const boundingBox3857 = bbox(featureCollection);
  console.log("xxx boundingBox3857", boundingBox3857);

  // Convert the bounding box from EPSG:3857 to EPSG:4326
  const southWest4326 = proj4("EPSG:3857", "EPSG:4326", [
    boundingBox3857[0],
    boundingBox3857[1],
  ]);
  const northEast4326 = proj4("EPSG:3857", "EPSG:4326", [
    boundingBox3857[2],
    boundingBox3857[3],
  ]);

  // Return Leaflet LatLngBounds
  return L.latLngBounds(
    L.latLng(southWest4326[1], southWest4326[0]), // southwest corner
    L.latLng(northEast4326[1], northEast4326[0]) // northeast corner
  );
};

export const findInFlatbush = (
  flatbush,
  search,
  all,
  additionalRestriction = (hit) => true
) => {
  const geomBounds = getBoundsFromArea(search);
  const hits = flatbush.search(
    geomBounds[0][1],
    geomBounds[0][0],
    geomBounds[1][1],
    geomBounds[1][0]
  );
  const realHits = [];

  // console.log("xxx probably " + hits.length);

  if (hits != null) {
    for (const hit of hits) {
      if (all[hit]?.geometry) {
        if (
          additionalRestriction(all[hit]) &&
          booleanIntersects(all[hit].geometry, search)
        ) {
          realHits.push(all[hit]);
        }
      }
    }
  }
  // console.log("xxx real " + realHits.length);

  return realHits;
};

export const createFlatbushIndex = (polygons) => {
  if (polygons && polygons.length > 0) {
    const polyIndex = new Flatbush(polygons.length);
    for (const polyF of polygons) {
      const bounds = getBoundsFromArea(polyF.geometry);
      polyIndex.add(bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]);
    }

    polyIndex.finish();

    return polyIndex;
  }
};
