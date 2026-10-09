export type RouteToPointConfig = {
  /** how long a press has to be held to count as a long press, in ms; default 500 */
  longPressMs?: number;
  /** what the route's card calls the destination; default "Punkt auf der Karte" */
  label?: string;
};

export const DEFAULT_LONG_PRESS_MS = 500;
export const DEFAULT_LABEL = "Punkt auf der Karte";
/** how far the pointer may wander during a long press and still be one, in px */
export const LONG_PRESS_SLOP_PX = 8;
