import type { Tiles3dCutoutPolygon } from "@carma-mapping/engines/maplibre";

/**
 * A carma plan site: the area where reality is swapped for a planned
 * scenario. Read from a GeoJSON file, so a site drawn with the measurement
 * tool (a closed line) works as well as a proper polygon.
 */
export type CarmaPlanSite = {
  title: string;
  /** lng/lat, outer ring first; rings are closed (last point = first) */
  polygons: Tiles3dCutoutPolygon[];
  /** where the site is reached from the street */
  entrances: CarmaPlanEntrance[];
};

/**
 * An access from the street: a LineString feature with the property
 * `role: "entrance"`, its first point where the way crosses the site edge,
 * the next ones along the way into the site. `width` in metres is optional.
 */
export type CarmaPlanEntrance = {
  /** lng/lat, street end first */
  path: Position[];
  width: number | null;
};

type Position = readonly [number, number];

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number";

const closeRing = (ring: readonly unknown[]): Position[] | null => {
  const points = ring.filter(isPosition).map(([x, y]) => [x, y] as const);
  if (points.length < 3) return null;
  const [first] = points;
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) points.push(first);
  return points.length >= 4 ? points : null;
};

const polygonsOfGeometry = (geometry: unknown): Tiles3dCutoutPolygon[] => {
  if (!geometry || typeof geometry !== "object") return [];
  const { type, coordinates } = geometry as {
    type?: string;
    coordinates?: unknown;
  };
  if (!Array.isArray(coordinates)) return [];
  const polygon = (rings: unknown[]): Tiles3dCutoutPolygon[] => {
    const closed = rings
      .map((ring) => (Array.isArray(ring) ? closeRing(ring) : null))
      .filter((ring): ring is Position[] => ring !== null);
    return closed.length > 0 ? [closed] : [];
  };
  switch (type) {
    // a measurement line around the site; it is closed here
    case "LineString":
      return polygon([coordinates]);
    case "Polygon":
      return polygon(coordinates);
    case "MultiPolygon":
      return coordinates.flatMap((rings) =>
        Array.isArray(rings) ? polygon(rings) : []
      );
    default:
      return [];
  }
};

export const parseCarmaPlanSite = (
  geojson: unknown,
  fallbackTitle: string
): CarmaPlanSite => {
  const features =
    geojson && typeof geojson === "object"
      ? (geojson as { type?: string }).type === "FeatureCollection"
        ? (geojson as { features?: unknown[] }).features ?? []
        : [geojson]
      : [];
  const polygons: Tiles3dCutoutPolygon[] = [];
  const entrances: CarmaPlanEntrance[] = [];
  let title: string | null = null;
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const { geometry, properties } = feature as {
      geometry?: { type?: unknown; coordinates?: unknown };
      properties?: { title?: unknown; role?: unknown; width?: unknown } | null;
    };
    if (properties?.role === "entrance") {
      const path = Array.isArray(geometry?.coordinates)
        ? geometry.coordinates
            .filter(isPosition)
            .map(([x, y]) => [x, y] as const)
        : [];
      if (geometry?.type === "LineString" && path.length >= 2)
        entrances.push({
          path,
          width: typeof properties.width === "number" ? properties.width : null,
        });
      continue;
    }
    polygons.push(...polygonsOfGeometry(geometry ?? feature));
    if (title === null && typeof properties?.title === "string")
      title = properties.title;
  }
  return { title: title ?? fallbackTitle, polygons, entrances };
};

export const loadCarmaPlanSite = async (
  url: string,
  signal?: AbortSignal
): Promise<CarmaPlanSite> => {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(
      `[CARMA PLAN] site ${url}: HTTP ${response.status.toString()}`
    );
  const site = parseCarmaPlanSite(await response.json(), url);
  if (site.polygons.length === 0)
    throw new Error(`[CARMA PLAN] site ${url}: no polygon or closed line`);
  return site;
};
