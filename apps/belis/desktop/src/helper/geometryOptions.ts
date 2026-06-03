import proj4 from "proj4";
import { proj4crs4326def } from "@carma-mapping/utils";
import type { Feature } from "geojson";
import toTitleCase from "./toTitleCase";

const proj4crs25832def = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";

const CRS_25832 = {
  type: "name" as const,
  properties: { name: "urn:ogc:def:crs:EPSG::25832" },
};

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
  // Original WGS84 point preserved before reprojection. Only set for
  // Standort-derived options today, because the Leuchte-for-existing-Standort
  // save path sends this as a sibling `geometry` SaveObject parameter in
  // EPSG:4326. Measurement-derived options leave this unset.
  geometryWgs84?: { type: "Point"; coordinates: [number, number] };
}

const wgs84CoordTo25832 = (c: number[]): [number, number] =>
  proj4(proj4crs4326def, proj4crs25832def, [c[0], c[1]]) as [number, number];

export const STANDORT_OPTION_PREFIX = "standort.";

// Geometry-edit flow ("change an existing feature's shape to a measurement").
// The first option in the selector reproduces the feature's *current*
// geometry so the user can always revert to it before saving.
export const CURRENT_OPTION_PREFIX = "current.";

// Build the "Momentane Geometrie" option from an existing feature's own
// `geom.geo_field`. Unlike measurement/Standort options this geometry is
// already EPSG:25832 (it comes straight from the DB record), so it is passed
// through unprojected — re-selecting it must yield the exact original
// coordinates with no reprojection round-trip drift. Point-only for v1.
export const buildCurrentGeometryOption = (
  geoField: GeoJSON.Geometry | null | undefined,
  featureDbId: number | string | undefined
): MeasurementGeometryOption | null => {
  if (!geoField || featureDbId == null) return null;
  if (geoField.type !== "Point") return null;
  return {
    key: `${CURRENT_OPTION_PREFIX}${String(featureDbId)}`,
    label: "Momentane Geometrie",
    geometry: geoField as MeasurementGeometryOption["geometry"],
  };
};

export const parseStandortIdFromKey = (
  geometryKey: string | undefined
): number | undefined => {
  if (!geometryKey || !geometryKey.startsWith(STANDORT_OPTION_PREFIX))
    return undefined;
  const id = Number(geometryKey.slice(STANDORT_OPTION_PREFIX.length));
  return Number.isFinite(id) ? id : undefined;
};

// Human label for a Standort, e.g. "Standort 19 (Neviandstr.)" — the number
// from `lfd_nummer` (matches the sidebar) and the street address title-cased.
// Raw map-tile features carry a flat `strasse`; DB-record features (sidebar
// selection) nest it under `fk_strassenschluessel`. Falls back to the
// number-only form when no street is available.
export const formatStandortLabel = (
  props: Record<string, unknown> | null | undefined
): string => {
  const p = props ?? {};
  const lfd = p.lfd_nummer;
  const numberPart = lfd != null ? String(lfd) : "?";
  const nested = p.fk_strassenschluessel;
  const strasseRaw =
    p.strasse ??
    p.strassenschluessel ??
    (nested && typeof nested === "object"
      ? (nested as Record<string, unknown>).strasse
      : undefined);
  const strasse =
    typeof strasseRaw === "string" && strasseRaw.trim() !== ""
      ? toTitleCase(strasseRaw.trim())
      : null;
  return strasse
    ? `Standort ${numberPart} (${strasse})`
    : `Standort ${numberPart}`;
};

// "Verlängern"-flow detector: pull DB id and LineString geometry off the
// currently selected feature when it is a Leitung. Mirrors
// extractStandortFeatureInfo (useCreateFeatureDraft.ts) — selected features
// come through two shapes (raw MapLibre click vs sidebar/fetched override),
// so normalize both into the same input shape.
// const LEITUNG_SOURCE_LAYERS = new Set(["leitungen", "leitung"]);
//
// export const extractLeitungFeatureInfo = (
//   sf: unknown
// ): {
//   id: number;
//   geometryWgs84: GeoJSON.LineString;
//   properties: Record<string, unknown> | null;
// } | null => {
//   if (!sf || typeof sf !== "object") return null;
//   const f = sf as Record<string, unknown>;
//   const carmaInfo = f.carmaInfo as { sourceLayer?: string } | undefined;
//   const layer = (carmaInfo?.sourceLayer ?? f.sourceLayer ?? "") as string;
//   if (!LEITUNG_SOURCE_LAYERS.has(layer)) return null;
//   const geometry = f.geometry as GeoJSON.Geometry | undefined;
//   if (!geometry || geometry.type !== "LineString") return null;
//   const props = (f.properties ?? null) as Record<string, unknown> | null;
//   const sourceProps = props?.sourceProps as
//     | Record<string, unknown>
//     | null
//     | undefined;
//   const leitungProps =
//     sourceProps && typeof sourceProps === "object" ? sourceProps : props;
//   const rawId = leitungProps?.id ?? f.id;
//   const id =
//     typeof rawId === "number"
//       ? rawId
//       : typeof rawId === "string"
//       ? Number(rawId)
//       : NaN;
//   if (!Number.isFinite(id)) return null;
//   return { id, geometryWgs84: geometry, properties: leitungProps };
// };
//
// // Reproject a WGS84 LineString to EPSG:25832 — used by the extension flow to
// // seed the draft's `originalGeometryEpsg25832` once at open time.
// export const leitungLineStringToEpsg25832 = (
//   line: GeoJSON.LineString
// ): { type: "LineString"; crs: typeof CRS_25832; coordinates: [number, number][] } => ({
//   type: "LineString",
//   crs: CRS_25832,
//   coordinates: line.coordinates.map((c) => wgs84CoordTo25832(c as number[])),
// });

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
    geometryWgs84: { type: "Point", coordinates: [x, y] },
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
