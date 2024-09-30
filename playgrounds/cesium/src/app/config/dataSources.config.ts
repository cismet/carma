import { APP_BASE_PATH } from "./app.config";
const GEOJSON_BASE_PATH = `${APP_BASE_PATH}data/geojson/`;

export const DEFAULT_ID_PROPERTY = "UUID";

// GEOSJSON SOURCES

export const FOOTPRINT_GEOJSON_SOURCES = {
  VORONOI: {
    url: `${GEOJSON_BASE_PATH}buildings_voronoi_buffered_2m.json`,
    name: "Voronoi 2m",
    idProperty: "UUID",
  },
  BUILDINGS: {
    url: `${GEOJSON_BASE_PATH}buildings.json`,
    name: "Buildings",
    idProperty: "UUID",
  },
  BUFFERED: {
    url: `${GEOJSON_BASE_PATH}buildings_buffered_1m.json`,
    name: "Buffered 1m",
    idProperty: "UUID",
  },
};
