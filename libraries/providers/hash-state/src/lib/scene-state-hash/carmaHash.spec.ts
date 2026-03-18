import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma/units/helpers";
import { decodeSceneViewState, encodeSceneViewState } from "./codec";

const toRad = (deg: number) => degToRadNumeric(deg)!;

describe("carmaHash codec", () => {
  it("encodes and decodes camera hash snapshots", () => {
    const bearingRad = toRad(201.25);
    const pitchRad = toRad(-57.8);
    const rollRad = toRad(0);
    const fovVerticalRad = toRad(52.5);

    const encoded = encodeSceneViewState({
      anchor: {
        lngDeg: 7.1543214,
        latDeg: 51.2567891,
        heightM: 432.12,
      },
      orientation: {
        bearingRad,
        pitchRad,
        rollRad,
        fovVerticalRad,
        rangeM: 321.45,
      },
    });

    const decoded = decodeSceneViewState(encoded);
    expect(decoded).not.toBeUndefined();
    expect(decoded!.anchor).toEqual({
      lngDeg: 7.1543214,
      latDeg: 51.2567891,
      heightM: 432.12,
    });
    expect(decoded!.orientation.bearingRad).toBeCloseTo(bearingRad, 7);
    expect(decoded!.orientation.pitchRad).toBeCloseTo(pitchRad, 7);
    expect(decoded!.orientation.rollRad).toBeCloseTo(rollRad, 7);
    expect(decoded!.orientation.fovVerticalRad).toBeCloseTo(fovVerticalRad, 7);
    expect(decoded!.orientation.rangeM).toBe(321.45);
  });
});
