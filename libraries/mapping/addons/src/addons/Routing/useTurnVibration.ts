import { useEffect, useRef } from "react";

import type { RouteDirection } from "@carma-mapping/routing";

import type { RouteInstruction } from "./routeChannel";
import type { RouteMode } from "./routeMode";
import { turnStageAt } from "./turnStages";

/** two short pulses: something to do, now */
const TURN_PATTERN = [80, 60, 80];
/** one long pulse: there */
const ARRIVAL_PATTERN = [400];

/** steps that are no turn: nothing to feel */
const NO_TURN: ReadonlySet<RouteDirection> = new Set(["DEPART", "CONTINUE"]);

/**
 * How far ahead a turn counts as "now" at least, in seconds of travel at the
 * current speed. The stage distances are made for real speeds; a fix comes
 * once a second, and at a pace that covers more than the stage per second
 * (the simulator at 4×) a turn would be jumped over without a buzz. 1.5 s
 * keeps at least one fix inside the window at any speed.
 */
const NOW_LEAD_SECONDS = 1.5;

/** buzz, where the device can; Android only, iOS has no `vibrate` */
export const vibrate = (pattern: number[]) => {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
};

export const vibrateArrival = () => vibrate(ARRIVAL_PATTERN);

/**
 * Buzzes once per turn, when the user reaches the turn's "now" stage, so a
 * phone in a pocket or a bike mount says "here" without being looked at.
 *
 * Once per turn: the turn is keyed by where it starts on the route, and the
 * keys are forgotten when the route being driven changes (a reroute), whose
 * turns are new ones. Dragging the simulator's slider back does not buzz a
 * turn twice.
 */
export const useTurnVibration = (
  enabled: boolean,
  instruction: RouteInstruction | undefined,
  mode: RouteMode | undefined,
  route: unknown,
  /** meters per second from the last fix; null when it carries none */
  speed: number | null
) => {
  const buzzedRef = useRef(new Set<number>());

  useEffect(() => {
    buzzedRef.current = new Set();
  }, [route]);

  const next = instruction?.next;
  const metersToNext = instruction?.metersToNext;
  useEffect(() => {
    if (!enabled || !mode || !next || metersToNext === undefined) {
      return;
    }
    if (NO_TURN.has(next.direction)) {
      return;
    }
    const lead = (speed ?? 0) * NOW_LEAD_SECONDS;
    if (metersToNext > lead && turnStageAt(mode, metersToNext) !== "now") {
      return;
    }
    if (buzzedRef.current.has(next.startsAtMeters)) {
      return;
    }
    buzzedRef.current.add(next.startsAtMeters);
    vibrate(TURN_PATTERN);
    // the speed only widens the window; a new speed alone is no reason to look
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mode, next, metersToNext]);
};
