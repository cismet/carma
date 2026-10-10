import { cartographicToEcef, getGcg2016HeightAnomalies } from "@carma-geo/proj";
import type { LngLatArray } from "@carma-geo/data-structures";
import { degToRadNumeric } from "@carma-units";
import type {
  ObliqueGroundTarget,
  ObliqueSelectionData,
  ObliqueViewQuery,
} from "../../core/types";

// Shared by navigation, viewport workers, picker and debug. This boundary samples
// only GCG2016's geoid model, never live terrain/mesh. Repeated points reuse work.
const pending = new Map<string, Promise<ObliqueGroundTarget>>();
export const physicalImageQueryTarget = (
  target: ObliqueGroundTarget
): Promise<ObliqueGroundTarget> => {
  if (
    target.ecefMeters?.length === 3 &&
    target.ecefMeters.every(Number.isFinite)
  )
    return Promise.resolve(target);
  if (
    ![target.longitude, target.latitude, target.heightMeters].every(
      Number.isFinite
    ) ||
    (target.heightDatum !== "dhhn2016" && target.heightDatum !== "ellipsoidal")
  )
    return Promise.resolve(target);
  const key = `${target.longitude}|${target.latitude}|${target.heightMeters}|${target.heightDatum}`;
  let value = pending.get(key);
  if (!value) {
    value = (async () => {
      const anomaly =
        target.heightDatum === "dhhn2016"
          ? (
              await getGcg2016HeightAnomalies([
                [target.longitude, target.latitude] as LngLatArray.deg,
              ])
            )[0]
          : 0;
      if (!Number.isFinite(anomaly))
        throw new Error("Physical image query requires a finite geoid height.");
      const point = cartographicToEcef(
        degToRadNumeric(target.longitude),
        degToRadNumeric(target.latitude),
        target.heightMeters! + anomaly
      );
      return {
        ...target,
        ecefMeters: point.toArray() as [number, number, number],
      };
    })();
    if (pending.size >= 128) pending.delete(pending.keys().next().value!);
    pending.set(key, value);
    void value.catch(() => {
      if (pending.get(key) === value) pending.delete(key);
    });
  }
  return value;
};
export const preparePhysicalImageQuery = async (
  query: ObliqueViewQuery,
  data: ObliqueSelectionData
): Promise<ObliqueViewQuery> => {
  if (
    ![...data.datasets.values()].some(
      (dataset) =>
        dataset.metadataFormat === "oblique-compact-v2" &&
        (!query.enabledSeriesIds || query.enabledSeriesIds.includes(dataset.id))
    )
  )
    return query;
  // Missing height is an explicitly declared reference plane, not a fabricated DEM hit.
  const target =
    query.target.heightMeters === undefined
      ? {
          ...query.target,
          heightMeters:
            [...data.datasets.values()].find(
              (dataset) =>
                !query.enabledSeriesIds ||
                query.enabledSeriesIds.includes(dataset.id)
            )?.referenceGroundHeightMeters ?? 0,
          heightDatum: "dhhn2016" as const,
        }
      : query.target;
  const physical = await physicalImageQueryTarget(target);
  if (!physical.ecefMeters)
    throw new Error("Physical image query requires a known height datum.");
  return { ...query, target: physical };
};
