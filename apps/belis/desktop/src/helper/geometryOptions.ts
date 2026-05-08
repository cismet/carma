import proj4 from "proj4";
import { proj4crs4326def } from "@carma-mapping/utils";
import type { Feature } from "geojson";

const proj4crs25832def = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";

const CRS_25832 = {
  type: "name" as const,
  properties: { name: "urn:ogc:def:crs:EPSG::25832" },
};

const HARDCODED_POINT_TOELLETURM = {
  type: "Point" as const,
  crs: CRS_25832,
  coordinates: [374503.93, 5679879.3],
};

const HARDCODED_LINE = {
  type: "LineString" as const,
  crs: CRS_25832,
  coordinates: [
    [374503.93, 5679879.3],
    [374523.93, 5679899.3],
    [374543.93, 5679919.3],
  ],
};

export type GeometryKey = "point_toelleturm" | "line";

export const GEOMETRY_OPTIONS: {
  key: GeometryKey;
  label: string;
  geometry: typeof HARDCODED_POINT_TOELLETURM | typeof HARDCODED_LINE;
}[] = [
  {
    key: "point_toelleturm",
    label: "Punkt – Tölleturm",
    geometry: HARDCODED_POINT_TOELLETURM,
  },
  {
    key: "line",
    label: "Linie – Tölleturm",
    geometry: HARDCODED_LINE,
  },
];

export const getGeometryByKey = (key: GeometryKey) =>
  GEOMETRY_OPTIONS.find((o) => o.key === key)!.geometry;

export const getDefaultGeometryKey = (featureType: string): GeometryKey =>
  featureType === "leitung" ? "line" : "point_toelleturm";

type MeasurementGeometry =
  | { type: "Point"; crs: typeof CRS_25832; coordinates: [number, number] }
  | {
      type: "LineString";
      crs: typeof CRS_25832;
      coordinates: [number, number][];
    };

export interface MeasurementGeometryOption {
  key: string;
  label: string;
  geometry: MeasurementGeometry;
}

const wgs84CoordTo25832 = (c: number[]): [number, number] =>
  proj4(proj4crs4326def, proj4crs25832def, [c[0], c[1]]) as [number, number];

export const STANDORT_OPTION_PREFIX = "standort.";

export const parseStandortIdFromKey = (
  geometryKey: string | undefined
): number | undefined => {
  if (!geometryKey || !geometryKey.startsWith(STANDORT_OPTION_PREFIX))
    return undefined;
  const id = Number(geometryKey.slice(STANDORT_OPTION_PREFIX.length));
  return Number.isFinite(id) ? id : undefined;
};

export const buildStandortGeometryOption = (
  feature: { id?: number | string; geometry?: GeoJSON.Geometry; properties?: Record<string, unknown> | null }
): MeasurementGeometryOption | null => {
  if (!feature?.geometry || feature.id == null) return null;
  if (feature.geometry.type !== "Point") return null;

  const coords = feature.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [x, y] = coords as number[];

  // Standort features come from MapLibre vector tiles in WGS84 lon/lat.
  // The geometry-selector pipeline expects EPSG:25832 like measurement options,
  // so reproject here for consistency.
  const projected = wgs84CoordTo25832([x, y]);

  const props = feature.properties ?? {};
  const lfdNummer = props.lfd_nummer;
  const labelSuffix =
    lfdNummer != null ? String(lfdNummer) : String(feature.id);

  return {
    key: `${STANDORT_OPTION_PREFIX}${String(feature.id)}`,
    label: `Standort ${labelSuffix}`,
    geometry: {
      type: "Point",
      crs: CRS_25832,
      coordinates: projected,
    },
  };
};

export const buildMeasurementGeometryOptions = (
  features: Feature[]
): MeasurementGeometryOption[] => {
  const options: MeasurementGeometryOption[] = [];
  for (const f of features) {
    const title = (f.properties as Record<string, unknown> | null)?.title;
    if (typeof title !== "string") continue;
    if (f.geometry.type === "Point") {
      options.push({
        key: `measurement.${String(f.id)}`,
        label: title,
        geometry: {
          type: "Point",
          crs: CRS_25832,
          coordinates: wgs84CoordTo25832(f.geometry.coordinates),
        },
      });
    } else if (f.geometry.type === "LineString") {
      options.push({
        key: `measurement.${String(f.id)}`,
        label: title,
        geometry: {
          type: "LineString",
          crs: CRS_25832,
          coordinates: f.geometry.coordinates.map(wgs84CoordTo25832),
        },
      });
    }
  }
  return options;
};
