import { run } from "./api";
import wizardQueries from "./queries";
import { SMALL_AREA_THRESHOLD_SQM } from "./constants";
import { formatKey } from "./keys";
import {
  fetchGeometries,
  fetchGeometryForKey,
  geometryForKey,
} from "./geometry";

/**
 * Port of GeometryWorker + GeometryAreaChecker. A parcel without an ALKIS
 * geometry counts as 0 m² and is flagged rather than failing the whole check —
 * new parcels legitimately may not exist in ALKIS yet.
 */
export const checkAreas = async ({ targetKeys, resultKeys }, jwt) => {
  const geometries = await fetchGeometries([...targetKeys, ...resultKeys], jwt);

  const describe = (key) => {
    const found = geometryForKey(key, geometries);
    return {
      key,
      label: formatKey(key),
      area: found?.area ?? 0,
      missing: found === undefined,
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

/** Rights and leases on a parcel; HistoricNoSucessorDialog needs them. */
export const findRebeAndMipa = async (key, jwt) => {
  const found = await fetchGeometryForKey(key, jwt);
  if (!found) {
    return { rebe: [], mipa: [], geometryMissing: true };
  }
  const [rebeData, mipaData] = await Promise.all([
    run(wizardQueries.rebeByGeo, { geo: found.geometry }, jwt),
    run(wizardQueries.mipaByGeo, { geo: found.geometry }, jwt),
  ]);
  return {
    rebe: rebeData.rebe ?? [],
    mipa: mipaData.mipa ?? [],
    geometryMissing: false,
  };
};
