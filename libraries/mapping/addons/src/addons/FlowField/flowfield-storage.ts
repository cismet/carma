import {
  normalizeAddonEntries,
  type AddonEntry,
  type AddonKind,
} from "../../lib/registry";
import type { FlowFieldParams, UvCorrection } from "../../lib/caged-addons";
import {
  FLOW_FIELD_STATE_DEFAULT,
  type FlowFieldBackdrop,
  type FlowFieldState,
} from "./flowfield-actions";

/**
 * Persistence for the flow field: which scenario is on the map, and whether
 * it is on at all.
 *
 * The addon state map is session-only, so this channel is mirrored into
 * `localStorage` and seeded from there on the next load, the way the
 * comparison and the addon manager keep theirs. A workflow the user launched
 * has to be there again after a reload (README, "Workflow tools"): the layer
 * bar's row comes back through the host's own persistence, and this is what
 * puts the animation back behind it.
 *
 * What is stored is the launch: the definition and `isOn`. What the engine
 * reports at runtime, the zoom gate, a fetch in flight, whether cage is in
 * the build, is not restored; the engine publishes it again as soon as it
 * mounts, and until then the row would only be lying about a layer that does
 * not exist yet.
 */

/** the addon whose config may name a key of its own */
const ENGINE_KIND: AddonKind = "flowField";

/**
 * Default entry, shared by every route. The stored state describes a
 * scenario, not a route, so a visitor who launched the animation in one
 * Fachzwilling and opens another that offers it finds it running there too.
 */
export const FLOW_FIELD_STATE_STORAGE_KEY = "carma::flowFieldState";

/**
 * The key this route stores under: its own, when the `flowField` entry names
 * one, and the shared default otherwise.
 */
export const flowFieldStateStorageKey = (
  addons?: readonly AddonEntry[]
): string => {
  const engine = normalizeAddonEntries(addons).find(
    ({ kind }) => kind === ENGINE_KIND
  );
  const configured =
    engine?.kind === ENGINE_KIND ? engine.config?.storageKey : undefined;
  return configured || FLOW_FIELD_STATE_STORAGE_KEY;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const readUvCorrection = (value: unknown): UvCorrection | undefined =>
  isRecord(value) && finiteNumber(value.u) && finiteNumber(value.v)
    ? { u: value.u, v: value.v }
    : undefined;

const readBackdrop = (value: unknown): FlowFieldBackdrop | null => {
  if (!isRecord(value)) return null;
  if (!nonEmptyString(value.wmsUrl) || !nonEmptyString(value.layers)) {
    return null;
  }
  return {
    wmsUrl: value.wmsUrl,
    layers: value.layers,
    styles: typeof value.styles === "string" ? value.styles : undefined,
    opacity: finiteNumber(value.opacity)
      ? Math.max(0, Math.min(1, value.opacity))
      : undefined,
  };
};

/**
 * The stored launch, or undefined when there is none or it names no
 * scenario. `isCaged` is the build's answer, not the store's: the animation
 * is either in this build or it is not, whatever was true when it was
 * stored.
 */
export const loadFlowFieldState = (
  storageKey: string,
  isCaged: boolean
): FlowFieldState | undefined => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    if (!nonEmptyString(parsed.service) || !nonEmptyString(parsed.scenario)) {
      return undefined;
    }
    return {
      ...FLOW_FIELD_STATE_DEFAULT,
      isOn: parsed.isOn === true,
      title: nonEmptyString(parsed.title)
        ? parsed.title
        : FLOW_FIELD_STATE_DEFAULT.title,
      service: parsed.service,
      scenario: parsed.scenario,
      layerPostfix:
        typeof parsed.layerPostfix === "string" ? parsed.layerPostfix : "",
      uvCorrection: readUvCorrection(parsed.uvCorrection),
      minZoom: finiteNumber(parsed.minZoom)
        ? parsed.minZoom
        : FLOW_FIELD_STATE_DEFAULT.minZoom,
      animateWhileMoving: parsed.animateWhileMoving !== false,
      opacity: finiteNumber(parsed.opacity)
        ? Math.max(0, Math.min(1, parsed.opacity))
        : FLOW_FIELD_STATE_DEFAULT.opacity,
      viewportBuffer: finiteNumber(parsed.viewportBuffer)
        ? parsed.viewportBuffer
        : FLOW_FIELD_STATE_DEFAULT.viewportBuffer,
      debounceMs: finiteNumber(parsed.debounceMs)
        ? parsed.debounceMs
        : FLOW_FIELD_STATE_DEFAULT.debounceMs,
      occlusion: parsed.occlusion !== false,
      params: isRecord(parsed.params) ? (parsed.params as FlowFieldParams) : {},
      backdrop: readBackdrop(parsed.backdrop),
      fallback: readBackdrop(parsed.fallback),
      isCaged,
    };
  } catch (error) {
    console.warn("[ADDON STATE] the stored flow field is unusable", error);
    return undefined;
  }
};

export const saveFlowFieldState = (
  storageKey: string,
  state: FlowFieldState
): void => {
  try {
    // the runtime readouts are the engine's to publish, not the store's
    const { isActive: _active, isLoading: _loading, ...launch } = state;
    window.localStorage.setItem(storageKey, JSON.stringify(launch));
  } catch (error) {
    console.warn("[ADDON STATE] the flow field could not be stored", error);
  }
};
