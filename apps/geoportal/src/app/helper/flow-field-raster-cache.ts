import {
  getAddonKind,
  normalizeAddonEntries,
  type AddonEntry,
} from "@carma-mapping/addons";

/**
 * The route's addons with the raster cache switched on for the flow field,
 * for a map opened with `cache=forced`. Applied to the final list, so it
 * reaches the flow field whichever way it got there: declared by the route,
 * added as a default, or launched by a layer or a handed-over row.
 */
export const withFlowFieldRasterCache = (
  addons: AddonEntry[]
): AddonEntry[] =>
  addons.map((entry): AddonEntry => {
    if (getAddonKind(entry) !== "flowField") return entry;
    const [resolved] = normalizeAddonEntries([entry]);
    const config = resolved?.kind === "flowField" ? resolved.config : undefined;
    return { addon: "flowField", config: { ...config, cacheRasters: true } };
  });
