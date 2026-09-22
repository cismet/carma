import { reproject } from "reproject";
import proj4 from "proj4";
import { projectionData } from "./mappingTools";

export const FEATURE_COLLECTION_SOURCE_ID = "lagis-feature-collection";
export const FEATURE_COLLECTION_FILL_LAYER_ID = "lagis-feature-collection-fill";
export const FEATURE_COLLECTION_LINE_LAYER_ID = "lagis-feature-collection-line";
export const FEATURE_COLLECTION_POINT_LAYER_ID =
  "lagis-feature-collection-point";

/** Index of the source feature inside data.featureCollection, so click and
 *  hover handlers can get back to the original (non GeoJSON) lagis object. */
export const FEATURE_INDEX_PROPERTY = "__lagisFeatureIndex";

const DEFAULT_STYLE = {
  color: "#005F6B",
  weight: 1,
  opacity: 0.6,
  fillColor: "#26ADE4",
  fillOpacity: 0.6,
};

const isWgs84 = (crs) => {
  const name = crs?.properties?.name;
  return typeof name === "string" && name.includes("4326");
};

/**
 * react-cismap reprojects a feature on the fly from the CRS named in the
 * feature itself. MapLibre only ever sees WGS84, so the same step has to
 * happen before the data reaches the source.
 */
const toWgs84Geometry = (feature) => {
  const geometry = feature?.geometry;
  if (!geometry) {
    return undefined;
  }
  if (isWgs84(feature.crs ?? geometry.crs)) {
    return geometry;
  }
  try {
    return reproject(geometry, projectionData["25832"].def, proj4.WGS84);
  } catch (e) {
    console.warn("could not reproject lagis feature geometry", e);
    return undefined;
  }
};

/**
 * Turns the lagis feature array (EPSG:25832, styled by a per feature Leaflet
 * path styler) into a WGS84 FeatureCollection whose paint values are baked
 * into the properties, so the MapLibre layers can read them back with
 * data driven `["get", ...]` expressions and the existing extractor stylers
 * keep working unchanged.
 */
export const buildFeatureCollectionGeoJSON = (featureArray, styler) => {
  const features = [];

  (featureArray ?? []).forEach((feature, index) => {
    const geometry = toWgs84Geometry(feature);
    if (!geometry) {
      return;
    }

    let style = DEFAULT_STYLE;
    if (typeof styler === "function") {
      try {
        style = { ...DEFAULT_STYLE, ...(styler(feature) ?? {}) };
      } catch (e) {
        console.warn("lagis feature styler failed", e);
      }
    }

    features.push({
      type: "Feature",
      id: index,
      geometry,
      properties: {
        ...(feature.properties ?? {}),
        [FEATURE_INDEX_PROPERTY]: index,
        __strokeColor: style.color,
        __strokeWidth: style.weight,
        __strokeOpacity: style.opacity,
        __fillColor: style.fillColor,
        __fillOpacity: style.fillOpacity,
      },
    });
  });

  return { type: "FeatureCollection", features };
};

export const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: [],
};

/**
 * What was last pushed into each map's source. `styledata` fires far more
 * often than the data changes, so the payload is compared by identity to keep
 * MapLibre from re-parsing an unchanged collection on every tile update.
 */
const lastAppliedData = new WeakMap();

/**
 * Adds (or updates) the feature collection source and its three render layers
 * on top of everything else the style contains. Has to run again after every
 * style reload, because setStyle() drops imperatively added sources.
 *
 * @returns false when the style was not ready yet and nothing was applied
 */
export const applyFeatureCollectionLayers = (map, data) => {
  if (!map || !map.isStyleLoaded()) {
    return false;
  }

  const source = map.getSource(FEATURE_COLLECTION_SOURCE_ID);

  if (!source) {
    map.addSource(FEATURE_COLLECTION_SOURCE_ID, {
      type: "geojson",
      data,
    });
    lastAppliedData.set(map, data);
  } else if (lastAppliedData.get(map) !== data) {
    source.setData(data);
    lastAppliedData.set(map, data);
  }

  if (!map.getLayer(FEATURE_COLLECTION_FILL_LAYER_ID)) {
    map.addLayer({
      id: FEATURE_COLLECTION_FILL_LAYER_ID,
      type: "fill",
      source: FEATURE_COLLECTION_SOURCE_ID,
      filter: [
        "match",
        ["geometry-type"],
        ["Polygon", "MultiPolygon"],
        true,
        false,
      ],
      paint: {
        "fill-color": ["get", "__fillColor"],
        "fill-opacity": ["get", "__fillOpacity"],
      },
    });
  }

  if (!map.getLayer(FEATURE_COLLECTION_LINE_LAYER_ID)) {
    map.addLayer({
      id: FEATURE_COLLECTION_LINE_LAYER_ID,
      type: "line",
      source: FEATURE_COLLECTION_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ["get", "__strokeColor"],
        "line-width": ["get", "__strokeWidth"],
        "line-opacity": ["get", "__strokeOpacity"],
      },
    });
  }

  if (!map.getLayer(FEATURE_COLLECTION_POINT_LAYER_ID)) {
    map.addLayer({
      id: FEATURE_COLLECTION_POINT_LAYER_ID,
      type: "circle",
      source: FEATURE_COLLECTION_SOURCE_ID,
      filter: [
        "match",
        ["geometry-type"],
        ["Point", "MultiPoint"],
        true,
        false,
      ],
      paint: {
        "circle-radius": 6,
        "circle-color": ["get", "__fillColor"],
        "circle-opacity": ["get", "__fillOpacity"],
        "circle-stroke-color": ["get", "__strokeColor"],
        "circle-stroke-width": ["get", "__strokeWidth"],
        "circle-stroke-opacity": ["get", "__strokeOpacity"],
      },
    });
  }

  return true;
};

export const FEATURE_COLLECTION_LAYER_IDS = [
  FEATURE_COLLECTION_FILL_LAYER_ID,
  FEATURE_COLLECTION_LINE_LAYER_ID,
  FEATURE_COLLECTION_POINT_LAYER_ID,
];
