import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";
import { formatDirection, formatTurnDistance } from "@carma-mapping/routing";

import { DESTINATION_ICON, directionIcon } from "./directionIcon";
import type { RouteInstruction } from "./routeChannel";

/**
 * What to do next, at the bottom of the map: the turn ahead as a big arrow,
 * how far it is, and the street it leads onto. This is what a driver glances
 * at, so it is the next step and nothing else; the whole list is the
 * ribbon's, the countdown is the row's.
 *
 * A card rather than a pill: three things at two sizes need a box. Dressed
 * like the pills all the same (white, the same radius and shadow), so it is
 * of the same family as the recenter button above it. Kept through the
 * map-only view, which is where it matters most.
 *
 * The bottomcenter column starts at the middle of the map, so the card is
 * pulled back by half its width to sit centred, as the recenter pill is.
 */
type InstructionCardProps = {
  instruction: RouteInstruction;
  position: Positions;
  order: number;
};

export const InstructionCard = ({
  instruction,
  position,
  order,
}: InstructionCardProps) => {
  const { next, metersToNext } = instruction;
  const { icon, transform } = next
    ? directionIcon(next.direction)
    : DESTINATION_ICON;
  // the street ahead; for an unnamed way the turn itself, so the line is
  // never empty
  const label = next
    ? next.streetName || formatDirection(next.direction)
    : "Ziel";

  return (
    <Control position={position} order={order} keepWhenHidden>
      <div
        style={{
          pointerEvents: "auto",
          transform:
            position === "bottomcenter" ? "translateX(-50%)" : undefined,
        }}
      >
        <div
          className="flex h-16 min-w-[220px] max-w-[calc(100vw-32px)] items-center gap-4 rounded-[10px] bg-white px-4 text-gray-800 button-shadow"
          data-test-id="routing-instruction"
        >
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
      </div>
    </Control>
  );
};
