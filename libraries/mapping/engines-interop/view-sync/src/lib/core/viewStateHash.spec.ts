import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma/units/helpers";
import type { ViewState } from "./types";
import { readViewStateHashNumber } from "./viewStateHash";
import {
  readHashParamsFromViewState,
  readViewStateFromHashValues,
} from "../adapters/maplibreAdapter";

const asRadians = (value: number) =>
  degToRadNumeric(value)! as ViewState["bearing"];
const asMeters = (value: number) => value as ViewState["range"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const make2dViewState = (overrides: Partial<ViewState> = {}): ViewState => ({
  longitude: asRadians(7.2018253),
  latitude: asRadians(51.2720217),
  altitude: asMeters(165.14),
  zoom: 15.001,
  bearing: asRadians(0),
  pitch: asRadians(0),
  range: asMeters(750),
  ...overrides,
});

// ---------------------------------------------------------------------------
// readViewStateHashNumber
// ---------------------------------------------------------------------------

describe("readViewStateHashNumber", () => {
  it("returns finite numbers as-is", () => {
    expect(readViewStateHashNumber(42)).toBe(42);
    expect(readViewStateHashNumber(0)).toBe(0);
    expect(readViewStateHashNumber(-3.14)).toBe(-3.14);
  });

  it("parses numeric strings", () => {
    expect(readViewStateHashNumber("16.991")).toBeCloseTo(16.991, 6);
    expect(readViewStateHashNumber("0")).toBe(0);
  });

  it("returns undefined for non-numeric values", () => {
    expect(readViewStateHashNumber(undefined)).toBeUndefined();
    expect(readViewStateHashNumber(null)).toBeUndefined();
    expect(readViewStateHashNumber("abc")).toBeUndefined();
    expect(readViewStateHashNumber(NaN)).toBeUndefined();
    expect(readViewStateHashNumber(Infinity)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// readHashParamsFromViewState / readViewStateFromHashValues
// ---------------------------------------------------------------------------

describe("readHashParamsFromViewState", () => {
  it("encodes lat/lng/zoom from a 2D view state", () => {
    const params = readHashParamsFromViewState(make2dViewState());
    expect(params.lat).toBeCloseTo(51.2720217, 5);
    expect(params.lng).toBeCloseTo(7.2018253, 5);
    expect(params.zoom).toBeCloseTo(15.001, 2);
  });

  it("omits bearing when zero", () => {
    const params = readHashParamsFromViewState(
      make2dViewState({ bearing: asRadians(0) })
    );
    expect(params.bearing).toBeUndefined();
  });

  it("omits bearing when it wraps to 360 degrees", () => {
    const params = readHashParamsFromViewState(
      make2dViewState({ bearing: asRadians(360) })
    );
    expect(params.bearing).toBeUndefined();
  });

  it("omits bearing when it is numerically just below 360 degrees", () => {
    const params = readHashParamsFromViewState(
      make2dViewState({ bearing: asRadians(359.999999) })
    );
    expect(params.bearing).toBeUndefined();
  });

  it("writes bearing when non-zero", () => {
    const params = readHashParamsFromViewState(
      make2dViewState({ bearing: asRadians(45) })
    );
    expect(params.bearing).toBeCloseTo(45, 1);
  });

  it("omits pitch when zero", () => {
    const params = readHashParamsFromViewState(
      make2dViewState({ pitch: asRadians(0) })
    );
    expect(params.pitch).toBeUndefined();
  });

  it("omits pitch when it is below hash precision and would round to zero", () => {
    const params = readHashParamsFromViewState(
      make2dViewState({ pitch: asRadians(0.009) })
    );
    expect(params.pitch).toBeUndefined();
  });

  it("writes pitch when non-zero", () => {
    const params = readHashParamsFromViewState(
      make2dViewState({ pitch: asRadians(30) })
    );
    expect(params.pitch).toBeCloseTo(30, 1);
  });

  it("omits roll when undefined", () => {
    const params = readHashParamsFromViewState(
      make2dViewState({ roll: undefined })
    );
    expect(params.roll).toBeUndefined();
  });
});

describe("readViewStateFromHashValues", () => {
  it("returns null for incomplete hash values", () => {
    expect(readViewStateFromHashValues({ lng: 7.2 })).toBeNull();
  });

  it("decodes lat/lng/zoom into a ViewState", () => {
    const viewState = readViewStateFromHashValues({
      lat: 51.2720217,
      lng: 7.2018253,
      zoom: 15.001,
      altitude: 165.14,
    });

    expect(viewState).not.toBeNull();
    expect(viewState?.zoom).toBeCloseTo(15.001, 2);
    const lngDeg = (viewState!.longitude * 180) / Math.PI;
    const latDeg = (viewState!.latitude * 180) / Math.PI;
    expect(lngDeg).toBeCloseTo(7.2018253, 5);
    expect(latDeg).toBeCloseTo(51.2720217, 5);
  });

  it("decodes bearing and pitch", () => {
    const viewState = readViewStateFromHashValues({
      lat: 51.2643569,
      lng: 7.140041,
      zoom: 15.991,
      bearing: 311.1,
      pitch: 52.78,
      altitude: 188.57,
    });

    expect(viewState).not.toBeNull();
    expect(viewState?.bearing).toBeCloseTo(asRadians(311.1), 3);
    expect(viewState?.pitch).toBeCloseTo(asRadians(52.78), 3);
  });

  it("round-trips a 2D view state through encode/decode", () => {
    const original = make2dViewState();
    const encoded = readHashParamsFromViewState(original);
    const decoded = readViewStateFromHashValues(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.longitude).toBeCloseTo(original.longitude, 5);
    expect(decoded!.latitude).toBeCloseTo(original.latitude, 5);
    expect(decoded!.zoom).toBeCloseTo(original.zoom!, 2);
  });

  it("round-trips bearing and pitch", () => {
    const original = make2dViewState({
      bearing: asRadians(135),
      pitch: asRadians(45),
    });
    const encoded = readHashParamsFromViewState(original);
    const decoded = readViewStateFromHashValues(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.bearing).toBeCloseTo(original.bearing, 3);
    expect(decoded!.pitch).toBeCloseTo(original.pitch, 3);
  });
});
