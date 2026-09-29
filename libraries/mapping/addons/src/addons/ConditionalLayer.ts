import type { ToolEntry } from "@carma-mapping/layers";

/**
 * Draws a layer only where the url asks for it. Declared on the layer as a
 * tool ("conditionalLayer"), usually in the style's `metadata.carmaConf.tools`,
 * so the condition travels with the style onto every map and into every scene.
 *
 * Nothing to mount: the host checks the tool when it hands the layers to the
 * map and leaves out a layer whose condition fails. The layer keeps its row
 * and its visibility in the stack, so it is drawn again as soon as the url
 * matches.
 *
 * Made for projection mapping: carmaPM opens the outlet with the insert that
 * sits on the table (`#/outlet?…&mask=buga-bruecke`), and a mask cut for one
 * printed insert must not be projected onto another.
 */
export type ConditionalLayerConfig = {
  /** the layer is drawn only when one of these holds; none or empty: always */
  showWhen?: ConditionalLayerCondition[];
  /** the layer is left out when one of these holds, whatever `showWhen` says */
  hideWhen?: ConditionalLayerCondition[];
};

export type ConditionalLayerCondition =
  | ConditionalLayerParamCondition
  | ConditionalLayerRouteCondition;

/** compares a parameter of the hash query, e.g. `?mask=buga-bruecke` */
export type ConditionalLayerParamCondition = {
  param: string;
  /**
   * How the value is compared, "equals" when left out. "present" holds for
   * any value and needs none. A parameter missing from the url never holds.
   */
  match?: "equals" | "contains" | "startsWith" | "regex" | "present";
  /** an array holds when any of its values does */
  value?: string | string[];
  /** false when left out */
  caseSensitive?: boolean;
};

/** holds on the named routes, e.g. "pm-show" for `#/pm-show` */
export type ConditionalLayerRouteCondition = {
  route: string | string[];
};

/** where the map is: the route's path without slashes, and the hash query */
export type ConditionalLayerContext = {
  route: string;
  params: Record<string, string>;
};

export const CONDITIONAL_LAYER_KIND = "conditionalLayer";

const LOG_PREFIX = "[CONDITIONAL LAYER]";

/** what an entry carries its tools in; a layer, a group, a catalog item */
type ToolCarrier = { tools?: ToolEntry[] };

const toolKind = (tool: ToolEntry): string =>
  typeof tool === "string" ? tool : "kind" in tool ? tool.kind : tool.addon;

/** the tool's config, or undefined when the layer declares no condition */
export const conditionalLayerConfig = (
  entry: ToolCarrier | null | undefined
): ConditionalLayerConfig | undefined => {
  const tool = entry?.tools?.find(
    (entry) => toolKind(entry) === CONDITIONAL_LAYER_KIND
  );
  if (!tool || typeof tool === "string") {
    return undefined;
  }
  return tool.config as ConditionalLayerConfig | undefined;
};

/** the route as a condition names it: `/pm-show` is "pm-show", `/` is "" */
export const conditionRouteOf = (pathname: string): string =>
  pathname.split("/").filter(Boolean)[0] ?? "";

const matchesValue = (
  actual: string,
  condition: ConditionalLayerParamCondition
): boolean => {
  const match = condition.match ?? "equals";
  if (match === "present") {
    return true;
  }
  const values = condition.value === undefined ? [] : [condition.value].flat();
  const fold = (text: string) =>
    condition.caseSensitive ? text : text.toLowerCase();
  return values.some((value) => {
    switch (match) {
      case "equals":
        return fold(actual) === fold(value);
      case "contains":
        return fold(actual).includes(fold(value));
      case "startsWith":
        return fold(actual).startsWith(fold(value));
      case "regex":
        try {
          return new RegExp(value, condition.caseSensitive ? "" : "i").test(
            actual
          );
        } catch {
          console.warn(LOG_PREFIX, "invalid regex, never holds:", value);
          return false;
        }
      default:
        // an unknown match in a style never holds rather than always
        return false;
    }
  });
};

const holds = (
  condition: ConditionalLayerCondition,
  context: ConditionalLayerContext
): boolean => {
  if ("route" in condition) {
    return [condition.route].flat().includes(context.route);
  }
  const actual = context.params[condition.param];
  return actual !== undefined && matchesValue(actual, condition);
};

/** whether the layer's condition lets it onto the map here */
export const isShownByCondition = (
  entry: ToolCarrier | null | undefined,
  context: ConditionalLayerContext
): boolean => {
  const config = conditionalLayerConfig(entry);
  if (!config) {
    return true;
  }
  const { showWhen = [], hideWhen = [] } = config;
  const shown =
    showWhen.length === 0 ||
    showWhen.some((condition) => holds(condition, context));
  return shown && !hideWhen.some((condition) => holds(condition, context));
};
