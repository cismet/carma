import { useCallback, useMemo } from "react";

import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import {
  floodStateStorageKey,
  loadFloodState,
  saveFloodState,
} from "./flood-storage";
import {
  NRW_DGM1_TERRAIN,
  type FloodTerrainSource,
} from "./terrain-patch";

/**
 * Everything about the flood on the map, in one channel.
 *
 * Three places read it and none owns it: the layer-bar row shows the level and
 * switches the flood off, the panel moves the level and tunes the look, and
 * the addon keeps the water layer in step with both. Local state in any of
 * them would be invisible to the others.
 */

/** the level slider's bounds, in the DEM's height frame */
export type FloodRange = [min: number, max: number];

/**
 * How the water looks and moves. Nothing in here changes where the water
 * stands; it is what the panel's expanded pane adjusts and what a route may
 * preset. Every knob has a default that keeps the map legible.
 */
export type FloodLook = {
  /**
   * 0..1: how steep the waves are, and with it how much the surface glints and
   * shades. 0 is glass.
   */
  waveHeight: number;
  /** metres, the longest of the wave trains; the others are fractions of it */
  waveLength: number;
  /** multiplier on the waves' own travel speed; 0 freezes them */
  waveSpeed: number;
  /** compass degrees the current flows towards: 0 north, 90 east */
  flowDirection: number;
  /** metres per second the pattern drifts with the current; 0 is still water */
  flowSpeed: number;
  /** metres of depth the light shoreline band spans; 0 turns it off */
  shoreWidth: number;
  /** metres of depth at which the colour is two thirds of the way to deep */
  depthScale: number;
};

export const FLOOD_LOOK_DEFAULT: FloodLook = {
  waveHeight: 0.4,
  waveLength: 6,
  waveSpeed: 1,
  flowDirection: 0,
  flowSpeed: 0,
  shoreWidth: 0.4,
  depthScale: 6,
};

/** the panel's slider bounds; a stored or configured look is clamped to them */
export const FLOOD_LOOK_BOUNDS: Record<
  keyof FloodLook,
  [min: number, max: number]
> = {
  waveHeight: [0, 1],
  waveLength: [1, 30],
  waveSpeed: [0, 3],
  flowDirection: [0, 360],
  flowSpeed: [0, 3],
  shoreWidth: [0, 2],
  depthScale: [1, 20],
};

/** defaults filled in and every knob clamped to its bounds */
export const resolveLook = (look?: Partial<FloodLook>): FloodLook => {
  const resolved: FloodLook = { ...FLOOD_LOOK_DEFAULT };
  if (!look) return resolved;
  for (const key of Object.keys(FLOOD_LOOK_BOUNDS) as (keyof FloodLook)[]) {
    const value = look[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const [min, max] = FLOOD_LOOK_BOUNDS[key];
      resolved[key] = Math.min(max, Math.max(min, value));
    }
  }
  return resolved;
};

/**
 * What a route or a workflow declares to put a flood on the map. Everything
 * but the title has a default: the DGM1 from wupp #4199 as terrain, and a
 * slider range read off the ground in view.
 */
export type FloodDefinition = {
  /** what the layer-bar row calls the flood */
  title: string;
  /** the ground model. Default: the Geobasis NRW DGM1 in terrarium encoding */
  terrain?: FloodTerrainSource;
  /**
   * Water level at launch, in the DEM's height frame. Default: two metres
   * above the lowest ground in view, once that is known.
   */
  level?: number;
  /**
   * Fixed slider bounds. Default: none, the bounds follow the lowest and
   * highest ground in view and move as the map moves.
   */
  range?: FloodRange;
  /** 0..1. Default: 1 */
  opacity?: number;
  /** the look at launch; anything left out is the default */
  look?: Partial<FloodLook>;
};

export type FloodState = {
  /** whether the flood is on the map; the row exists exactly while it is */
  isOn: boolean;
  title: string;
  terrain: FloodTerrainSource;
  /** null until the first patch of ground has been read */
  level: number | null;
  /** null until the first patch of ground has been read */
  range: FloodRange | null;
  /** whether `range` came from the definition and must not follow the view */
  fixedRange: boolean;
  opacity: number;
  look: FloodLook;
  /** a patch of DEM tiles is being fetched */
  isLoading: boolean;
  /** whether the host shows the slider panel; the row's icon is blue then */
  panelOpen: boolean;
};

export const FLOOD_STATE_DEFAULT: FloodState = {
  isOn: false,
  title: "Hochwasser",
  terrain: NRW_DGM1_TERRAIN,
  level: null,
  range: null,
  fixedRange: false,
  opacity: 1,
  look: FLOOD_LOOK_DEFAULT,
  isLoading: false,
  panelOpen: false,
};

/** the slider's step, and what the level is rounded to */
export const FLOOD_LEVEL_STEP = 0.1;

/** rounded through integer tenths, so 143.2 is stored as 143.2 and not 143.20000000000002 */
const roundToStep = (value: number): number =>
  Math.round(value / FLOOD_LEVEL_STEP) / (1 / FLOOD_LEVEL_STEP);

const clampToRange = (value: number, range: FloodRange | null): number =>
  range ? Math.min(range[1], Math.max(range[0], value)) : value;

/** "123,4 m", the way the row and the panel both write a level */
export const formatLevel = (level: number): string =>
  `${level.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} m`;

const sameDefinition = (state: FloodState, def: FloodDefinition): boolean =>
  state.title === def.title &&
  state.terrain.tiles === (def.terrain?.tiles ?? NRW_DGM1_TERRAIN.tiles);

const sameLook = (a: FloodLook, b: FloodLook): boolean =>
  (Object.keys(FLOOD_LOOK_BOUNDS) as (keyof FloodLook)[]).every(
    (key) => a[key] === b[key]
  );

/**
 * The channel with its `localStorage` mirror in front of it: the stored flood
 * stands in for the session state until something is written in this
 * session, and every write goes to the store as well. That is what brings a
 * workflow the user launched back after a reload (README, "Workflow tools").
 * Read synchronously rather than hydrated in an effect, so the engine never
 * sees a render in which the flood is off and then on.
 */
const useStoredFloodState = () => {
  const [sessionState, setSessionState] = useAddonState("floodSimulation");
  const addons = useRouteAddons();
  const storageKey = useMemo(() => floodStateStorageKey(addons), [addons]);
  const storedState = useMemo(() => loadFloodState(storageKey), [storageKey]);
  const state = sessionState ?? storedState ?? FLOOD_STATE_DEFAULT;

  const setState = useCallback(
    (updater: (previous: FloodState) => FloodState) =>
      setSessionState((previous) => {
        const next = updater(
          previous ?? loadFloodState(storageKey) ?? FLOOD_STATE_DEFAULT
        );
        saveFloodState(storageKey, next);
        return next;
      }),
    [setSessionState, storageKey]
  );

  return { state, setState };
};

/**
 * One entry point for every writer, so the row, the panel and the water layer
 * cannot drift.
 */
export const useFloodActions = () => {
  const { state, setState } = useStoredFloodState();

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

  const setLevel = useCallback(
    (next: number) =>
      setState((previous) => {
        const level = roundToStep(clampToRange(next, previous.range));
        return previous.level === level ? previous : { ...previous, level };
      }),
    [setState]
  );

  const stepLevel = useCallback(
    (delta: number) =>
      setState((previous) => {
        if (previous.level === null) return previous;
        const level = roundToStep(
          clampToRange(previous.level + delta, previous.range)
        );
        return previous.level === level ? previous : { ...previous, level };
      }),
    [setState]
  );

  /**
   * The bounds of the ground in view, from the water layer. A fixed range
   * ignores them. The first patch also seeds the level when the definition
   * brought none: two metres above the lowest ground, so the first thing a
   * visitor sees is water in the valley rather than an empty map.
   */
  const setRangeFromGround = useCallback(
    (minHeight: number, maxHeight: number) =>
      setState((previous) => {
        const range: FloodRange = previous.fixedRange && previous.range
          ? previous.range
          : [
              Math.floor(minHeight / FLOOD_LEVEL_STEP) * FLOOD_LEVEL_STEP,
              Math.ceil(maxHeight / FLOOD_LEVEL_STEP) * FLOOD_LEVEL_STEP,
            ];
        const level = roundToStep(
          clampToRange(previous.level ?? minHeight + 2, range)
        );
        if (
          previous.range &&
          previous.range[0] === range[0] &&
          previous.range[1] === range[1] &&
          previous.level === level
        ) {
          return previous;
        }
        return { ...previous, range, level };
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

  /** one or more knobs; each is clamped to its slider's bounds */
  const setLook = useCallback(
    (patch: Partial<FloodLook>) =>
      setState((previous) => {
        const look = resolveLook({ ...previous.look, ...patch });
        return sameLook(previous.look, look) ? previous : { ...previous, look };
      }),
    [setState]
  );

  const resetLook = useCallback(
    () =>
      setState((previous) =>
        sameLook(previous.look, FLOOD_LOOK_DEFAULT)
          ? previous
          : { ...previous, look: FLOOD_LOOK_DEFAULT }
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

  const setPanelOpen = useCallback(
    (next: boolean) =>
      setState((previous) =>
        previous.panelOpen === next
          ? previous
          : { ...previous, panelOpen: next }
      ),
    [setState]
  );

  return {
    ...state,
    label: state.level === null ? "…" : formatLevel(state.level),
    setOn,
    toggle,
    setLevel,
    stepLevel,
    setRangeFromGround,
    setOpacity,
    setLook,
    resetLook,
    setLoading,
    setPanelOpen,
  };
};

/**
 * Launches a `FloodDefinition` into the `floodSimulation` channel.
 *
 * The engine (`FloodSimulation`) draws whatever the channel holds, and this
 * hook is its only writer. A route with `startEnabled` uses `startFlood` at
 * mount; a workflow card uses `toggleFlood` on click, so the same card switches
 * the flood on and off.
 */
export const useFloodLauncher = () => {
  const { state, setState } = useStoredFloodState();

  const launchedState = useCallback(
    (previous: FloodState, def: FloodDefinition): FloodState => {
      if (sameDefinition(previous, def)) {
        return previous.isOn ? previous : { ...previous, isOn: true };
      }
      return {
        ...FLOOD_STATE_DEFAULT,
        title: def.title,
        terrain: def.terrain ?? NRW_DGM1_TERRAIN,
        level: def.level ?? null,
        range: def.range ?? null,
        fixedRange: def.range !== undefined,
        opacity: def.opacity ?? 1,
        look: resolveLook(def.look),
        isOn: true,
      };
    },
    []
  );

  const startFlood = useCallback(
    (def: FloodDefinition) =>
      setState((previous) => launchedState(previous, def)),
    [setState, launchedState]
  );

  /** the same, but a second launch of the running flood switches it off */
  const toggleFlood = useCallback(
    (def: FloodDefinition) =>
      setState((previous) =>
        sameDefinition(previous, def) && previous.isOn
          ? { ...previous, isOn: false }
          : launchedState(previous, def)
      ),
    [setState, launchedState]
  );

  /**
   * Whether this flood is the one the channel currently draws. What the
   * workflow card that launched it shows on its button, so a card that is on
   * the map offers to remove it rather than to add it again.
   */
  const isFloodRunning = useCallback(
    (def: FloodDefinition): boolean => state.isOn && sameDefinition(state, def),
    [state]
  );

  return { startFlood, toggleFlood, isFloodRunning };
};
