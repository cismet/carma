import bboxPolygon from "@turf/bbox-polygon";
import proj4 from "proj4";
import { MappingConstants } from "react-cismap";
import { proj4crs3857def } from "react-cismap/constants/gis";

export const convertBounds2BBox = (bounds, refDef = proj4crs3857def) => {
  const projectedNE = proj4(proj4.defs("EPSG:4326"), refDef, [
    bounds._northEast.lng,
    bounds._northEast.lat,
  ]);
  const projectedSW = proj4(proj4.defs("EPSG:4326"), refDef, [
    bounds._southWest.lng,
    bounds._southWest.lat,
  ]);
  return {
    left: projectedSW[0],
    top: projectedNE[1],
    right: projectedNE[0],
    bottom: projectedSW[1],
  };
};
export const bufferBBox = (bbox, bufferinMeter) => {
  const bufferedBBox = [
    bbox[0] - bufferinMeter,
    bbox[1] - bufferinMeter,
    bbox[2] + bufferinMeter,
    bbox[3] + bufferinMeter,
  ];
  return bufferedBBox;
};
export function convertBoundingBox(
  bbox,
  refDefIn = MappingConstants.proj4crs3857def,
  refDefOut = MappingConstants.proj4crs25832def
) {
  if (bbox) {
    const [left, top] = proj4(refDefIn, refDefOut, [bbox.left, bbox.top]);
    const [right, bottom] = proj4(refDefIn, refDefOut, [bbox.right, bbox.bottom]);
    return { left, top, right, bottom };
  }
}

export const createQueryGeomFromBB = (boundingBox) => {
  const geom = bboxPolygon([
    boundingBox.left,
    boundingBox.top,
    boundingBox.right,
    boundingBox.bottom,
  ]).geometry;
  geom.crs = {
    type: "name",
    properties: {
      name: "urn:ogc:def:crs:EPSG::25832",
    },
  };
  return geom;
};
