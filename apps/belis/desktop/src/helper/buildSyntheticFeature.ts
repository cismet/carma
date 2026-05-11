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
