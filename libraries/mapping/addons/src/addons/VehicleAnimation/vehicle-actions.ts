import { useCallback } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import type { VehicleMode } from "./vehicle-layer";

/**
 * Everything about the running vehicle animation, in one channel.
 *
 * Two places read it and neither owns it: the layer-bar row draws the title,
 * pauses the vehicle and switches it off, and the addon itself keeps the map
 * layer in step with it. Local state in either would be invisible to the other.
 *
 * Same arrangement as the flow field, for the same reason: the row lives in the
 * host app's tree, the engine in the addon's, and they have no common parent
 * below the provider.
 */

/**
 * What a route or a workflow declares to run an animation: the data and
 * nothing derived.
 */
export type VehicleAnimationDefinition = {
  /** what the layer-bar row calls the animation */
  title: string;
  /**
   * GeoJSON holding the route. Any Feature, FeatureCollection or bare geometry
   * with LineStrings; loose segments are stitched and the longest chain wins,
   * so a route exported as an unordered pile of edges works as it is.
   */
  trackUrl: string;
  /** vehicle length in meters. Default: 24, one Schwebebahn car */
  lengthMeters?: number;
  /** vehicle width in meters. Default: 2.2 */
  widthMeters?: number;
  /** travel speed in km/h. Default: 27, the Schwebebahn's average */
  speedKmh?: number;
  /**
   * What happens at the end of the route. Default: `loop`, which is right for
   * a closed ring; an out-and-back line wants `pingpong`.
   */
  mode?: VehicleMode;
  fillColor?: string;
  outlineColor?: string;
  /** 0..1. Default: 1 */
  opacity?: number;
  /** draw the route under the vehicle. Default: true */
  showTrack?: boolean;
  trackColor?: string;
};

export type VehicleAnimationState = {
  /** whether the animation is on the map; the row exists exactly while it is */
  isOn: boolean;
  title: string;
  trackUrl: string;
  lengthMeters: number;
  widthMeters: number;
  speedKmh: number;
  mode: VehicleMode;
  fillColor: string;
  outlineColor: string;
  opacity: number;
  showTrack: boolean;
  trackColor: string;
  /** the vehicle stands still but stays on the map */
  isPaused: boolean;
  /** the route is being fetched */
  isLoading: boolean;
  /** why nothing is moving, when nothing is moving */
  error: string | null;
  /** route length in meters, once the track has been read */
  trackLength: number;
};

export const VEHICLE_ANIMATION_STATE_DEFAULT: VehicleAnimationState = {
  isOn: false,
  title: "Fahrzeug",
  trackUrl: "",
  lengthMeters: 24,
  widthMeters: 2.2,
  speedKmh: 27,
  mode: "loop",
  fillColor: "#1677ff",
  outlineColor: "#0b3d91",
  opacity: 1,
  showTrack: true,
  trackColor: "#1677ff",
  isPaused: false,
  isLoading: false,
  error: null,
  trackLength: 0,
};

const sameDefinition = (
  state: VehicleAnimationState,
  def: VehicleAnimationDefinition
): boolean => state.title === def.title && state.trackUrl === def.trackUrl;

/**
 * One entry point for both writers, so the row and the map layer cannot drift.
 * Session-only on purpose: which route animates is config, not something a
 * visitor picks, so there is nothing worth restoring.
 */
export const useVehicleAnimationActions = () => {
  const [sessionState, setSessionState] = useAddonState("vehicleAnimation");
  const state = sessionState ?? VEHICLE_ANIMATION_STATE_DEFAULT;

  const setState = useCallback(
    (updater: (previous: VehicleAnimationState) => VehicleAnimationState) =>
      setSessionState((previous) =>
        updater(previous ?? VEHICLE_ANIMATION_STATE_DEFAULT)
      ),
    [setSessionState]
  );

  const setOn = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.isOn === next ? previous : { ...previous, isOn: next }
      ),
    [setState]
  );

  const toggle = useCallback(
    () => setState((previous) => ({ ...previous, isOn: !previous.isOn })),
    [setState]
  );

  const setPaused = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.isPaused === next ? previous : { ...previous, isPaused: next }
      ),
    [setState]
  );

  const togglePaused = useCallback(
    () =>
      setState((previous) => ({ ...previous, isPaused: !previous.isPaused })),
    [setState]
  );

  const setSpeed = useCallback(
    (next: number) =>
      setState((previous) => {
        const speedKmh = Math.max(0, next);
        return previous.speedKmh === speedKmh
          ? previous
          : { ...previous, speedKmh };
      }),
    [setState]
  );

  const setOpacity = useCallback(
    (next: number) =>
      setState((previous) => {
        const opacity = Math.max(0, Math.min(1, next));
        return previous.opacity === opacity
          ? previous
          : { ...previous, opacity };
      }),
    [setState]
  );

  const setLoading = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.isLoading === next ? previous : { ...previous, isLoading: next }
      ),
    [setState]
  );

  const setError = useCallback(
    (next: string | null) =>
      setState((previous) =>
        previous.error === next ? previous : { ...previous, error: next }
      ),
    [setState]
  );

  const setTrackLength = useCallback(
    (next: number) =>
      setState((previous) =>
        previous.trackLength === next
          ? previous
          : { ...previous, trackLength: next }
      ),
    [setState]
  );

  return {
    ...state,
    setOn,
    toggle,
    setPaused,
    togglePaused,
    setSpeed,
    setOpacity,
    setLoading,
    setError,
    setTrackLength,
  };
};

/**
 * Launches a `VehicleAnimationDefinition` into the `vehicleAnimation` channel.
 *
 * The engine (`VehicleAnimation`) runs whatever the channel holds, and this
 * hook is its only writer. A route with a full config uses `startVehicle` at
 * mount; a workflow card uses `toggleVehicle` on click, so the same card
 * switches the animation on and off.
 */
export const useVehicleAnimationLauncher = () => {
  const [, setSessionState] = useAddonState("vehicleAnimation");

  const setState = useCallback(
    (updater: (previous: VehicleAnimationState) => VehicleAnimationState) =>
      setSessionState((previous) =>
        updater(previous ?? VEHICLE_ANIMATION_STATE_DEFAULT)
      ),
    [setSessionState]
  );

  const launchedState = useCallback(
    (
      previous: VehicleAnimationState,
      def: VehicleAnimationDefinition
    ): VehicleAnimationState => {
      if (sameDefinition(previous, def)) {
        return previous.isOn ? previous : { ...previous, isOn: true };
      }
      const fallback = VEHICLE_ANIMATION_STATE_DEFAULT;
      return {
        ...fallback,
        title: def.title,
        trackUrl: def.trackUrl,
        lengthMeters: def.lengthMeters ?? fallback.lengthMeters,
        widthMeters: def.widthMeters ?? fallback.widthMeters,
        speedKmh: def.speedKmh ?? fallback.speedKmh,
        mode: def.mode ?? fallback.mode,
        fillColor: def.fillColor ?? fallback.fillColor,
        outlineColor: def.outlineColor ?? fallback.outlineColor,
        opacity: def.opacity ?? fallback.opacity,
        showTrack: def.showTrack ?? fallback.showTrack,
        trackColor: def.trackColor ?? fallback.trackColor,
        isOn: true,
      };
    },
    []
  );

  const startVehicle = useCallback(
    (def: VehicleAnimationDefinition) =>
      setState((previous) => launchedState(previous, def)),
    [setState, launchedState]
  );

  /** the same, but a second launch of the running animation switches it off */
  const toggleVehicle = useCallback(
    (def: VehicleAnimationDefinition) =>
      setState((previous) =>
        sameDefinition(previous, def) && previous.isOn
          ? { ...previous, isOn: false }
          : launchedState(previous, def)
      ),
    [setState, launchedState]
  );

  return { startVehicle, toggleVehicle };
};
