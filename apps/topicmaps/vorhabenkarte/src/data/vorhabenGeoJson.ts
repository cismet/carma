import { getFromUTM32ToWGS84 } from "@carma-geo/proj";
import { SOURCE_LAYER_PROPERTY } from "@carma-mapping/utils";

import { host } from "../constants/constants";

/** Source id inside https://tiles.cismet.de/vorhabenkarte/style.json */
export const VORHABEN_SOURCE_ID = "vorhabenkarte_source";
/** Source-layer names the style's layers reference on that source */
export const VORHABEN_GEOMS_LAYER = "vorhabenComplexGeoms";
export const VORHABEN_POINTS_LAYER = "vorhabenPoints";

export const VORHABEN_DATA_URL = host + "/data/vorhabenkarte.data.json";

/** Item shape of vorhabenkarte.data.json, reduced to what is used here */
export interface VorhabenItem {
  id: number;
  titel: string;
  beschreibung?: string;
  abgeschlossen?: boolean;
  buergerbeteiligung?: boolean;
  buga?: boolean;
  thema: {
    id: number;
    name: string;
    farbe: string;
    signatur: string;
    fuellung?: number;
  };
  kontakt?: { mail?: string; telefon?: string };
  fotos?: { url: string; anzeige?: string }[];
  /** EPSG:25832 */
  geojson: GeoJSON.Point | GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/**
 * Properties as the vector tiles carry them, so the style, its infoBoxMapping
 * and VorhabenkarteSIM see the same schema no matter where the data came from.
 * `fotos` is a JSON string because the infoBoxMapping JSON.parses it.
 */
export interface VorhabenFeatureProperties {
  [SOURCE_LAYER_PROPERTY]: string;
  fid: number;
  titel: string;
  beschreibung: string;
  abgeschlossen: boolean;
  buergerbeteiligung: boolean;
  buga: boolean;
  mail?: string;
  telefon?: string;
  thema_id: number;
  thema_name: string;
  thema_farbe: string;
  thema_signatur: string;
  thema_fuellung?: number;
  fotos: string;
}

type Position = GeoJSON.Position;

const reprojectPosition = (p: Position): Position =>
  getFromUTM32ToWGS84(p) as Position;

const reprojectGeometry = <G extends VorhabenItem["geojson"]>(geometry: G): G => {
  switch (geometry.type) {
    case "Point": {
      return { ...geometry, coordinates: reprojectPosition(geometry.coordinates) };
    }
    case "Polygon": {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((ring) =>
          ring.map(reprojectPosition)
        ),
      };
    }
    case "MultiPolygon": {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map(reprojectPosition))
        ),
      };
    }
  }
};

const toProperties = (
  item: VorhabenItem,
  sourceLayer: string
): VorhabenFeatureProperties => ({
  [SOURCE_LAYER_PROPERTY]: sourceLayer,
  fid: item.id,
  titel: item.titel,
  beschreibung: item.beschreibung ?? "",
  abgeschlossen: Boolean(item.abgeschlossen),
  buergerbeteiligung: Boolean(item.buergerbeteiligung),
  buga: Boolean(item.buga),
  mail: item.kontakt?.mail,
  telefon: item.kontakt?.telefon,
  thema_id: item.thema.id,
  thema_name: item.thema.name,
  thema_farbe: item.thema.farbe,
  thema_signatur: item.thema.signatur.replace(/\.svg$/i, ""),
  thema_fuellung: item.thema.fuellung,
  fotos: JSON.stringify(item.fotos ?? []),
});

/**
 * PostGIS ST_PointOnSurface for a polygon (JTS InteriorPointArea): a
 * horizontal scan line at the midpoint between the vertex y-values closest
 * above and below the envelope centre, and on it the midpoint of the widest
 * stretch inside the polygon. Reproduces the tile build's points exactly, so
 * the icons sit where the geoportal shows them; turf's pointOnFeature did not.
 */
const pointOnSurface = (rings: Position[][]): Position => {
  const ys = rings.flat().map((p) => p[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centreY = (minY + maxY) / 2;
  let hiY = maxY;
  let loY = minY;
  for (const y of ys) {
    if (y > centreY && y < hiY) {
      hiY = y;
    }
    if (y < centreY && y > loY) {
      loY = y;
    }
  }
  const scanY = (hiY + loY) / 2;

  const crossings: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      if ((y1 <= scanY && scanY < y2) || (y2 <= scanY && scanY < y1)) {
        crossings.push(x1 + ((scanY - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
  }
  crossings.sort((a, b) => a - b);

  const xs = rings.flat().map((p) => p[0]);
  let best: Position = [(Math.min(...xs) + Math.max(...xs)) / 2, scanY];
  let bestWidth = -1;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const width = crossings[i + 1] - crossings[i];
    if (width > bestWidth) {
      bestWidth = width;
      best = [(crossings[i] + crossings[i + 1]) / 2, scanY];
    }
  }
  return best;
};

/**
 * One point per polygon part, like the tile build does; a point item is its
 * own point. Computed in EPSG:25832 (before reprojection), as the tile build
 * does, so the result matches to the metre.
 */
const pointsFor = (geometry: VorhabenItem["geojson"]): GeoJSON.Point[] => {
  if (geometry.type === "Point") {
    return [geometry];
  }
  const parts: Position[][][] =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return parts.map((rings) => ({
    type: "Point",
    coordinates: pointOnSurface(rings),
  }));
};

/**
 * Build the collection the vorhabenkarte style renders from, in EPSG:4326.
 * Polygons go to `vorhabenComplexGeoms`, points to `vorhabenPoints`, each
 * carrying the full property set.
 */
export const buildVorhabenGeoJson = (
  items: VorhabenItem[]
): GeoJSON.FeatureCollection<
  GeoJSON.Point | GeoJSON.Polygon | GeoJSON.MultiPolygon,
  VorhabenFeatureProperties
> => {
  const features: GeoJSON.Feature<
    GeoJSON.Point | GeoJSON.Polygon | GeoJSON.MultiPolygon,
    VorhabenFeatureProperties
  >[] = [];

  for (const item of items) {
    if (!item.geojson) {
      continue;
    }
    if (item.geojson.type !== "Point") {
      features.push({
        type: "Feature",
        id: item.id,
        geometry: reprojectGeometry(item.geojson),
        properties: toProperties(item, VORHABEN_GEOMS_LAYER),
      });
    }

    for (const point of pointsFor(item.geojson)) {
      features.push({
        type: "Feature",
        id: item.id,
        geometry: reprojectGeometry(point),
        properties: toProperties(item, VORHABEN_POINTS_LAYER),
      });
    }
  }

  return { type: "FeatureCollection", features };
};

export const fetchVorhabenGeoJson = async () => {
  const response = await fetch(VORHABEN_DATA_URL);
  if (!response.ok) {
    throw new Error(
      `[VORHABEN DATA] ${VORHABEN_DATA_URL} answered ${response.status}`
    );
  }
  const items = (await response.json()) as VorhabenItem[];
  return buildVorhabenGeoJson(items);
};
