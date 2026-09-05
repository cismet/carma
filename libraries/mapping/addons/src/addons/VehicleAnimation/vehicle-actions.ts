import { useCallback } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import type { Station } from "./track";
import type { VehicleMode } from "./vehicle-layer";

/**
 * Everything about the running vehicle animation, in one channel.
 *
 * Two places read it and neither owns it: the layer-bar row draws the title,
 * holds the fleet and switches it off, and the addon itself keeps the map layer
 * in step with it. Local state in either would be invisible to the other.
 *
 * Same arrangement as the flow field, for the same reason: the row lives in the
 * host app's tree, the engine in the addon's, and they have no common parent
 * below the provider.
 */

/**
 * The service a route or workflow declares: how often a vehicle leaves, how
 * long it waits, and where. How many vehicles that takes is counted from the
 * route, not configured.
 */
export type VehicleScheduleDefinition = {
  /** seconds between two departures of the same direction */
  headwaySeconds: number;
  /** how long a vehicle waits at each station. Default: 25 */
  dwellSeconds?: number;
  /** the stations it calls at, with their real positions */
  stations: readonly Station[];
  /**
   * How close a piece of track has to pass a station to count as its stop.
   * Default: 40 m, which catches both directions of a two-rail route without
   * reaching the next station.
   */
  stationRadiusMeters?: number;
  /** draw a dot and a name at every station. Default: true */
  showStations?: boolean;
};

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
  /** vehicle length in meters. Default: 24.06, one Schwebebahn GTW 15 */
  lengthMeters?: number;
  /** vehicle width in meters. Default: 2.2 */
  widthMeters?: number;
  /**
   * The body sections as relative lengths, the gaps between them being the
   * articulations. Default: `[1, 0.28, 1]`, the GTW 15's two driving sections
   * around its short middle module.
   */
  sectionShares?: readonly number[];
  /** length of one articulation gap in meters. Default: 0.9 */
  jointMeters?: number;
  /**
   * Running speed between stops, in km/h. Default: 36, which with the default
   * wait gives the Schwebebahn's ~27 km/h average.
   */
  speedKmh?: number;
  /**
   * What happens at the end of the route. Default: `loop`, which is right for
   * a closed ring; an out-and-back line wants `pingpong`.
   */
  mode?: VehicleMode;
  /** without one, a single vehicle runs the route without stopping */
  schedule?: VehicleScheduleDefinition;
  bodyColor?: string;
  /** the rubber articulations between the sections */
  jointColor?: string;
  outlineColor?: string;
  /** 0..1. Default: 1 */
  opacity?: number;
  /** draw the route under the vehicles. Default: true */
  showTrack?: boolean;
  trackColor?: string;
  /**
   * The structure the vehicles hang from, as `build-schwebebahn-structure.mjs`
   * writes it. With one, the Gerüst is drawn over the fleet the way it is seen
   * from above; without, the vehicles run on a bare line.
   */
  structureUrl?: string;
  /**
   * How the fleet is drawn. `flat` is MapLibre fill and line layers seen from
   * above; `three` is a three.js custom layer with the structure standing at
   * its real height and the vehicles hanging under the rail, for a tilted
   * map. Default: `flat`.
   */
  renderer?: VehicleRenderer;
};

export type VehicleRenderer = "flat" | "three";

export type VehicleAnimationState = {
  /** whether the animation is on the map; the row exists exactly while it is */
  isOn: boolean;
  title: string;
  trackUrl: string;
  lengthMeters: number;
  widthMeters: number;
  sectionShares: readonly number[];
  jointMeters: number;
  speedKmh: number;
  mode: VehicleMode;
  headwaySeconds: number;
  dwellSeconds: number;
  stations: readonly Station[];
  stationRadiusMeters: number;
  showStations: boolean;
  bodyColor: string;
  jointColor: string;
  outlineColor: string;
  opacity: number;
  showTrack: boolean;
  trackColor: string;
  /** empty: no structure over the vehicles */
  structureUrl: string;
  renderer: VehicleRenderer;
  /** the fleet stands still but stays on the map */
  isPaused: boolean;
  /** the route is being fetched */
  isLoading: boolean;
  /** why nothing is moving, when nothing is moving */
  error: string | null;
  /** route length in meters, once the track has been read */
  trackLength: number;
  /** how many vehicles the service needs, once the layer has counted them */
  fleetSize: number;
  /**
   * Bumped every time someone asks to be shown a vehicle. A counter rather
   * than a flag, because the row and the engine sit in different trees and the
   * channel is all they share: the engine flies the map when the number it
   * last acted on changes, so two clicks in a row are two flights.
   */
  focusRequest: number;
};

export const VEHICLE_ANIMATION_STATE_DEFAULT: VehicleAnimationState = {
  isOn: false,
  title: "Fahrzeug",
  trackUrl: "",
  lengthMeters: 24.06,
  widthMeters: 2.2,
  sectionShares: [1, 0.17, 1],
  jointMeters: 0.7,
  speedKmh: 36,
  mode: "loop",
  headwaySeconds: 0,
  dwellSeconds: 25,
  stations: [],
  stationRadiusMeters: 40,
  showStations: true,
  bodyColor: "#6ec6f0",
  jointColor: "#a7b1b8",
  outlineColor: "#33556b",
  opacity: 1,
  showTrack: true,
  trackColor: "#8c8c8c",
  structureUrl: "",
  renderer: "flat",
  isPaused: false,
  isLoading: false,
  error: null,
  trackLength: 0,
  fleetSize: 0,
  focusRequest: 0,
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

  const requestFocus = useCallback(
    () =>
      setState((previous) => ({
        ...previous,
        focusRequest: previous.focusRequest + 1,
      })),
    [setState]
  );

  const setFleetSize = useCallback(
    (next: number) =>
      setState((previous) =>
        previous.fleetSize === next ? previous : { ...previous, fleetSize: next }
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
    setFleetSize,
    requestFocus,
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
      // A running service is left alone. A switched-off one is rebuilt from
      // the definition even when it is the same route: what the channel held
      // may be an older reading of it, e.g. a row restored from before the
      // definition grew a field.
      if (sameDefinition(previous, def) && previous.isOn) return previous;
      const fallback = VEHICLE_ANIMATION_STATE_DEFAULT;
      const schedule = def.schedule;
      return {
        ...fallback,
        title: def.title,
        trackUrl: def.trackUrl,
        lengthMeters: def.lengthMeters ?? fallback.lengthMeters,
        widthMeters: def.widthMeters ?? fallback.widthMeters,
        sectionShares: def.sectionShares ?? fallback.sectionShares,
        jointMeters: def.jointMeters ?? fallback.jointMeters,
        speedKmh: def.speedKmh ?? fallback.speedKmh,
        mode: def.mode ?? fallback.mode,
        headwaySeconds: schedule?.headwaySeconds ?? fallback.headwaySeconds,
        dwellSeconds: schedule?.dwellSeconds ?? fallback.dwellSeconds,
        stations: schedule?.stations ?? fallback.stations,
        stationRadiusMeters:
          schedule?.stationRadiusMeters ?? fallback.stationRadiusMeters,
        showStations: schedule?.showStations ?? fallback.showStations,
        bodyColor: def.bodyColor ?? fallback.bodyColor,
        jointColor: def.jointColor ?? fallback.jointColor,
        outlineColor: def.outlineColor ?? fallback.outlineColor,
        opacity: def.opacity ?? fallback.opacity,
        showTrack: def.showTrack ?? fallback.showTrack,
        trackColor: def.trackColor ?? fallback.trackColor,
        structureUrl: def.structureUrl ?? fallback.structureUrl,
        renderer: def.renderer ?? fallback.renderer,
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
