import {
  formatDirection,
  formatDistance,
  type RouteStep,
} from "@carma-mapping/routing";

import type { RouteInstruction } from "./routeChannel";

/**
 * Where a place on the route is in its instructions.
 *
 * The steps laid end to end cover the whole line, so a place measured from the
 * start (`along` in `routeCamera.ts`) is inside exactly one of them: the last
 * step that begins at or before it. The scan is over a few dozen steps, once
 * per fix, which is nothing.
 *
 * The summed step distances and the line's own length differ by a few meters
 * (the service rounds per step), so a place past the last step's end is still
 * on the last step rather than on none: the user has not left the route, the
 * arithmetic has. `metersToNext` is clamped at zero for the same reason.
 */
export const stepAt = (
  steps: RouteStep[],
  alongMeters: number
): RouteInstruction | undefined => {
  if (steps.length === 0) {
    return undefined;
  }
  let index = 0;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].startsAtMeters > alongMeters) {
      break;
    }
    index = i;
  }
  const current = steps[index];
  const next = steps[index + 1];
  return {
    current,
    next,
    metersToNext: Math.max(
      0,
      current.startsAtMeters + current.distanceInMeters - alongMeters
    ),
  };
};

/** "1. Abfahrt auf Bahnstraße (120 m) · 2. rechts abbiegen auf … (1,4 km)" */
export const formatSteps = (steps: RouteStep[]): string =>
  steps
    .map(
      (step, i) =>
        `${i + 1}. ${formatDirection(step.direction, step.streetName)} (${formatDistance(
          step.distanceInMeters
        )})`
    )
    .join(" · ");

/**
 * "auf Friedrich-Engels-Allee · in 240 m rechts abbiegen auf Bahnstraße", or
 * "auf Bahnstraße · in 80 m Ziel" on the last step. A current step without a
 * name gets no "auf": the turn ahead is still worth saying.
 */
export const formatInstruction = (instruction: RouteInstruction): string => {
  const { current, next, metersToNext } = instruction;
  const here = current.streetName ? `auf ${current.streetName}` : "unterwegs";
  const ahead = next
    ? formatDirection(next.direction, next.streetName)
    : "Ziel";
  return `${here} · in ${formatDistance(metersToNext)} ${ahead}`;
};
