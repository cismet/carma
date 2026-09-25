import { run } from "./api";
import wizardQueries from "./queries";
import { SMALL_AREA_THRESHOLD_SQM, WIZARD_ACTIONS } from "./constants";
import { formatKey } from "./keys";
import { getBuffer25832 } from "../tools/mappingTools";
import {
  fetchGeometries,
  fetchGeometryForKey,
  geometryForKey,
} from "./geometry";

/**
 * Which parcels are compared against which, as in ResultingPanel's three
 * calls to checkGeometryAreas.
 */
export const areaCheckKeys = (value) => {
  if (value.action === WIZARD_ACTIONS.JOIN) {
    return {
      targetKeys: (value.resultKeys ?? []).filter(Boolean).slice(0, 1),
      resultKeys: value.joinKeys ?? [],
    };
  }
  if (value.action === WIZARD_ACTIONS.SPLIT_JOIN) {
    return {
      targetKeys: value.joinKeys ?? [],
      resultKeys: (value.resultKeys ?? []).filter(Boolean),
    };
  }
  return {
    targetKeys: value.splitKey ? [value.splitKey] : [],
    resultKeys: (value.resultKeys ?? []).filter(Boolean),
  };
};

/**
 * Port of GeometryWorker + GeometryAreaChecker. Every parcel needs an ALKIS
 * geometry; `problem` names the first one without.
 */
export const checkAreas = async ({ targetKeys, resultKeys }, jwt) => {
  const geometries = await fetchGeometries([...targetKeys, ...resultKeys], jwt);

  const describe = (key) => {
    const found = geometryForKey(key, geometries);
    return { key, label: formatKey(key), area: found?.area, missing: !found };
  };

  const targets = targetKeys.map(describe);
  const results = resultKeys.map(describe);

  const missingTarget = targets.find((row) => row.missing);
  if (missingTarget) {
    return {
      problem: `Konnte Geometrie zu Flurstück ${missingTarget.label} nicht finden.`,
    };
  }
  const missingResult = results.find((row) => row.missing);
  if (missingResult) {
    return {
      problem: `Konnte keine Geometrie zu Flurstück ${missingResult.label} finden.`,
    };
  }

  const sum = (rows) => rows.reduce((total, row) => total + row.area, 0);
  const sumTargets = sum(targets);
  const sumResults = sum(results);

  return {
    targets,
    results,
    difference: Math.abs(sumResults - sumTargets),
    hasSmallArea: results.some((row) => row.area < SMALL_AREA_THRESHOLD_SQM),
  };
};

/** LagisBroker.rebeBuffer */
const REBE_MIPA_BUFFER_M = -1;

/** Rights and leases on a parcel; HistoricNoSucessorDialog needs them. */
export const findRebeAndMipa = async (key, jwt) => {
  const found = await fetchGeometryForKey(key, jwt);
  if (!found) {
    return { rebe: [], mipa: [], geometryMissing: true };
  }
  // The parcel is made a metre smaller before the search, as the Swing client
  // does it. Without that, a right on the parcel next door would count too,
  // because the two share their boundary line. A parcel narrower than two
  // metres has nothing left after shrinking, and getBuffer25832 then returns
  // undefined — in that case the full outline is the best we have.
  const buffered = getBuffer25832(found.geometry, REBE_MIPA_BUFFER_M);
  if (!buffered) {
    console.warn(
      "Puffer für die Rebe/Mipa-Suche konnte nicht gebildet werden, " +
        "es wird mit der ungepufferten Geometrie gesucht."
    );
  }
  const geo = buffered ?? found.geometry;
  const [rebeData, mipaData] = await Promise.all([
    run(wizardQueries.rebeByGeo, { geo }, jwt),
    run(wizardQueries.mipaByGeo, { geo }, jwt),
  ]);
  return {
    rebe: rebeData.rebe ?? [],
    mipa: mipaData.mipa ?? [],
    geometryMissing: false,
  };
};
