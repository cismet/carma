import { reproject } from "reproject";
import proj4 from "proj4";
import { projectionData } from "./mappingTools";

export const FEATURE_COLLECTION_SOURCE_ID = "lagis-feature-collection";
export const FEATURE_COLLECTION_FILL_LAYER_ID = "lagis-feature-collection-fill";
export const FEATURE_COLLECTION_LINE_LAYER_ID = "lagis-feature-collection-line";
export const FEATURE_COLLECTION_POINT_LAYER_ID =
  "lagis-feature-collection-point";

/** Index into data.featureCollection, so click handlers can get the
 *  original lagis object back. */
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

/** react-cismap reprojected per feature CRS on the fly; MapLibre needs
 *  WGS84 up front. */
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
 * Lagis features (EPSG:25832, Leaflet path styler) to a WGS84 collection with
 * the paint baked into the properties, read back via `["get", ...]`. Keeps the
 * extractor stylers working unchanged.
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

/** Render layers, shared by the map and the print style. */
const featureCollectionLayerDefs = (sourceId) => [
  {
    id: FEATURE_COLLECTION_FILL_LAYER_ID,
    type: "fill",
    source: sourceId,
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
  },
  {
    id: FEATURE_COLLECTION_LINE_LAYER_ID,
    type: "line",
    source: sourceId,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["get", "__strokeColor"],
      "line-width": ["get", "__strokeWidth"],
      "line-opacity": ["get", "__strokeOpacity"],
    },
  },
  {
    id: FEATURE_COLLECTION_POINT_LAYER_ID,
    type: "circle",
    source: sourceId,
    filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
    paint: {
      "circle-radius": 6,
      "circle-color": ["get", "__fillColor"],
      "circle-opacity": ["get", "__fillOpacity"],
      "circle-stroke-color": ["get", "__strokeColor"],
      "circle-stroke-width": ["get", "__strokeWidth"],
      "circle-stroke-opacity": ["get", "__strokeOpacity"],
    },
  },
];

const PRINT_SOURCE_ID = "lagis-print-feature-collection";

/**
 * Self contained style for the tgl-wms "inline" print renderer; the data is
 * embedded, so nothing is fetched at render time.
 *
 * @returns the style, or null when there is nothing to print
 */
export const buildFeatureCollectionPrintStyle = (geoJSON) => {
  if (!geoJSON?.features?.length) {
    return null;
  }

  return {
    version: 8,
    name: "lagis-feature-collection-print",
    sources: {
      [PRINT_SOURCE_ID]: { type: "geojson", data: geoJSON },
    },
    layers: featureCollectionLayerDefs(PRINT_SOURCE_ID),
  };
};

/** Layer prefixes that must stay above the lagis geometry. */
const MEASUREMENT_LAYER_PREFIXES = ["td-", "carma-measurements-"];

const firstMeasurementLayerId = (map) => {
  const layers = map.getStyle()?.layers ?? [];
  const hit = layers.find((layer) =>
    MEASUREMENT_LAYER_PREFIXES.some((prefix) => layer.id.startsWith(prefix))
  );
  return hit?.id;
};

export const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: [],
};

/** Last payload per map: `styledata` fires far more often than the data
 *  changes, so unchanged collections are not re-parsed. */
const lastAppliedData = new WeakMap();

export const applyFeatureCollectionLayers = (map, data) => {
  if (!map?.style?._loaded) {
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

  // On a style reload we re-add after terra-draw, so go in underneath it -
  // otherwise a measurement drawn across a parcel vanishes under its fill.
  const beforeId = firstMeasurementLayerId(map);

  featureCollectionLayerDefs(FEATURE_COLLECTION_SOURCE_ID).forEach((layer) => {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer, beforeId);
    }
  });

  return true;
};

export const FEATURE_COLLECTION_LAYER_IDS = [
  FEATURE_COLLECTION_FILL_LAYER_ID,
  FEATURE_COLLECTION_LINE_LAYER_ID,
  FEATURE_COLLECTION_POINT_LAYER_ID,
];
