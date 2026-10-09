import type { RouteMode } from "./routeMode";

/**
 * How close a turn is, in the two stages a navigation speaks up at: "prepare"
 * a while before ("In 300 Metern rechts abbiegen"), "now" right at it ("Jetzt
 * rechts abbiegen"). The distances depend on the pace: a car covers 300 m in
 * a quarter of a minute, a walker needs 50 m of warning at most.
 *
 * The vibration buzzes at "now"; the voice (next phase) will speak at both.
 */
export type TurnStage = "prepare" | "now";

export const DEFAULT_TURN_STAGES: Record<
  RouteMode,
  Record<TurnStage, number>
> = {
  car: { prepare: 300, now: 40 },
  bike: { prepare: 150, now: 20 },
  walk: { prepare: 50, now: 10 },
  // routed as a car trip today, see `travelModeOf`
  transit: { prepare: 300, now: 40 },
};

/** the stage a turn this far ahead is in; null while it is further off */
export const turnStageAt = (
  mode: RouteMode,
  metersToTurn: number
): TurnStage | null => {
  const stages = DEFAULT_TURN_STAGES[mode];
  if (metersToTurn <= stages.now) {
    return "now";
  }
  if (metersToTurn <= stages.prepare) {
    return "prepare";
  }
  return null;
};
