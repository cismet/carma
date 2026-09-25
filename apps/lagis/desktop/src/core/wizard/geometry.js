import { reproject } from "reproject";
import proj4 from "proj4";
import { runWuNDa } from "./api";
import { projectionData } from "../tools/mappingTools";
import wizardQueries from "./queries";
import { isKeyComplete, isPseudoKey, landparcelLabel, pad } from "./keys";

/**
 * Mirrors the expression `view_flurstueck_schluessel` uses:
 *
 *   '05' || g.schluessel || '-' || lpad(flur, 3) || '-' || lpad(zaehler, 5)
 *        || CASE WHEN nenner <> 0 THEN '/' || lpad(nenner, 4) ELSE '' END
 *
 * The Gemarkungsschlüssel is deliberately not padded — padding it would
 * produce ids that match nothing for any Gemarkung with a shorter Schlüssel.
 *
 * @returns {string|undefined} undefined for incomplete keys and for pseudo
 *   keys, which exist only in LagIS and have no ALKIS counterpart.
 */
export const buildAlkisId = (key) => {
  if (!key || isPseudoKey(key) || !isKeyComplete(key)) {
    return undefined;
  }
  const schluessel = key.gemarkung?.schluessel;
  if (schluessel === undefined || schluessel === null) {
    return undefined;
  }
  const zaehlerNenner = landparcelLabel(key.zaehler, key.nenner);
  return `05${schluessel}-${pad(key.flur, 3)}-${zaehlerNenner}`;
};

/**
 * @returns {Object} alkis_id -> { area, geometry }, holding only the parcels
 *   that carry a geometry. A key missing from the result has none, which for a
 *   parcel that is about to be created is the normal case.
 */
export const fetchGeometries = async (keys, jwt) => {
  const alkisIds = [...new Set((keys ?? []).map(buildAlkisId).filter(Boolean))];
  if (!alkisIds.length) {
    return {};
  }
  const data = await runWuNDa(
    wizardQueries.geometriesFromWuNDa,
    { alkisIds },
    jwt
  );
  const byAlkisId = {};
  for (const row of data.flurstueck ?? []) {
    const geometry = row.extended_geom?.geo_field;
    if (geometry) {
      byAlkisId[row.alkis_id] = { area: row.extended_geom.area ?? 0, geometry };
    }
  }
  return byAlkisId;
};

export const geometryForKey = (key, byAlkisId) => {
  const alkisId = buildAlkisId(key);
  return alkisId === undefined ? undefined : byAlkisId[alkisId];
};

export const fetchGeometryForKey = async (key, jwt) =>
  geometryForKey(key, await fetchGeometries([key], jwt));

const UTM = projectionData["25832"].def;

export const toWgs84 = (geometry) => reproject(geometry, UTM, proj4.WGS84);

export const toUtm = (geometry) => ({
  ...reproject(geometry, proj4.WGS84, UTM),
  crs: projectionData["25832"].geojson,
});

const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum) / 2;
};

const polygonArea = (rings) =>
  rings.reduce(
    (total, ring, index) => total + (index === 0 ? 1 : -1) * ringArea(ring),
    0
  );

/** Planar area of a metric (EPSG:25832) geometry, as JTS getArea computes it. */
export const planarArea = (geometry) => {
  if (geometry?.type === "Polygon") {
    return polygonArea(geometry.coordinates);
  }
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates.reduce((t, p) => t + polygonArea(p), 0);
  }
  return 0;
};
