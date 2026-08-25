import type { AddonEntry } from "../../lib/registry";
import { routeStorageKey } from "../../lib/storage-scope";
import { MAX_PANELS, readModeAndOrientation } from "./compare-modes";
import type { CompareAssignments, CompareState } from "./comparing-actions";

/**
 * Persistence for the comparison: which mode, how many windows, and which layer
 * is shown in which of them.
 *
 * The addon state map is session-only, so this channel is mirrored into
 * `localStorage` and seeded from there on the next load, the way the addon
 * manager keeps its own switches. Scoped by the route's addon list, so a route
 * without the comparison cannot inherit a comparison's layout.
 *
 * Whether the comparison was running is stored with the rest. The layer bar's
 * `__comparing__` row comes back from the host's own persistence anyway, and a
 * row whose mode did not come back with it is the state that has to be undone
 * on the way in; keeping both means what comes back is what was left behind.
 */

const STORAGE_PREFIX = "carma::compareState::";

export const compareStateStorageKey = (
  addons?: readonly AddonEntry[]
): string => routeStorageKey(STORAGE_PREFIX, addons);

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
    const panelCount = readPanelCount(parsed.panelCount);
    // one key carried both of these once, so what is stored decides which of
    // the two axes it can still speak for
    const { mode, orientation } = readModeAndOrientation(
      parsed.mode,
      parsed.orientation
    );
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
