import { useCallback } from "react";
import { useAddonState } from "../../lib/AddonStateContext";

/**
 * The 3D measurement channel: whether the tool is on, whether the map can
 * host it (a mesh or tileset is drawn through the Three.js layer), whether
 * its ribbon is open, and how many measurements it holds. The row, the
 * control-column button and the host app all read this one answer.
 */
export type Measurement3dState = {
  isOn: boolean;
  available: boolean;
  panelOpen: boolean;
  count: number;
};

export const MEASUREMENT3D_STATE_DEFAULT: Measurement3dState = Object.freeze({
  isOn: false,
  available: false,
  panelOpen: false,
  count: 0,
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
  const setOn = useCallback(
    (isOn: boolean) =>
      setState((previous) =>
        withDefaults(previous).isOn === isOn
          ? previous ?? withDefaults(previous)
          : { ...withDefaults(previous), isOn }
      ),
    [setState]
  );
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
    (available: boolean) =>
      setState((previous) =>
        withDefaults(previous).available === available
          ? previous ?? withDefaults(previous)
          : { ...withDefaults(previous), available }
      ),
    [setState]
  );
  const setPanelOpen = useCallback(
    (panelOpen: boolean) =>
      setState((previous) =>
        withDefaults(previous).panelOpen === panelOpen
          ? previous ?? withDefaults(previous)
          : { ...withDefaults(previous), panelOpen }
      ),
    [setState]
  );
  const setCount = useCallback(
    (count: number) =>
      setState((previous) =>
        withDefaults(previous).count === count
          ? previous ?? withDefaults(previous)
          : { ...withDefaults(previous), count }
      ),
    [setState]
  );
  return {
    isOn: resolved.isOn,
    available: resolved.available,
    panelOpen: resolved.panelOpen,
    count: resolved.count,
    setOn,
    toggle,
    endMode,
    setAvailable,
    setPanelOpen,
    setCount,
  };
};
