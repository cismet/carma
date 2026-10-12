import { useCallback } from "react";
import { useAddonState } from "../../lib/AddonStateContext";

/**
 * The 3D measurement channel the row, the control button and the host app all
 * read: tool on/off, whether the map can host it (a mesh or tileset is drawn
 * through the Three.js layer), the ribbon, and the measurement count.
 */
export type Measurement3dState = {
  isOn: boolean;
  available: boolean;
  panelOpen: boolean;
  count: number;
  /** The host shows another map view on top; the tool pauses meanwhile. */
  viewHidden: boolean;
  /** Experimental tools too, not only the finished ones. */
  showAllTools: boolean;
};

const MEASUREMENT3D_STATE_DEFAULT: Measurement3dState = Object.freeze({
  isOn: false,
  available: false,
  panelOpen: false,
  count: 0,
  viewHidden: false,
  showAllTools: false,
});

export const MEASUREMENT3D_STATE_STORAGE_KEY = "carma::measurement3d::state";

type StoredMeasurement3dState = Pick<Measurement3dState, "isOn">;

/** A launched tool survives a reload: only the on/off decision is stored. */
export const loadMeasurement3dState = (
  storageKey = MEASUREMENT3D_STATE_STORAGE_KEY
): StoredMeasurement3dState | null => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredMeasurement3dState>;
    return { isOn: parsed.isOn === true };
  } catch {
    return null;
  }
};

export const saveMeasurement3dState = (
  state: StoredMeasurement3dState,
  storageKey = MEASUREMENT3D_STATE_STORAGE_KEY
) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // storage may be unavailable; the session still runs
  }
};

const withDefaults = (state?: Measurement3dState): Measurement3dState => ({
  ...MEASUREMENT3D_STATE_DEFAULT,
  ...(state ?? {}),
});

/** Shared by the runtime, the row and the control, so all read one answer. */
export const useMeasurement3dActions = () => {
  const [state, setState] = useAddonState("measurement3d");
  const resolved = withDefaults(state);
  const patch = useCallback(
    <K extends keyof Measurement3dState>(
      key: K,
      value: Measurement3dState[K]
    ) =>
      setState((previous) => {
        const current = withDefaults(previous);
        return current[key] === value
          ? previous ?? current
          : { ...current, [key]: value };
      }),
    [setState]
  );
  const setOn = useCallback((isOn: boolean) => patch("isOn", isOn), [patch]);
  const toggle = useCallback(
    () =>
      setState((previous) => ({
        ...withDefaults(previous),
        isOn: !withDefaults(previous).isOn,
      })),
    [setState]
  );
  const endMode = useCallback(() => setOn(false), [setOn]);
  const setAvailable = useCallback(
    (available: boolean) => patch("available", available),
    [patch]
  );
  const setPanelOpen = useCallback(
    (panelOpen: boolean) => patch("panelOpen", panelOpen),
    [patch]
  );
  const setCount = useCallback(
    (count: number) => patch("count", count),
    [patch]
  );
  const setViewHidden = useCallback(
    (viewHidden: boolean) => patch("viewHidden", viewHidden),
    [patch]
  );
  const setShowAllTools = useCallback(
    (showAllTools: boolean) => patch("showAllTools", showAllTools),
    [patch]
  );
  return {
    ...resolved,
    setOn,
    toggle,
    endMode,
    setAvailable,
    setPanelOpen,
    setCount,
    setViewHidden,
    setShowAllTools,
  };
};
