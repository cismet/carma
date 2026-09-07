import { useCallback, useMemo } from "react";

import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import {
  useIsCagedAvailable,
  type FlowFieldParams,
  type UvCorrection,
} from "../../lib/caged-addons";
import {
  flowFieldStateStorageKey,
  loadFlowFieldState,
  saveFlowFieldState,
} from "./flowfield-storage";

/**
 * Everything about the running flow-field animation, in one channel.
 *
 * Two places read it and neither owns it: the layer-bar row draws the title and
 * switches it off, and the addon itself keeps the map layer in step with it.
 * Local state in either would be invisible to the other.
 */

/**
 * An optional WMS layer painted under the particles.
 *
 * Declared in full rather than referenced by catalog id, because the Starkregen
 * geoserver is not in the geoportal's catalog: `starkregenwms-wuppertal` occurs
 * nowhere else in this repo except the workflow that names it. Same reasoning
 * as the time series, which also spells its WMS out where it is used.
 */
export type FlowFieldBackdrop = {
  /** base url, everything up to and including `?SERVICE=WMS` */
  wmsUrl: string;
  /** one layer name, the scenario's maximum-values raster */
  layers: string;
  styles?: string;
  /** 0..1. Default: 0.85 */
  opacity?: number;
};

/**
 * What a route or a workflow declares to run an animation: the data and
 * nothing derived.
 */
export type FlowFieldDefinition = {
  /** what the layer-bar row calls the animation */
  title: string;
  /** rasterfari base, e.g. `https://rain-rasterfari-wuppertal.cismet.de` */
  service: string;
  /**
   * Scenario folder, the rain hazard map config's `animation` value, e.g.
   * `"T50/"`. The `84` in the `u84.tif` behind it is WGS84 and not a time step,
   * so a scenario has exactly one velocity field and no time dimension.
   */
  scenario: string;
  layerPostfix?: string;
  /**
   * How this model's u and v map onto east and north. Depends on the result
   * file, so it belongs to the delivery. Left out, cage uses `{ u: -1, v: -1 }`,
   * which is what the Leaflet rain hazard map defaults to.
   */
  uvCorrection?: UvCorrection;
  /**
   * MapLibre zoom at or above which the animation runs. Default 16, the same
   * ground scale as the Leaflet app's `minAnimationZoom` of 17.
   */
  minZoom?: number;
  /**
   * Whether the particles keep running while the map pans, zooms or tilts.
   * Default true. False clears them the moment a move starts and brings them
   * back once the map has settled, the way the Leaflet rain hazard map did.
   */
  animateWhileMoving?: boolean;
  /** 0..1. Default: 1 */
  opacity?: number;
  params?: FlowFieldParams;
  backdrop?: FlowFieldBackdrop;
  /**
   * What stands in for the animation when cage is not in the build: a plain
   * WMS, the scenario's direction arrows in the rain hazard map's case. Drawn
   * only then; with cage present it is never mounted.
   */
  fallback?: FlowFieldBackdrop;
};

export type FlowFieldState = {
  /** whether the animation is on the map; the row exists exactly while it is */
  isOn: boolean;
  title: string;
  service: string;
  scenario: string;
  layerPostfix: string;
  uvCorrection?: UvCorrection;
  minZoom: number;
  animateWhileMoving: boolean;
  opacity: number;
  params: FlowFieldParams;
  backdrop: FlowFieldBackdrop | null;
  fallback: FlowFieldBackdrop | null;
  /**
   * Whether the map is at or above the zoom gate. Written by the addon from
   * the caged layer, read by the row so it can say why nothing is moving.
   */
  isActive: boolean;
  /** a velocity field is being fetched */
  isLoading: boolean;
  /**
   * Whether the caged implementation is in this build. Unlike the crossfade
   * there is no fallback, so a false here means the row has nothing to show.
   */
  isCaged: boolean;
};

export const FLOW_FIELD_STATE_DEFAULT: FlowFieldState = {
  isOn: false,
  title: "Fließwege",
  service: "",
  scenario: "",
  layerPostfix: "",
  minZoom: 16,
  animateWhileMoving: true,
  opacity: 1,
  params: {},
  backdrop: null,
  fallback: null,
  isActive: false,
  isLoading: false,
  isCaged: false,
};

const sameDefinition = (
  state: FlowFieldState,
  def: FlowFieldDefinition
): boolean =>
  state.title === def.title &&
  state.service === def.service &&
  state.scenario === def.scenario &&
  state.layerPostfix === (def.layerPostfix ?? "") &&
  state.animateWhileMoving === (def.animateWhileMoving ?? true);

/**
 * The channel with its `localStorage` mirror in front of it: the stored launch
 * stands in for the session state until something is written in this
 * session, and every write goes to the store as well. That is what brings a
 * workflow the user launched back after a reload (README, "Workflow tools").
 * Read synchronously rather than hydrated in an effect, so the engine never
 * sees a render in which the animation is off and then on.
 */
const useStoredFlowFieldState = () => {
  const [sessionState, setSessionState] = useAddonState("flowField");
  const addons = useRouteAddons();
  const isCaged = useIsCagedAvailable();
  const storageKey = useMemo(() => flowFieldStateStorageKey(addons), [addons]);
  const storedState = useMemo(
    () => loadFlowFieldState(storageKey, isCaged),
    [storageKey, isCaged]
  );
  const state = sessionState ?? storedState ?? FLOW_FIELD_STATE_DEFAULT;

  const setState = useCallback(
    (updater: (previous: FlowFieldState) => FlowFieldState) =>
      setSessionState((previous) => {
        const next = updater(
          previous ??
            loadFlowFieldState(storageKey, isCaged) ??
            FLOW_FIELD_STATE_DEFAULT
        );
        saveFlowFieldState(storageKey, next);
        return next;
      }),
    [setSessionState, storageKey, isCaged]
  );

  return { state, setState, isCaged };
};

/**
 * One entry point for both writers, so the row and the map layer cannot drift.
 */
export const useFlowFieldActions = () => {
  const { state, setState } = useStoredFlowFieldState();

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

  const setActive = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.isActive === next ? previous : { ...previous, isActive: next }
      ),
    [setState]
  );

  const setLoading = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.isLoading === next
          ? previous
          : { ...previous, isLoading: next }
      ),
    [setState]
  );

  return { ...state, setOn, toggle, setOpacity, setActive, setLoading };
};

/**
 * Launches a `FlowFieldDefinition` into the `flowField` channel.
 *
 * The engine (`FlowField`) runs whatever the channel holds, and this hook is
 * its only writer. A route with a full config uses `startField` at mount; a
 * workflow card uses `toggleField` on click, so the same card switches the
 * animation on and off.
 */
export const useFlowFieldLauncher = () => {
  const { setState, isCaged } = useStoredFlowFieldState();

  const launchedState = useCallback(
    (previous: FlowFieldState, def: FlowFieldDefinition): FlowFieldState => {
      if (sameDefinition(previous, def)) {
        // The same scenario launched again. What the card declares may have
        // changed since the state was stored (a backdrop or a fallback added,
        // a parameter tuned), so those come fresh from the definition; what
        // the user set on the row, the opacity, stays.
        return {
          ...previous,
          uvCorrection: def.uvCorrection,
          minZoom: def.minZoom ?? FLOW_FIELD_STATE_DEFAULT.minZoom,
          params: def.params ?? {},
          backdrop: def.backdrop ?? null,
          fallback: def.fallback ?? null,
          isCaged,
          isOn: true,
        };
      }
      return {
        ...FLOW_FIELD_STATE_DEFAULT,
        title: def.title,
        service: def.service,
        scenario: def.scenario,
        layerPostfix: def.layerPostfix ?? "",
        uvCorrection: def.uvCorrection,
        minZoom: def.minZoom ?? FLOW_FIELD_STATE_DEFAULT.minZoom,
        animateWhileMoving: def.animateWhileMoving ?? true,
        opacity: def.opacity ?? 1,
        params: def.params ?? {},
        backdrop: def.backdrop ?? null,
        fallback: def.fallback ?? null,
        isCaged,
        isOn: true,
      };
    },
    [isCaged]
  );

  const startField = useCallback(
    (def: FlowFieldDefinition) =>
      setState((previous) => launchedState(previous, def)),
    [setState, launchedState]
  );

  /** the same, but a second launch of the running animation switches it off */
  const toggleField = useCallback(
    (def: FlowFieldDefinition) =>
      setState((previous) =>
        sameDefinition(previous, def) && previous.isOn
          ? { ...previous, isOn: false }
          : launchedState(previous, def)
      ),
    [setState, launchedState]
  );

  return { startField, toggleField };
};
