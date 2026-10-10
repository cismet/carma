import { describe, expect, it } from "vitest";
import { degToRadNumeric, radToDegNumeric, type Radians } from "@carma-units";
import type {
  ObliqueCameraCalibration,
  ObliqueDataset,
  ObliquePitchSummary,
} from "../types";
import { getBrowsingPitchDeg } from "./browsing-pitch";
import { imageCenterPitchOffsetRad } from "./calibration";
import { CardinalDirectionEnum as Direction } from "./orientation";

const total = (pitchDeg: number, imageCount: number): ObliquePitchSummary => ({
  pitchSumRad: (degToRadNumeric(pitchDeg) * imageCount) as Radians,
  imageCount,
});
const series = (id: string) => ({ id, pitchDeg: 45 } as ObliqueDataset);

describe("directional browsing pitch", () => {
  it("weights enabled image counts in the requested world sector and wraps bearings", () => {
    const data = {
      obliquePitchByDirectionBySeries: new Map([
        [
          "2024",
          new Map([
            [Direction.North, total(40, 3)],
            [Direction.East, total(38, 2)],
          ]),
        ],
        [
          "2026",
          new Map([
            [Direction.North, total(44, 1)],
            [Direction.East, total(46, 2)],
          ]),
        ],
        ["disabled", new Map([[Direction.North, total(80, 1000)]])],
      ]),
    };
    const enabled = [series("2024"), series("2026")];
    for (const bearing of [325, -35, 685])
      expect(getBrowsingPitchDeg(data, enabled, bearing, 45)).toBeCloseTo(41);
    expect(getBrowsingPitchDeg(data, enabled, 55, 45)).toBeCloseTo(42);
    expect(getBrowsingPitchDeg(data, [series("2026")], 325, 45)).toBeCloseTo(
      44
    );
  });

  it("uses manifest group calibration on startup by world heading rather than export label", () => {
    const configured = {
      ...series("2026"),
      directionalCatalogs: [
        {
          sector: "W",
          meanHeadingRad: degToRadNumeric(325),
          obliquePitch: total(43.2, 80),
        },
        {
          sector: "N",
          meanHeadingRad: degToRadNumeric(55),
          obliquePitch: total(44.1, 40),
        },
        {
          sector: "nadir",
          meanHeadingRad: degToRadNumeric(325),
          obliquePitch: total(1, 10000),
        },
      ],
    } as ObliqueDataset;
    expect(getBrowsingPitchDeg(null, [configured], 325, 45)).toBeCloseTo(43.2);
    expect(getBrowsingPitchDeg(null, [configured], 55, 45)).toBeCloseTo(44.1);
    const loaded = {
      obliquePitchByDirectionBySeries: new Map([
        [configured.id, new Map([[Direction.North, total(43.3, 5)]])],
      ]),
    };
    expect(getBrowsingPitchDeg(loaded, [configured], 325, 45)).toBeCloseTo(
      43.3
    );
  });

  it("retains measured legacy series means only when no directional evidence is available", () => {
    const data = {
      obliquePitchBySeries: new Map([
        ["2024", total(41.9, 2)],
        ["disabled", total(80, 1000)],
      ]),
    };
    expect(getBrowsingPitchDeg(data, [series("2024")], 235, 45)).toBeCloseTo(
      41.9
    );
    expect(getBrowsingPitchDeg(data, [], 235, 45)).toBe(45);
  });

  it("does not admit invalid or empty calibration totals", () => {
    const data = {
      obliquePitchByDirectionBySeries: new Map([
        [
          "2026",
          new Map([
            [Direction.North, { pitchSumRad: NaN as Radians, imageCount: 2 }],
          ]),
        ],
      ]),
    };
    expect(getBrowsingPitchDeg(data, [series("2026")], 325, 42)).toBe(42);
  });

  // Published 2026 calibrations: the left/right sensors are shifted 3203 px.
  const shiftedRight = {
    widthPx: 12736,
    heightPx: 19136,
    focalLengthMm: 124,
    imageMmToPixelAffine: [
      [355.871886121, 0, 6367.5],
      [0, -355.871886121, 6364.653],
    ],
    principalPointPx: [6367.5, 6364.653],
    halfFovTan: 0.21682322580644944,
    imageUpInCamera: [0, 1, 0],
    view: "right",
  } as unknown as ObliqueCameraCalibration;
  const centredFront = {
    ...shiftedRight,
    widthPx: 19136,
    heightPx: 12736,
    imageMmToPixelAffine: [
      [355.871886121, 0, 9567.5],
      [0, -355.871886121, 6367.5],
    ],
    principalPointPx: [9567.5, 6367.5],
    view: "front",
  } as unknown as ObliqueCameraCalibration;

  it("browses at the image-centre pitch of shifted sensors, not their axes", () => {
    expect(
      radToDegNumeric(imageCenterPitchOffsetRad(shiftedRight))
    ).toBeCloseTo(-4.15, 2);
    expect(imageCenterPitchOffsetRad(centredFront)).toBeCloseTo(0, 9);
    const dataset = {
      ...series("2026"),
      cameras: { RI: shiftedRight, FW: centredFront },
      directionalCatalogs: [
        {
          sector: "N",
          cameraIds: ["RI"],
          meanHeadingRad: degToRadNumeric(325),
          obliquePitch: total(45, 100),
        },
        {
          sector: "E",
          cameraIds: ["FW"],
          meanHeadingRad: degToRadNumeric(55),
          obliquePitch: total(45, 100),
        },
      ],
    } as unknown as ObliqueDataset;
    expect(getBrowsingPitchDeg(null, [dataset], 325, 45)).toBeCloseTo(40.85, 2);
    expect(getBrowsingPitchDeg(null, [dataset], 55, 45)).toBeCloseTo(45, 6);
  });
});
