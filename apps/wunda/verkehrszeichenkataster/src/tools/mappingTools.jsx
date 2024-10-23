import getArea from "@turf/area";
import bboxPolygon from "@turf/bbox-polygon";
import { reproject } from "reproject";
import proj4 from "proj4";
import { projectionData } from "react-cismap/constants/gis";
import { concat, flatten } from "lodash";

export const getArea25832 = (geoJSON) => {
  const wGS84GeoJSON = getWGS84GeoJSON(geoJSON);
  if (wGS84GeoJSON !== undefined) {
    return getArea(wGS84GeoJSON);
  }
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
    return undefined;
  }
};

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
  const reprojectedGeoJSON = reproject(
    {
      type: "Feature",
      geometry: geom,
      properties: {},
    },
    projectionData["3857"].def,
    projectionData["25832"].def
  );
  const updatedGeom = reprojectedGeoJSON.geometry;
  updatedGeom.crs = {
    type: "name",
    properties: {
      name: "urn:ogc:def:crs:EPSG::25832",
    },
  };

  return updatedGeom;
};

export const createFeatureArray = (data) => {
  const result = [];

  data.alkis_landparcel.forEach((landparcel, index) => {
    const feature = {
      type: "Feature",
      featureType: "flaeche",
      id: landparcel.id,
      hovered: false,
      weight: 0.5,
      geometry: {
        type: "Polygon",
        coordinates: [],
      },
      properties: {
        gemarkung: landparcel.gemarkung,
        flur: landparcel.flur,
        fstck_zaehler: landparcel.fstck_zaehler,
        fstck_nenner: landparcel.fstck_nenner,
      },
      crs: {
        type: "name",
        properties: {
          name: "urn:ogc:def:crs:EPSG::25832",
        },
      },
    };

    let coordinates = [];

    coordinates = concat(
      coordinates,
      flatten(landparcel.geom.geo_field.coordinates)
    );
    feature.geometry.coordinates = coordinates;
    result.push(feature);
  });

  return result;
};
