import { describe, expect, it } from "vitest";

import {
  buildPointCloudMicroCorrectionsDocument,
  parsePointCloudMicroCorrections,
} from "./pointCloudMicroCorrections";

describe("point-cloud micro-corrections", () => {
  it("round-trips all allowed ENU translations", () => {
    const corrections = {
      awg: { offsetEast: 1.25, offsetNorth: -2.5, offsetUp: 0.125 },
      mls: { offsetEast: 0, offsetNorth: 0.75, offsetUp: -0.5 },
    };
    const document = buildPointCloudMicroCorrectionsDocument(corrections, {
      awg: {
        label: "AWG 2",
        artifact: "/pointclouds/awg.copc.laz",
        sourceTag: "Fraunhofer",
        acquiredOn: null,
      },
    });

    expect(
      parsePointCloudMicroCorrections(
        JSON.stringify(document),
        new Set(["awg", "mls"])
      )
    ).toEqual(corrections);
    expect(document.clouds.awg.label).toBe("AWG 2");
    expect(document.clouds.awg.sourceTag).toBe("Fraunhofer");
    expect(document.clouds.awg.acquiredOn).toBeNull();
  });

  it("rejects unknown clouds, invalid numbers and incompatible documents", () => {
    const document = buildPointCloudMicroCorrectionsDocument({
      awg: { offsetEast: 1, offsetNorth: 2, offsetUp: 3 },
      unknown: { offsetEast: 4, offsetNorth: 5, offsetUp: 6 },
    });
    document.clouds.awg.translationEnuMeters.up = Number.NaN;

    expect(
      parsePointCloudMicroCorrections(
        JSON.stringify(document),
        new Set(["awg"])
      )
    ).toEqual({});
    expect(
      parsePointCloudMicroCorrections(
        JSON.stringify({ ...document, version: 2 }),
        new Set(["awg"])
      )
    ).toEqual({});
  });
});
