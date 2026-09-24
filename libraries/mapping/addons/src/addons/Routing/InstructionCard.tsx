import type { CSSProperties, ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate } from "@fortawesome/free-solid-svg-icons";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";
import {
  formatDirection,
  formatTurnDistance,
  type RouteStep,
} from "@carma-mapping/routing";

import { REROUTING_LABEL } from "./config";
import { DESTINATION_ICON, directionIcon } from "./directionIcon";
import type { RouteInstruction } from "./routeChannel";

/**
 * What to do next, at the bottom of the map: the turn ahead as a big arrow,
 * how far it is, and the street it leads onto. This is what a driver glances
 * at, so it is the next step and nothing else; the whole list is the
 * ribbon's, the countdown is the row's.
 *
 * The one exception is a second turn close behind the first: two turns in a
 * row are one decision, and the second must not come as a surprise right
 * after the first. So when the stretch between them is short and the user
 * is near the first, a smaller "dann" line names the second under a
 * divider. No distance on it: it is a warning, not a countdown, and two
 * numbers on one card read badly.
 *
 * A card rather than a pill: three things at two sizes need a box. Dressed
 * like the pills all the same (white, the same radius and shadow), so it is
 * of the same family as the recenter button above it. Kept through the
 * map-only view, which is where it matters most.
 *
 * At the bottom centre the card is anchored to the map, not to its slot: the
 * layout's bottom-centre group is a flex item between the bottom-left and
 * bottom-right groups, so it sits wherever their widths leave it, and moves
 * with the card's own width. Taken out of the flow and put at half the
 * bottom row's width (the row spans the map), the card is centred however
 * wide it is, the turn and the rerouting line alike.
 */
const BOTTOM_CENTER_STYLE: CSSProperties = {
  position: "absolute",
  left: "50%",
  bottom: 0,
  transform: "translateX(-50%)",
  pointerEvents: "auto",
};
const UNANCHORED_STYLE: CSSProperties = { pointerEvents: "auto" };

type InstructionCardProps = {
  /** the turn ahead; left out while a reroute is on its way */
  instruction?: RouteInstruction;
  /**
   * a new route is on its way: the card says so in place of a turn, which
   * would belong to the route the user just left
   */
  rerouting?: boolean;
  position: Positions;
  order: number;
  /** the "dann" line shows when the stretch after the next turn is shorter */
  thenWithinMeters: number;
  /** ... and the next turn is closer than this */
  thenAnnounceMeters: number;
};

/**
 * The step's icon and what to call it: the street it leads onto, or for an
 * unnamed way the turn itself, so the line is never empty; the flag and
 * "Ziel" past the last step.
 */
const describe = (step: RouteStep | undefined) =>
  step
    ? {
        ...directionIcon(step.direction),
        label: step.streetName || formatDirection(step.direction),
      }
    : { ...DESTINATION_ICON, label: "Ziel" };

export const InstructionCard = ({
  instruction,
  rerouting = false,
  position,
  order,
  thenWithinMeters,
  thenAnnounceMeters,
}: InstructionCardProps) => {
  const shell = (content: ReactNode) => (
    <Control position={position} order={order} keepWhenHidden>
      <div
        style={
          position === "bottomcenter" ? BOTTOM_CENTER_STYLE : UNANCHORED_STYLE
        }
      >
        <div
          className="flex min-w-[220px] max-w-[calc(100vw-32px)] flex-col rounded-[10px] bg-white px-4 text-gray-800 button-shadow"
          data-test-id="routing-instruction"
        >
          {content}
        </div>
      </div>
    </Control>
  );

  if (rerouting || !instruction) {
    return shell(
      <div
        className="flex h-16 items-center gap-4"
        data-test-id="routing-instruction-rerouting"
      >
        <FontAwesomeIcon
          icon={faArrowsRotate}
          spin
          className="shrink-0 text-2xl"
        />
        <span className="text-base text-gray-600">{REROUTING_LABEL}</span>
      </div>
    );
  }

  const { next, afterNext, metersToNext } = instruction;
  const { icon, transform, label } = describe(next);
  // the second turn, only when it is close behind the first and the first
  // is close; `next` present means `afterNext` is a real step or the end
  const then =
    next !== undefined &&
    next.distanceInMeters < thenWithinMeters &&
    metersToNext < thenAnnounceMeters
      ? describe(afterNext)
      : undefined;

  return shell(
    <>
      <div className="flex h-16 items-center gap-4">
        <FontAwesomeIcon
          icon={icon}
          className="shrink-0 text-3xl"
          style={transform ? { transform } : undefined}
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-2xl font-semibold tabular-nums">
            {formatTurnDistance(metersToNext)}
          </span>
          <span className="truncate text-base text-gray-600">{label}</span>
        </div>
      </div>
      {then && (
        <div
          className="flex h-9 items-center gap-3 border-t border-gray-200 text-sm text-gray-600"
          data-test-id="routing-instruction-then"
        >
          <FontAwesomeIcon
            icon={then.icon}
            className="shrink-0 text-base"
            style={then.transform ? { transform: then.transform } : undefined}
          />
          <span className="truncate">dann {then.label}</span>
        </div>
      )}
    </>
  );
};
