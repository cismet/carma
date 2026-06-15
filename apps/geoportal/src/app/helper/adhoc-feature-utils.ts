import {
  ADHOC_LAYER_SOURCES,
  type AdhocLayerSource,
  type AdhocMapLibreStyleData,
} from "@carma-appframeworks/portals";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import type {
  GeoJSONSourceSpecification,
  SourceSpecification,
} from "maplibre-gl";

export const isAdhocVectorLayer = (layer: Layer | BackgroundLayer): boolean =>
  layer.layerType === "vector" && layer.type === "object";

const isUrl = (str: string): boolean =>
  str.startsWith("http://") ||
  str.startsWith("https://") ||
  str.endsWith(".json");

const isGeoJsonSource = (
  source: SourceSpecification
): source is GeoJSONSourceSpecification => source.type === "geojson";

const resolveGeoJsonSources = async (
  styleData: AdhocMapLibreStyleData
): Promise<AdhocMapLibreStyleData> => {
  if (!styleData.sources) return styleData;

  const resolvedSources: Record<string, SourceSpecification> = {};

  for (const [key, source] of Object.entries(styleData.sources)) {
    if (
      isGeoJsonSource(source) &&
      typeof source.data === "string" &&
      isUrl(source.data)
    ) {
      try {
        const res = await fetch(source.data);
        if (res.ok) {
          const geoJson = await res.json();
          resolvedSources[key] = { ...source, data: geoJson };
          continue;
        }
      } catch {
        // Keep original if fetch fails
      }
    }
    resolvedSources[key] = source;
  }

  return { ...styleData, sources: resolvedSources };
};

export const resolveAdhocStyleData = async (
  style: string | object | undefined
): Promise<AdhocMapLibreStyleData | null> => {
  if (!style) return null;

  let styleData: AdhocMapLibreStyleData | null = null;

  if (typeof style === "object") {
    styleData = style as AdhocMapLibreStyleData;
  } else if (isUrl(style)) {
    try {
      const res = await fetch(style);
      if (res.ok) {
        styleData = (await res.json()) as AdhocMapLibreStyleData;
      }
    } catch {
      return null;
    }
  } else {
    try {
      styleData = JSON.parse(style) as AdhocMapLibreStyleData;
    } catch {
      return null;
    }
  }

  if (!styleData) return null;

  // Resolve any GeoJSON source URLs to inline data
  return resolveGeoJsonSources(styleData);
};

export const getVectorLayerStyle = async (
  layer: Layer
): Promise<AdhocMapLibreStyleData | null> => {
  const style = (layer as Layer & { props?: { style?: string | object } }).props
    ?.style;
  return resolveAdhocStyleData(style);
};

export const getAdhocLayerStyleSource = (
  layer: Layer | BackgroundLayer
): unknown => {
  const style = (layer as { props?: { style?: unknown } }).props?.style;
  return typeof style === "object" && style !== null
    ? (style as { source?: unknown }).source
    : null;
};

export const is2dMeasurementAdhocLayer = (
  layer: Layer | BackgroundLayer
): boolean =>
  getAdhocLayerStyleSource(layer) === ADHOC_LAYER_SOURCES.TWO_D_MEASUREMENTS;

export const is3dAnnotationAdhocLayer = (
  layer: Layer | BackgroundLayer
): boolean =>
  getAdhocLayerStyleSource(layer) === ADHOC_LAYER_SOURCES.ANNOTATIONS;

export const isVisible3dAnnotationAdhocLayer = (
  layer: Layer | BackgroundLayer
): boolean => layer.visible !== false && is3dAnnotationAdhocLayer(layer);

export const LEAFLET_MAPLIBRE_ADHOC_LAYER_STYLE_SOURCES: readonly AdhocLayerSource[] =
  [ADHOC_LAYER_SOURCES.TWO_D_MEASUREMENTS];

export const isSupportedLeafletMapLibreAdhocLayer = (
  layer: Layer | BackgroundLayer
): boolean => {
  const source = getAdhocLayerStyleSource(layer);
  return LEAFLET_MAPLIBRE_ADHOC_LAYER_STYLE_SOURCES.includes(
    source as AdhocLayerSource
  );
};

export const shouldShowAdhocLayerInCesiumLayerList = (
  layer: Layer | BackgroundLayer
): boolean => {
  return !is2dMeasurementAdhocLayer(layer);
};

export const shouldShowAdhocLayerIn2dLayerList = (
  layer: Layer | BackgroundLayer
): boolean => {
  return !is3dAnnotationAdhocLayer(layer);
};

export const shouldShowAdhocLayerInLayerList = (
  layer: Layer | BackgroundLayer,
  isCesium: boolean
): boolean => {
  return isCesium
    ? shouldShowAdhocLayerInCesiumLayerList(layer)
    : shouldShowAdhocLayerIn2dLayerList(layer);
};

export const filter3dLayers = (layer: Layer | BackgroundLayer): Boolean => {
  return layer.type === "object";
};
