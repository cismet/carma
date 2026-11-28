/**
 * The map views an addon can be limited to: the flat map and the tilted 3D
 * view of the same MapLibre map. Hosts that know which one is on screen pass
 * it to `AddonHost`; an addon entry names the views it belongs to with
 * `mapViews`.
 */
export const ADDON_MAP_VIEW = {
  FLAT: "2d",
  THREE_D: "3d",
} as const;

export type AddonMapView = (typeof ADDON_MAP_VIEW)[keyof typeof ADDON_MAP_VIEW];

/**
 * Whether an entry belongs in the given map view. A bare kind, an entry
 * without `mapViews` and a host that does not report its view (`view`
 * undefined) all keep the addon, so nothing changes for addons and hosts that
 * never heard of map views.
 */
export const isAddonInMapView = (
  entry: string | { mapViews?: readonly AddonMapView[] },
  view: AddonMapView | undefined
): boolean =>
  typeof entry === "string" ||
  view === undefined ||
  entry.mapViews === undefined ||
  entry.mapViews.includes(view);
