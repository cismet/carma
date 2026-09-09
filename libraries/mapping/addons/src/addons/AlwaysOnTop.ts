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
