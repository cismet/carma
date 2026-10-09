import { afterEach, describe, expect, it } from "vitest";
import {
  MEASUREMENT3D_STATE_STORAGE_KEY,
  loadMeasurement3dState,
  saveMeasurement3dState,
} from "./measurement3d-state";

describe("measurement3d state mirror", () => {
  afterEach(() => {
    window.localStorage.removeItem(MEASUREMENT3D_STATE_STORAGE_KEY);
  });

  it("round-trips the on/off decision", () => {
    saveMeasurement3dState({ isOn: true });
    expect(loadMeasurement3dState()).toEqual({ isOn: true });
    saveMeasurement3dState({ isOn: false });
    expect(loadMeasurement3dState()).toEqual({ isOn: false });
  });

  it("reads nothing without a stored state", () => {
    expect(loadMeasurement3dState()).toBeNull();
  });

  it("ignores a broken record", () => {
    window.localStorage.setItem(MEASUREMENT3D_STATE_STORAGE_KEY, "{nope");
    expect(loadMeasurement3dState()).toBeNull();
  });
});
