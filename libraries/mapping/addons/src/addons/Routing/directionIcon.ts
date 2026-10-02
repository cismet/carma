import {
  faArrowRotateLeft,
  faArrowRotateRight,
  faArrowTurnDown,
  faArrowUp,
  faArrowsRotate,
  faElevator,
  faFlagCheckered,
  faLocationArrow,
  faStairs,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

import type { RouteDirection } from "@carma-mapping/routing";

/**
 * The arrow for a turn, drawn as the driver sees it: the road they are on runs
 * up, the head points where they go.
 *
 * The icon set has no such arrows, only `arrow-turn-down` (in from the top
 * left, head pointing down), so the turns are that glyph turned: a quarter
 * turn anticlockwise (negative in CSS) makes the tail come up from below and
 * the head point right; mirrored first and turned clockwise it points left.
 * The hard turns are turned an eighth less, so the head points back down.
 * The slight ones get the plain turn too: the straight arrow leaned a little
 * read as "the road bends" rather than as something to do, so the glyph says
 * "turn" and the words ("leicht rechts halten") carry the nuance. CSS
 * transforms apply right to left, so the mirror is written last.
 */
export type DirectionIcon = {
  icon: IconDefinition;
  /** a CSS transform, applied to the glyph */
  transform?: string;
};

const RIGHT = "rotate(-90deg)";
const LEFT = "rotate(90deg) scaleX(-1)";
const HARD_RIGHT = "rotate(-45deg)";
const HARD_LEFT = "rotate(45deg) scaleX(-1)";

const ICONS: Record<RouteDirection, DirectionIcon> = {
  DEPART: { icon: faLocationArrow },
  CONTINUE: { icon: faArrowUp },
  SLIGHTLY_LEFT: { icon: faArrowTurnDown, transform: LEFT },
  LEFT: { icon: faArrowTurnDown, transform: LEFT },
  HARD_LEFT: { icon: faArrowTurnDown, transform: HARD_LEFT },
  SLIGHTLY_RIGHT: { icon: faArrowTurnDown, transform: RIGHT },
  RIGHT: { icon: faArrowTurnDown, transform: RIGHT },
  HARD_RIGHT: { icon: faArrowTurnDown, transform: HARD_RIGHT },
  UTURN_LEFT: { icon: faArrowRotateLeft },
  UTURN_RIGHT: { icon: faArrowRotateRight },
  CIRCLE_CLOCKWISE: { icon: faArrowsRotate },
  CIRCLE_COUNTERCLOCKWISE: { icon: faArrowsRotate, transform: "scaleX(-1)" },
  STAIRS: { icon: faStairs },
  ELEVATOR: { icon: faElevator },
};

export const directionIcon = (direction: RouteDirection): DirectionIcon =>
  ICONS[direction] ?? ICONS.CONTINUE;

/** the destination, which is not a turn but is what the last step leads to */
export const DESTINATION_ICON: DirectionIcon = { icon: faFlagCheckered };
