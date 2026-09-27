import { useCallback } from "react";

import {
  clampTrafficOffset,
  trafficJumpOffset,
  type TrafficJump,
} from "@carma-mapping/show-remote";

import { useAddonState } from "../../lib/AddonStateContext";

/**
 * Everything about the running traffic, in one channel.
 *
 * The engine (`TrafficAnimation`) writes what it shows: the moment, how dark
 * it is, how many vehicles are out. Whoever steers it writes one thing, the
 * offset: the addon's own panel on a desktop route, and on the projection
 * window (`#/outlet`), which has no panel, the remote's entry. Both go through
 * `setOffsetMinutes`, so the engine does not care who moved the slider.
 *
 * Session-only: the offset is a moment in the last 24 hours, which means
 * nothing after a reload a day later.
 */

export type TrafficAnimationState = {
  /** whether an engine with a network is mounted */
  isOn: boolean;
  title: string;
  /** the network being driven, resolved; empty while none is */
  networkUrl: string;
  /**
   * How far back the traffic shown is, in minutes: 0 is live, 1440 is
   * 24 hours ago. It runs with the clock either way.
   */
  offsetMinutes: number;
  /** the moment shown, to the minute, as epoch milliseconds; 0 before the first frame */
  displayedAt: number;
  /** 0 in daylight, 1 at night, two decimals */
  darkness: number;
  /** darkness at 0.5 or more: the lights are what is seen */
  isNight: boolean;
  /** vehicles on the map, fading ones included */
  vehicleCount: number;
  /** vehicles the moment asks for */
  targetCount: number;
  /** the fleet cap thins the traffic out */
  isCapped: boolean;
  /** the launching layer is hidden, and the traffic with it */
  isHidden: boolean;
  /** the network is being fetched */
  isLoading: boolean;
  /** why nothing is moving, when nothing is moving */
  error: string | null;
};

export const TRAFFIC_ANIMATION_STATE_DEFAULT: TrafficAnimationState = {
  isOn: false,
  title: "Verkehr",
  networkUrl: "",
  offsetMinutes: 0,
  displayedAt: 0,
  darkness: 0,
  isNight: false,
  vehicleCount: 0,
  targetCount: 0,
  isCapped: false,
  isHidden: false,
  isLoading: false,
  error: null,
};

/** the fields of `patch` that differ from `state` */
const changes = (
  state: TrafficAnimationState,
  patch: Partial<TrafficAnimationState>
): boolean =>
  (Object.keys(patch) as (keyof TrafficAnimationState)[]).some(
    (key) => patch[key] !== state[key]
  );

/**
 * The channel with its writers. `setOffsetMinutes` and `jump` are for whoever
 * steers the traffic; `update` is the engine's own and leaves the state alone
 * when nothing in the patch changed, so a readout that is written once a second
 * only re-renders when it moved.
 */
export const useTrafficAnimationActions = () => {
  const [sessionState, setSessionState] = useAddonState("trafficAnimation");
  const state = sessionState ?? TRAFFIC_ANIMATION_STATE_DEFAULT;

  const update = useCallback(
    (patch: Partial<TrafficAnimationState>) =>
      setSessionState((previous) => {
        const base = previous ?? TRAFFIC_ANIMATION_STATE_DEFAULT;
        return changes(base, patch) ? { ...base, ...patch } : base;
      }),
    [setSessionState]
  );

  /** show the traffic `minutes` ago; clamped to whole minutes in 0..1440 */
  const setOffsetMinutes = useCallback(
    (minutes: number) => update({ offsetMinutes: clampTrafficOffset(minutes) }),
    [update]
  );

  /** "Tag", "Nacht" or "Live", as the panel's buttons and the remote mean them */
  const jump = useCallback(
    (kind: TrafficJump) =>
      update({ offsetMinutes: trafficJumpOffset(kind, new Date()) }),
    [update]
  );

  return { ...state, update, setOffsetMinutes, jump };
};
