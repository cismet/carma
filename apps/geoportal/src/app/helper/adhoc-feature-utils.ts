import type { Layer } from "@carma/types";
import type { AdhocMapLibreStyleData } from "@carma-appframeworks/portals";

export const isAdhocVectorLayer = (layer: Layer): boolean =>
  layer.layerType === "vector" &&
  (layer.id.startsWith("custom:") || layer.other?.serviceName === "custom");

const isUrl = (str: string): boolean =>
  str.startsWith("http://") ||
  str.startsWith("https://") ||
  str.endsWith(".json");

const resolveGeoJsonSources = async (
  styleData: AdhocMapLibreStyleData
): Promise<AdhocMapLibreStyleData> => {
  if (!styleData.sources) return styleData;

  const resolvedSources: Record<string, unknown> = {};

  for (const [key, source] of Object.entries(styleData.sources)) {
    if (
      source?.type === "geojson" &&
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
