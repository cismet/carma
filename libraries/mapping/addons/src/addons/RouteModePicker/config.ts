import type { Positions } from "@carma-mapping/map-controls-layout";

import { DEFAULT_ROUTE_MODE } from "../Routing/routeModeChannel";
import type { RouteMode } from "../Routing/routeMode";

/**
 * What the picker is configured with. The value it produces is not in here: it
 * lives on the `routeMode` channel, see `Routing/routeModeChannel.ts`.
 */
export type RouteModePickerConfig = {
  /**
   * Which control group the picker's anchor is in. Default: bottom left, the
   * column the app's search and the origin input are in; the pill hangs to
   * the right of that column, level with its bottom
   */
  controlPosition?: Positions;
  /**
   * Where in the column the anchor is. Default: 30, after the origin input
   * (order 20). It has to come after the column's other items: the layout
   * keys them by index, and an item put in front of the search remounts it
   */
  controlOrder?: number;
  /**
   * Which modes are offered, in this order. Default: walk, bike, car. A route
   * for a pedestrian zone or a cycling map offers the ones that apply.
   */
  modes?: RouteMode[];
  /** what the channel starts at. Default: "walk" */
  defaultMode?: RouteMode;
  /**
   * Render the picker even when nothing asked for a mode. Default: false,
   * which is what keeps it off screen until a consumer needs it.
   */
  alwaysVisible?: boolean;
};

/** the column the search (order 10) and the origin input (order 20) are in */
export const DEFAULT_CONTROL_POSITION: Positions = "bottomleft";
/** the column runs top-down by order, so this is its end */
export const DEFAULT_CONTROL_ORDER = 30;
/** the modes the routing lib can compute as one line; `transit` is not one */
export const DEFAULT_MODES: RouteMode[] = ["walk", "bike", "car"];
export const DEFAULT_MODE: RouteMode = DEFAULT_ROUTE_MODE;
