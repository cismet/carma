import type { Measurement3dState } from "./measurement3d-state";

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
