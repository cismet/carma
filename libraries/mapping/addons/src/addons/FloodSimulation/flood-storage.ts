import {
  normalizeAddonEntries,
  type AddonEntry,
  type AddonKind,
} from "../../lib/registry";
import {
  FLOOD_LOOK_BOUNDS,
  FLOOD_LOOK_DEFAULT,
  FLOOD_STATE_DEFAULT,
  type FloodLook,
  type FloodRange,
  type FloodState,
} from "./flood-actions";
import type { FloodTerrainSource } from "./terrain-patch";

/**
 * Persistence for the flood: whether it is on the map, where the water
 * stands, and how it looks.
 *
 * The addon state map is session-only, so this channel is mirrored into
 * `localStorage` and seeded from there on the next load, the way the
 * comparison and the addon manager keep theirs. A workflow the user launched
 * has to be there again after a reload (README, "Workflow tools"): the layer
 * bar's row comes back through the host's own persistence, and this is what
 * puts the water back behind it.
 *
 * What is stored is the launch and what the user set: the definition, `isOn`,
 * the level, the slider range and the look. What the engine reports at
 * runtime, a patch in flight, and what the host owns, whether the panel is
 * open, is not restored; both are published again as soon as the pieces
 * mount.
 */

/** the addon whose config may name a key of its own */
const ENGINE_KIND: AddonKind = "floodSimulation";

/**
 * Default entry, shared by every route. The stored state describes a flood,
 * not a route, so a visitor who set the water in one Fachzwilling and opens
 * another that offers it finds it standing there too.
 */
export const FLOOD_STATE_STORAGE_KEY = "carma::floodSimulationState";

/**
 * The key this route stores under: its own, when the `floodSimulation` entry
 * names one, and the shared default otherwise.
 */
export const floodStateStorageKey = (
  addons?: readonly AddonEntry[]
): string => {
  const engine = normalizeAddonEntries(addons).find(
    ({ kind }) => kind === ENGINE_KIND
  );
  const configured =
    engine?.kind === ENGINE_KIND ? engine.config?.storageKey : undefined;
  return configured || FLOOD_STATE_STORAGE_KEY;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const readTerrain = (value: unknown): FloodTerrainSource | undefined => {
  if (!isRecord(value) || !nonEmptyString(value.tiles)) return undefined;
  return {
    tiles: value.tiles,
    tileSize: finiteNumber(value.tileSize) ? value.tileSize : undefined,
    minzoom: finiteNumber(value.minzoom) ? value.minzoom : undefined,
    maxzoom: finiteNumber(value.maxzoom) ? value.maxzoom : undefined,
    encoding:
      value.encoding === "terrarium" || value.encoding === "mapbox"
        ? value.encoding
        : undefined,
  };
};

const readRange = (value: unknown): FloodRange | null =>
  Array.isArray(value) &&
  value.length === 2 &&
  finiteNumber(value[0]) &&
  finiteNumber(value[1]) &&
  value[0] <= value[1]
    ? [value[0], value[1]]
    : null;

/** each stored knob clamped to its slider's bounds; a missing one is the default */
const readLook = (value: unknown): FloodLook => {
  const look: FloodLook = { ...FLOOD_LOOK_DEFAULT };
  if (!isRecord(value)) return look;
  for (const key of Object.keys(FLOOD_LOOK_BOUNDS) as (keyof FloodLook)[]) {
    const stored = value[key];
    if (finiteNumber(stored)) {
      const [min, max] = FLOOD_LOOK_BOUNDS[key];
      look[key] = Math.min(max, Math.max(min, stored));
    }
  }
  return look;
};

/**
 * The stored flood, or undefined when there is none or it names no terrain.
 */
export const loadFloodState = (storageKey: string): FloodState | undefined => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    const terrain = readTerrain(parsed.terrain);
    if (!terrain) return undefined;
    const range = readRange(parsed.range);
    return {
      ...FLOOD_STATE_DEFAULT,
      isOn: parsed.isOn === true,
      title: nonEmptyString(parsed.title)
        ? parsed.title
        : FLOOD_STATE_DEFAULT.title,
      terrain,
      level: finiteNumber(parsed.level) ? parsed.level : null,
      range,
      fixedRange: parsed.fixedRange === true && range !== null,
      opacity: finiteNumber(parsed.opacity)
        ? Math.max(0, Math.min(1, parsed.opacity))
        : FLOOD_STATE_DEFAULT.opacity,
      look: readLook(parsed.look),
    };
  } catch (error) {
    console.warn("[ADDON STATE] the stored flood is unusable", error);
    return undefined;
  }
};

export const saveFloodState = (storageKey: string, state: FloodState): void => {
  try {
    // the runtime readouts are the engine's and the host's to publish
    const { isLoading: _loading, panelOpen: _open, ...launch } = state;
    window.localStorage.setItem(storageKey, JSON.stringify(launch));
  } catch (error) {
    console.warn("[ADDON STATE] the flood could not be stored", error);
  }
};
