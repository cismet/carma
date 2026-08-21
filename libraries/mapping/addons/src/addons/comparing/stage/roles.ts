import type { LibreLayer } from "@carma-mapping/engines/maplibre";

/**
 * Which layers each compare panel shows.
 *
 * The input is the array the app's own map was given, so the comparison is
 * always over what the user actually has on the map rather than over a separate
 * content config.
 *
 * Entries are grouped by `carmaLayerId` because one entry is not one layer: a
 * background spec expands into several named layers that all share the
 * background's id, and a role has to move them together or the base map comes
 * apart.
 */

/** `carmaLayerId` is set by the app's converters on every variant, but the
 * LibreLayer union does not declare it on all of them. */
const layerIdOf = (layer: LibreLayer): string | undefined =>
  (layer as { carmaLayerId?: string }).carmaLayerId;

export type LayerGroup = {
  /** `carmaLayerId`, or a positional key for an entry that carries none */
  key: string;
  layers: LibreLayer[];
};

/** Groups in array order, which is draw order: first is bottom-most. */
export const groupLayers = (layers: readonly LibreLayer[]): LayerGroup[] => {
  const groups: LayerGroup[] = [];
  const byKey = new Map<string, LayerGroup>();
  layers.forEach((layer, index) => {
    const key = layerIdOf(layer) ?? `__unkeyed_${index}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.layers.push(layer);
      return;
    }
    const group: LayerGroup = { key, layers: [layer] };
    byKey.set(key, group);
    groups.push(group);
  });
  return groups;
};

export type Roles = {
  /** shown in every panel, under that panel's own layers */
  shared: LibreLayer[];
  /** one entry per panel, in panel order */
  panels: LibreLayer[][];
};

export const EMPTY_ROLES: Roles = { shared: [], panels: [] };

/**
 * What to compare when nobody has said yet: the topmost two groups go one to
 * each panel and everything below them is shared context, which for a normal
 * geoportal session means the base map stays under both while the two upper
 * layers are held against each other.
 *
 * With only two groups in total there is no context left over, so the base map
 * itself ends up as one side of the comparison. That is odd rather than wrong,
 * and it is exactly what the control panel replaces once it exists.
 *
 * Fewer than two groups means there is nothing to compare and the caller should
 * render no panels at all.
 */
export const deriveImplicitRoles = (layers: readonly LibreLayer[]): Roles => {
  const groups = groupLayers(layers);
  if (groups.length < 2) {
    return EMPTY_ROLES;
  }
  const [left, right] = groups.slice(-2);
  const shared = groups.slice(0, -2).flatMap((group) => group.layers);
  return { shared, panels: [left.layers, right.layers] };
};

/** Shared context first, so a panel's own layers draw over it. */
export const layersForPanel = (roles: Roles, index: number): LibreLayer[] => [
  ...roles.shared,
  ...(roles.panels[index] ?? []),
];
