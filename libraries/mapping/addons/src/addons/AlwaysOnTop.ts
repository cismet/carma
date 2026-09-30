import type { Map as MaplibreMap } from "maplibre-gl";
import type { ToolEntry } from "@carma-mapping/layers";

/**
 * Keeps a layer above the other layers on the map, whatever the layer order
 * says. Declared on the layer as a tool ("alwaysOnTop"), not on the route: it
 * is a property of that one layer, and there is nothing to mount for it.
 *
 * The stacking itself belongs to the host, which owns the map: it orders the
 * layers it renders through `orderAlwaysOnTopLast` and keeps its own layer bar
 * order untouched, so the pinned layer stays where the user put it in the list
 * and is only drawn last.
 *
 * Layers an addon puts on the map itself are not part of what the host
 * renders; such an addon keeps them on top through `keepOnTop`.
 */
export type AlwaysOnTopConfig = {
  /**
   * Ranks pinned layers among themselves, the highest drawn last. Layers with
   * the same order (the default 0) keep the order they were in.
   */
  order?: number;
};

export const ALWAYS_ON_TOP_KIND = "alwaysOnTop";

/** what an entry carries its tools in; a layer, a group, a catalog item */
type ToolCarrier = { tools?: ToolEntry[] };

const toolKind = (tool: ToolEntry): string =>
  typeof tool === "string"
    ? tool
    : "kind" in tool
    ? tool.kind
    : tool.addon;

const alwaysOnTopTool = (
  entry: ToolCarrier | null | undefined
): ToolEntry | undefined =>
  entry?.tools?.find((tool) => toolKind(tool) === ALWAYS_ON_TOP_KIND);

/** whether this layer declared the tool */
export const isAlwaysOnTop = (entry: ToolCarrier | null | undefined): boolean =>
  !!alwaysOnTopTool(entry);

const pinOrder = (entry: ToolCarrier): number => {
  const tool = alwaysOnTopTool(entry);
  if (!tool || typeof tool === "string") {
    return 0;
  }
  const config = tool.config as AlwaysOnTopConfig | undefined;
  return config?.order ?? 0;
};

/**
 * The same layers with the pinned ones moved to the end, in their configured
 * order. Everything else keeps its position, so pinning one layer does not
 * reshuffle the rest.
 */
export const orderAlwaysOnTopLast = <T extends ToolCarrier>(
  entries: readonly T[]
): T[] => {
  const pinned = entries.filter((entry) => isAlwaysOnTop(entry));
  if (pinned.length === 0) {
    return [...entries];
  }
  return [
    ...entries.filter((entry) => !isAlwaysOnTop(entry)),
    // sort is stable, so equal orders keep the order they were declared in
    ...pinned.sort((a, b) => pinOrder(a) - pinOrder(b)),
  ];
};

/** the map calls `keepOnTop` makes */
type TopKeeperMap = Pick<
  MaplibreMap,
  "getLayersOrder" | "getLayer" | "moveLayer" | "on" | "off"
>;

/**
 * Keeps `layerIds`, layers an addon adds to the map itself, above the other
 * layers, in this order. `orderAlwaysOnTopLast` cannot do that for them: the
 * host's composition does not know them, so a layer another addon adds later
 * without a place of its own lands above them.
 *
 * Checked on every `styledata`: whatever sits above these layers is moved under
 * them, once. A layer that comes back on top after that keeps its place, since
 * it puts itself last on every style change as well (cage's occlusion snapshot
 * does). Moving over it again would never end: every `moveLayer` fires
 * `styledata` for both sides, and while they take turns a WMS in the map
 * refetches its tiles at render cadence. The count starts over when these
 * layers are added anew, e.g. after a composition dropped them.
 *
 * Layers not on the map are skipped. Returns the function that stops it.
 */
export const keepOnTop = (
  map: TopKeeperMap,
  layerIds: readonly string[]
): (() => void) => {
  const isOurs = (id: string): boolean => layerIds.includes(id);
  /** the layers these were moved above since they were last added */
  let passed = new Set<string>();
  /** the first of these layers as the map held it at the last check */
  let placed: unknown;

  const restack = (): void => {
    let order: string[];
    try {
      order = map.getLayersOrder();
    } catch {
      return; // no style to ask yet
    }
    const onMap = new Set(order);
    const ours = layerIds.filter((id) => onMap.has(id));
    const first = ours[0];
    if (first === undefined) return;

    const current = map.getLayer(first);
    if (current !== placed) {
      placed = current;
      passed = new Set();
    }
    for (const id of passed) {
      if (!onMap.has(id)) passed.delete(id);
    }

    const above = order
      .slice(order.findIndex(isOurs))
      .filter((id) => !isOurs(id));
    const returned = new Set(above.filter((id) => passed.has(id)));
    const others = order.filter((id) => !isOurs(id));
    // the layers that came back on top stay there, these go right under them
    let cut = others.length;
    while (cut > 0 && returned.has(others[cut - 1])) cut -= 1;
    const wanted = [...others.slice(0, cut), ...ours, ...others.slice(cut)];
    if (wanted.every((id, i) => order[i] === id)) return;

    for (const id of above) passed.add(id);
    const beforeId = others[cut];
    for (const id of ours) map.moveLayer(id, beforeId);
  };

  restack();
  map.on("styledata", restack);
  return () => {
    map.off("styledata", restack);
  };
};
