import { runWuNDa } from "./api";
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
