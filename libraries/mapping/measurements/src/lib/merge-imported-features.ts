import type { Feature } from "geojson";

export type ImportedFeaturesMerge = {
  /** ids the local set does not have */
  additions: Feature[];
  /** ids both sets have, with other geometry or properties */
  conflicts: Feature[];
};

const signature = (feature: Feature) =>
  JSON.stringify([feature.geometry, feature.properties]);

/** Sorts a foreign feature set against the local one by feature id; equal ones drop out. */
export const sortImportedFeatures = (
  local: readonly Feature[],
  incoming: readonly Feature[]
): ImportedFeaturesMerge => {
  const localById = new Map(local.map((f) => [String(f.id), f]));
  const additions: Feature[] = [];
  const conflicts: Feature[] = [];
  for (const feature of incoming) {
    const counterpart = localById.get(String(feature.id));
    if (!counterpart) {
      additions.push(feature);
    } else if (signature(counterpart) !== signature(feature)) {
      conflicts.push(feature);
    }
  }
  return { additions, conflicts };
};

/** The local set with the given features added, or put in place of the local ones with their id. */
export const applyImportedFeatures = (
  local: readonly Feature[],
  features: readonly Feature[]
): Feature[] => {
  const ids = new Set(features.map((f) => String(f.id)));
  return [...local.filter((f) => !ids.has(String(f.id))), ...features];
};
