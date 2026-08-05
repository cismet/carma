/**
 * Extent of the features a MapLibre style carries in its GeoJSON sources.
 *
 * This only sees geometry the style actually ships, either inline or behind a
 * `data` URL. Styles backed by vector tiles have no features to measure and
 * yield `null`, so callers can treat an extent action as a no-op for them.
 */

/** [minLng, minLat, maxLng, maxLat] */
export type LngLatBounds = [number, number, number, number];

type StyleSource = { type?: string; data?: unknown };
type StyleData = { sources?: Record<string, StyleSource> };

const isUrlLike = (value: string): boolean =>
  value.startsWith("http://") ||
  value.startsWith("https://") ||
  value.endsWith(".json");

const fetchJson = async (url: string): Promise<unknown | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
};

const resolveStyleData = async (
  style: string | object
): Promise<StyleData | null> => {
  if (typeof style === "object") {
    return style as StyleData;
  }
  if (isUrlLike(style)) {
    return (await fetchJson(style)) as StyleData | null;
  }
  try {
    return JSON.parse(style) as StyleData;
  } catch {
    return null;
  }
};

const extendByCoordinates = (bounds: LngLatBounds, coordinates: unknown) => {
  if (!Array.isArray(coordinates)) {
    return;
  }
  const [first, second] = coordinates;
  if (typeof first === "number" && typeof second === "number") {
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return;
    }
    bounds[0] = Math.min(bounds[0], first);
    bounds[1] = Math.min(bounds[1], second);
    bounds[2] = Math.max(bounds[2], first);
    bounds[3] = Math.max(bounds[3], second);
    return;
  }
  coordinates.forEach((entry) => extendByCoordinates(bounds, entry));
};

const extendByGeometry = (bounds: LngLatBounds, geometry: unknown) => {
  if (typeof geometry !== "object" || geometry === null) {
    return;
  }
  const geo = geometry as {
    type?: string;
    coordinates?: unknown;
    geometries?: unknown[];
  };
  if (geo.type === "GeometryCollection") {
    geo.geometries?.forEach((entry) => extendByGeometry(bounds, entry));
    return;
  }
  extendByCoordinates(bounds, geo.coordinates);
};

const extendByGeoJson = (bounds: LngLatBounds, geoJson: unknown) => {
  if (typeof geoJson !== "object" || geoJson === null) {
    return;
  }
  const value = geoJson as {
    type?: string;
    features?: unknown[];
    geometry?: unknown;
  };
  if (value.type === "FeatureCollection") {
    value.features?.forEach((feature) => extendByGeoJson(bounds, feature));
    return;
  }
  if (value.type === "Feature") {
    extendByGeometry(bounds, value.geometry);
    return;
  }
  extendByGeometry(bounds, value);
};

const boundsCache = new Map<string, Promise<LngLatBounds | null>>();

const readStyleFeatureBounds = async (
  style: string | object
): Promise<LngLatBounds | null> => {
  const styleData = await resolveStyleData(style);
  const sources = styleData?.sources;
  if (!sources) {
    return null;
  }

  const bounds: LngLatBounds = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];

  for (const source of Object.values(sources)) {
    if (source?.type !== "geojson") {
      continue;
    }
    const data =
      typeof source.data === "string"
        ? await fetchJson(source.data)
        : source.data;
    extendByGeoJson(bounds, data);
  }

  return bounds.every((value) => Number.isFinite(value)) ? bounds : null;
};

export const getStyleFeatureBounds = (
  style?: string | object | null
): Promise<LngLatBounds | null> => {
  if (!style) {
    return Promise.resolve(null);
  }
  if (typeof style !== "string") {
    return readStyleFeatureBounds(style);
  }

  const cached = boundsCache.get(style);
  if (cached) {
    return cached;
  }
  const request = readStyleFeatureBounds(style).catch(() => null);
  boundsCache.set(style, request);
  return request;
};

const EARTH_METERS_PER_DEGREE = 111320;

/**
 * Extents this small are treated as a single location. Fitting them would put
 * the map at its maximum zoom, which reads as a bug rather than as a result.
 */
const POINT_BOUNDS_THRESHOLD_METERS = 10;

/** Whether `bounds` describes one location rather than an area. */
export const isPointBounds = (bounds: LngLatBounds): boolean => {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const latThreshold = POINT_BOUNDS_THRESHOLD_METERS / EARTH_METERS_PER_DEGREE;
  const centerLat = (minLat + maxLat) / 2;
  const lngThreshold =
    latThreshold / Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01);

  return maxLng - minLng < lngThreshold && maxLat - minLat < latThreshold;
};

export const getBoundsCenter = (
  bounds: LngLatBounds
): { lng: number; lat: number } => ({
  lng: (bounds[0] + bounds[2]) / 2,
  lat: (bounds[1] + bounds[3]) / 2,
});
