import proj4 from "proj4";
import { proj4crs4326def } from "@carma-mapping/utils";

const proj4crs25832def = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";

const featureTypeToSourceLayer: Record<string, string> = {
  leuchte: "leuchten",
  standort: "standorte",
  leitung: "leitungen",
  schaltstelle: "schaltstelle",
  mauerlasche: "mauerlaschen",
  abzweigdose: "abzweigdosen",
};

const featureTypeToGraphqlKey: Record<string, string> = {
  leuchte: "tdta_leuchten",
  standort: "tdta_standort_mast",
  leitung: "leitung",
  schaltstelle: "schaltstelle",
  mauerlasche: "mauerlasche",
  abzweigdose: "abzweigdose",
};

const creationLabels: Record<string, string> = {
  leuchte: "Neue Leuchte",
  standort: "Neuer Standort",
  leitung: "Neue Leitung",
  schaltstelle: "Neue Schaltstelle",
  mauerlasche: "Neue Mauerlasche",
  abzweigdose: "Neue Abzweigdose",
};

function convertGeometryToWgs84(
  geom: GeoJSON.Geometry
): GeoJSON.Geometry | undefined {
  if (geom.type === "Point") {
    const [lng, lat] = proj4(
      proj4crs25832def,
      proj4crs4326def,
      geom.coordinates as [number, number]
    );
    return { type: "Point", coordinates: [lng, lat] };
  }
  if (geom.type === "LineString") {
    return {
      type: "LineString",
      coordinates: geom.coordinates.map(
        (c) =>
          proj4(
            proj4crs25832def,
            proj4crs4326def,
            c as [number, number]
          ) as [number, number]
      ),
    };
  }
  return undefined;
}

export function buildSyntheticFeature(
  featureType: string,
  draftKey: string,
  values: Record<string, unknown>,
  geometryEpsg25832?: GeoJSON.Geometry
) {
  const sourceLayer = featureTypeToSourceLayer[featureType] ?? featureType;
  const wgs84Geometry = geometryEpsg25832
    ? convertGeometryToWgs84(geometryEpsg25832)
    : undefined;

  return {
    type: "Feature" as const,
    id: draftKey,
    properties: {
      id: draftKey,
      _isCreation: true,
      _featureType: featureType,
      _creationLabel: creationLabels[featureType] ?? `Neu: ${featureType}`,
      // The brandnew style's per-type render layers filter on
      // properties._sourceLayer; setting it here lets the draft preview
      // piggy-back on the existing per-type styling.
      _sourceLayer: sourceLayer,
      ...values,
    },
    geometry: wgs84Geometry ?? null,
    sourceLayer,
    source: "",
    layer: { id: sourceLayer, source: "", type: "circle" as const },
    state: {},
  };
}

// Mirror the denormalized properties the vector-tile style reads so a synthetic
// draft renders with the same per-type styling as the real tile features. Today
// only Leitung's `bezeichnung` is mirrored — the line-color expression keys on
// it (see https://tiles.cismet.de/belis/style.json#leitungen-base). Extend here
// when more layers need property-driven styling on drafts.
export function enrichSyntheticProps(
  featureType: string,
  values: Record<string, unknown>,
  keyTables: Record<string, unknown> = {}
): Record<string, unknown> {
  if (featureType === "leitung") {
    const fk = values.fk_leitungstyp;
    if (fk != null) {
      const id = Number(fk);
      if (Number.isFinite(id)) {
        const rows = keyTables.leitungstyp as
          | Array<{ id: number; bezeichnung?: string }>
          | undefined;
        const row = rows?.find((t) => t.id === id);
        if (row?.bezeichnung) {
          return { ...values, bezeichnung: row.bezeichnung };
        }
      }
    }
  }
  if (featureType === "leuchte") {
    // The leuchten-icon layer picks `leuchten<N>` (or `leuchtenMax` for >12)
    // from the `leuchten_count` property. For a creation draft, that count is
    // Leuchte 1 plus each extra tab persisted under `values.leuchten`.
    const extras = values.leuchten as Array<unknown> | undefined;
    const leuchten_count = 1 + (Array.isArray(extras) ? extras.length : 0);
    return { ...values, leuchten_count };
  }
  return values;
}

export function buildSyntheticFetchedData(
  featureType: string,
  values: Record<string, unknown>
): Record<string, unknown> {
  const graphqlKey = featureTypeToGraphqlKey[featureType];
  if (!graphqlKey) return {};

  return {
    [graphqlKey]: [
      {
        id: -1,
        ...values,
        dokumenteArray: [],
      },
    ],
  };
}

export { featureTypeToSourceLayer, creationLabels };
