import {
  normalizeAddonEntries,
  type AddonEntry,
  type AddonKind,
} from "../../lib/registry";
import {
  clampPanelCount,
  clampSpyglassRadius,
  MAX_PANELS,
  readModeAndOrientation,
  SPYGLASS_RADIUS_DEFAULT,
} from "./compare-modes";
import type { CompareAssignments, CompareState } from "./comparing-actions";

/**
 * Persistence for the comparison: which mode, how many windows, and which layer
 * is shown in which of them.
 *
 * The addon state map is session-only, so this channel is mirrored into
 * `localStorage` and seeded from there on the next load, the way the addon
 * manager keeps its own switches.
 *
 * Whether the comparison was running is stored with the rest. The layer bar's
 * `__comparing__` row comes back from the host's own persistence anyway, and a
 * row whose mode did not come back with it is the state that has to be undone
 * on the way in; keeping both means what comes back is what was left behind.
 */

/** the addon whose config may name a key of its own */
const CONTROL_KIND: AddonKind = "comparingControl";

/**
 * Default entry, shared by every route. The stored state describes a
 * comparison, not a route, so it stays meaningful when a route's declared
 * addons change. Deriving the key from the declared kinds instead would orphan
 * the whole state on every config edit: adding any addon to a route would look
 * to the user like the comparison had been forgotten.
 */
export const COMPARE_STATE_STORAGE_KEY = "carma::compareState";

/**
 * The key this route stores under: its own, when the `comparingControl` entry
 * names one, and the shared default otherwise. Taking it off that addon's
 * config rather than off a route id keeps this library free of the host's
 * routing, and puts the decision where the rest of the comparison's setup
 * already lives.
 */
export const compareStateStorageKey = (
  addons?: readonly AddonEntry[]
): string => {
  const control = normalizeAddonEntries(addons).find(
    ({ kind }) => kind === CONTROL_KIND
  );
  const configured =
    control?.kind === CONTROL_KIND ? control.config?.storageKey : undefined;
  return configured || COMPARE_STATE_STORAGE_KEY;
};

const isPanelIndex = (value: unknown, panelCount: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < panelCount;

/**
 * The stored assignment, with everything this build cannot honour dropped: a
 * panel index the layout no longer has, and anything that is not a list of
 * them. A stored state is therefore partially applied rather than rejected as a
 * whole, which matters because its keys are layer ids and the layer bar may
 * have come back with a different set of layers than it had.
 */
const readAssignments = (
  value: unknown,
  panelCount: number
): CompareAssignments | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const result: CompareAssignments = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, panels]) => {
    if (!Array.isArray(panels)) {
      return;
    }
    result[key] = [
      ...new Set(panels.filter((panel) => isPanelIndex(panel, panelCount))),
    ].sort((a, b) => a - b);
  });
  return result;
};

const readPanelCount = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value)
    ? Math.min(MAX_PANELS, Math.max(2, value))
    : 2;

export const loadCompareState = (
  storageKey: string
): CompareState | undefined => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Partial<CompareState> | null;
    if (!parsed) {
      return undefined;
    }
    // one key carried both of these once, so what is stored decides which of
    // the two axes it can still speak for
    const { mode, orientation } = readModeAndOrientation(
      parsed.mode,
      parsed.orientation
    );
    // a count the stored mode cannot draw is a pair this build never writes,
    // and the assignment below is read against whichever of the two wins
    const panelCount = clampPanelCount(mode, readPanelCount(parsed.panelCount));
    return {
      isOn: parsed.isOn === true,
      panelCount,
      // the running mode publishes these on mount, so the stored ones only have
      // to survive until then
      panelLabels: Array.isArray(parsed.panelLabels)
        ? parsed.panelLabels.filter(
            (label): label is string => typeof label === "string"
          )
        : [],
      mode,
      orientation,
      assignments: readAssignments(parsed.assignments, panelCount),
      // only meaningful together with the assignment it was made for
      assignmentsPanelCount:
        parsed.assignments === undefined ? undefined : panelCount,
      layoutTouched: parsed.layoutTouched === true,
      spyglassRadius:
        typeof parsed.spyglassRadius === "number" &&
        Number.isFinite(parsed.spyglassRadius)
          ? clampSpyglassRadius(parsed.spyglassRadius)
          : SPYGLASS_RADIUS_DEFAULT,
    };
  } catch (error) {
    console.warn("[ADDON STATE] the stored comparison is unusable", error);
    return undefined;
  }
};

export const saveCompareState = (storageKey: string, state: CompareState) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    console.warn("[ADDON STATE] the comparison could not be stored", error);
  }
};
