import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma/units/helpers";
import { decodeViewState, encodeViewState } from "./codec";
import type { ViewState } from "./types";

const toRad = (deg: number) => degToRadNumeric(deg)!;

describe("carmaHash codec", () => {
  it("encodes and decodes camera hash snapshots", () => {
    const bearingRad = toRad(201.25);
    const pitchRad = toRad(-57.8);
    const rollRad = toRad(0);
    const fovVerticalRad = toRad(52.5);
    const viewState: ViewState = {
      longitude: toRad(7.1543214) as ViewState["longitude"],
      latitude: toRad(51.2567891) as ViewState["latitude"],
      altitude: 432.12 as ViewState["altitude"],
      bearing: bearingRad as ViewState["bearing"],
      pitch: pitchRad as ViewState["pitch"],
      roll: rollRad as NonNullable<ViewState["roll"]>,
      fovVertical: fovVerticalRad as NonNullable<ViewState["fovVertical"]>,
      range: 321.45 as ViewState["range"],
    };

    const encoded = encodeViewState(viewState);

    const decoded = decodeViewState(encoded);
    expect(decoded).not.toBeUndefined();
    expect(decoded!.longitude).toBeCloseTo(viewState.longitude, 7);
    expect(decoded!.latitude).toBeCloseTo(viewState.latitude, 7);
    expect(decoded!.altitude).toBeCloseTo(viewState.altitude, 7);
    expect(decoded!.bearing).toBeCloseTo(bearingRad, 7);
    expect(decoded!.pitch).toBeCloseTo(pitchRad, 7);
    expect(decoded!.roll).toBeCloseTo(rollRad, 7);
    expect(decoded!.fovVertical).toBeCloseTo(fovVerticalRad, 7);
    expect(decoded!.range).toBe(321.45);
  });
});
