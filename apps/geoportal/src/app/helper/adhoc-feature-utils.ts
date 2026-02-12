import type { CarmaMapLibreStyleData, Layer } from "@carma/types";
import type {
  GeoJSONSourceSpecification,
  SourceSpecification,
} from "maplibre-gl";

export const isAdhocVectorLayer = (layer: Layer): boolean =>
  layer.layerType === "vector" && layer.type === "object";

const isUrl = (str: string): boolean =>
  str.startsWith("http://") ||
  str.startsWith("https://") ||
  str.endsWith(".json");

const isGeoJsonSource = (
  source: SourceSpecification
): source is GeoJSONSourceSpecification => source.type === "geojson";

const resolveGeoJsonSources = async (
  styleData: CarmaMapLibreStyleData
): Promise<CarmaMapLibreStyleData> => {
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
): Promise<CarmaMapLibreStyleData | null> => {
  if (!style) return null;

  let styleData: CarmaMapLibreStyleData | null = null;

  if (typeof style === "object") {
    styleData = style as CarmaMapLibreStyleData;
  } else if (isUrl(style)) {
    try {
      const res = await fetch(style);
      if (res.ok) {
        styleData = (await res.json()) as CarmaMapLibreStyleData;
      }
    } catch {
      return null;
    }
  } else {
    try {
      styleData = JSON.parse(style) as CarmaMapLibreStyleData;
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
): Promise<CarmaMapLibreStyleData | null> => {
  const style = (layer as Layer & { props?: { style?: string | object } }).props
    ?.style;
  return resolveAdhocStyleData(style);
};

export const filter3dLayers = (layer: Layer): Boolean => {
  return layer.type === "object";
};
