import {
  getAddonKind,
  normalizeAddonEntries,
  type AddonEntry,
} from "@carma-mapping/addons";

/**
 * The route's addons with the frame cache switched on for the time slider, for
 * a map opened with `cache=forced`. Applied to the final list, so it reaches
 * the time slider whichever way it got there: declared by the route, added as
 * a default, or launched by a layer or a handed-over row.
 */
export const withTimeSliderFrameCache = (
  addons: AddonEntry[]
): AddonEntry[] =>
  addons.map((entry): AddonEntry => {
    if (getAddonKind(entry) !== "timeSlider") return entry;
    const [resolved] = normalizeAddonEntries([entry]);
    const config = resolved?.kind === "timeSlider" ? resolved.config : undefined;
    return { addon: "timeSlider", config: { ...config, cacheFrames: true } };
  });
