import { run } from "./api";
import wizardQueries from "./queries";
import { SMALL_AREA_THRESHOLD_SQM } from "./constants";
import { formatKey } from "./keys";

const pad = (value, length) => String(value ?? "").padStart(length, "0");

/**
 * The label a Flurstück has inside `landparcelInternaDataStructure`:
 * five digit Zähler, and a four digit Nenner only when there is one.
 * Mirrors the padding in store/slices/lagis.js.
 */
export const landparcelLabel = (zaehler, nenner) =>
  nenner === null || nenner === undefined || Number(nenner) === 0
    ? pad(zaehler, 5)
    : `${pad(zaehler, 5)}/${pad(nenner, 4)}`;

/**
 * Finds a Gemarkung in the redux lookup. Its keys are the Gemarkung id parsed
 * out of the ALKIS id (a string, possibly zero padded), while `schluessel`
 * arrives from GraphQL as a number, so neither a strict comparison nor plain
 * property access is reliable on its own.
 */
const findGemarkung = (gemarkung, structure) => {
  if (!structure || !gemarkung) {
    return undefined;
  }
  const direct =
    structure[gemarkung.structureKey] ?? structure[gemarkung.schluessel];
  if (direct) {
    return direct;
  }
  const match = Object.keys(structure).find(
    (candidate) =>
      structure[candidate].gemarkung === gemarkung.bezeichnung ||
      Number(candidate) === Number(gemarkung.schluessel)
  );
  return match === undefined ? undefined : structure[match];
};

/**
 * Resolves a key to its ALKIS id using the lookup the app already keeps in
 * redux, so no extra request is needed for parcels that are known.
 */
export const alkisIdForKey = (key, structure) => {
  if (!structure || !key?.gemarkung) {
    return undefined;
  }
  const gemarkung = findGemarkung(key.gemarkung, structure);
  const flur = gemarkung?.flure?.[pad(key.flur, 3)];
  const parcel = flur?.flurstuecke?.[landparcelLabel(key.zaehler, key.nenner)];
  return parcel?.alkis_id;
};

const fetchAreas = async (alkisIds, jwt) => {
  if (!alkisIds.length) {
    return {};
  }
  const data = await run(wizardQueries.areasByAlkisIds, { alkisIds }, jwt);
  const byId = {};
  for (const row of data.extended_alkis_flurstueck ?? []) {
    byId[row.alkis_id] = row.area;
  }
  return byId;
};

/**
 * Port of GeometryWorker + GeometryAreaChecker: collects the areas of the
 * parcels that disappear and of the ones that are created, so the summary step
 * can show both lists, their difference, and the warning about parcels below
 * 2 m² that SummaryPanel produced.
 *
 * A parcel that has no ALKIS geometry yet counts as 0 m² and is flagged, rather
 * than failing the whole check — new parcels legitimately may not exist in
 * ALKIS at the time the wizard runs.
 */
export const checkAreas = async ({ targetKeys, resultKeys }, structure, jwt) => {
  const entries = [...targetKeys, ...resultKeys].map((key) => ({
    key,
    alkisId: alkisIdForKey(key, structure),
  }));
  const areas = await fetchAreas(
    entries.map((entry) => entry.alkisId).filter(Boolean),
    jwt
  );

  const describe = (key) => {
    const alkisId = alkisIdForKey(key, structure);
    const area = alkisId ? areas[alkisId] : undefined;
    return {
      key,
      label: formatKey(key),
      area: area ?? 0,
      missing: area === undefined || area === null,
    };
  };

  const targets = targetKeys.map(describe);
  const results = resultKeys.map(describe);
  const sum = (rows) => rows.reduce((total, row) => total + row.area, 0);
  const sumTargets = sum(targets);
  const sumResults = sum(results);

  return {
    targets,
    results,
    sumTargets,
    sumResults,
    difference: Math.abs(sumResults - sumTargets),
    hasSmallArea: results.some(
      (row) => !row.missing && row.area < SMALL_AREA_THRESHOLD_SQM
    ),
    missingGeometry: [...targets, ...results]
      .filter((row) => row.missing)
      .map((row) => row.label),
  };
};

/**
 * Rights and leases that sit on a parcel — HistoricNoSucessorDialog asks the
 * user for closing dates when this comes back non-empty.
 */
export const findRebeAndMipa = async (key, structure, jwt) => {
  const alkisId = alkisIdForKey(key, structure);
  if (!alkisId) {
    return { rebe: [], mipa: [], geometryMissing: true };
  }
  const data = await run(wizardQueries.geometryByAlkisId, { alkisId }, jwt);
  const geometry = (data.extended_alkis_flurstueck ?? [])[0]?.geometrie;
  if (!geometry) {
    return { rebe: [], mipa: [], geometryMissing: true };
  }
  const [rebeData, mipaData] = await Promise.all([
    run(wizardQueries.rebeByGeo, { geo: geometry }, jwt),
    run(wizardQueries.mipaByGeo, { geo: geometry }, jwt),
  ]);
  return {
    rebe: rebeData.rebe ?? [],
    mipa: mipaData.mipa ?? [],
    geometryMissing: false,
  };
};
