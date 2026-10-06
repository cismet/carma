import { describe, expect, it } from "vitest";
import {
  buildOrderedSearchParamsString,
  getHashParams,
} from "@carma-commons/utils";
import type { Ratio } from "@carma-units";
import type { ObliquePreviewState } from "@carma-mapping/oblique-viewer";
import {
  obliquePreviewHashParams,
  parseObliquePreviewHash,
} from "./preview-state-hash";

const state: ObliquePreviewState = {
  seriesId: "2026",
  imageId: "RI_29_3398",
  panX: 0.125 as Ratio,
  panY: -0.25 as Ratio,
  zoom: 1.75 as Ratio,
};

describe("oblique preview hash", () => {
  it("round-trips source IDs through the common URLSearchParams routing codec", () => {
    const original = {
      ...state,
      seriesId: "2026 test / + & = # % ü",
      imageId: "RI/a+b?x=1&name=ä#part%20",
    };
    const hash = buildOrderedSearchParamsString({
      lat: 51.27,
      ...obliquePreviewHashParams(original),
    });
    const params = getHashParams(hash);
    expect(params.obs).toBe(original.seriesId);
    expect(params.obi).toBe(original.imageId);
    expect(params.lat).toBe("51.27");
    expect(parseObliquePreviewHash(params)).toEqual(original);
    expect(hash).not.toContain(original.imageId);
  });

  it("requires both source IDs and defaults an omitted window to centered 90 percent fit", () => {
    expect(parseObliquePreviewHash({ obs: "2024", obi: "image" })).toEqual({
      seriesId: "2024",
      imageId: "image",
      panX: 0,
      panY: 0,
      zoom: 0.9,
    });
    for (const invalid of [
      {},
      { obs: "2024" },
      { obi: "image" },
      { obs: "", obi: "image" },
      { obs: "2024", obi: "" },
      { obs: "s".repeat(257), obi: "image" },
      { obs: "2024", obi: "i".repeat(2049) },
    ]) {
      expect(parseObliquePreviewHash(invalid)).toBeNull();
    }
    expect(
      parseObliquePreviewHash({ obs: "s".repeat(256), obi: "i".repeat(2048) })
    ).not.toBeNull();
  });

  it("rejects nonfinite and out-of-bounds ratios", () => {
    const valid = { obs: "2026", obi: "image", obx: "0", oby: "0", obz: "0.9" };
    for (const key of ["obx", "oby", "obz"]) {
      for (const invalid of ["NaN", "Infinity", "-Infinity", "invalid"]) {
        expect(
          parseObliquePreviewHash({ ...valid, [key]: invalid })
        ).toBeNull();
      }
    }
    for (const key of ["obx", "oby"]) {
      for (const invalid of ["2.00000001", "-2.00000001"]) {
        expect(
          parseObliquePreviewHash({ ...valid, [key]: invalid })
        ).toBeNull();
      }
    }
    for (const obz of ["0", "-1", "1024.00000001", ""]) {
      expect(parseObliquePreviewHash({ ...valid, obz })).toBeNull();
    }
  });

  it("accepts finite inclusive pan bounds and positive zoom through 1024", () => {
    expect(
      parseObliquePreviewHash({
        obs: "2026",
        obi: "image",
        obx: "-2",
        oby: "2",
        obz: "1024",
      })
    ).toEqual({
      seriesId: "2026",
      imageId: "image",
      panX: -2,
      panY: 2,
      zoom: 1024,
    });
    expect(
      parseObliquePreviewHash({ obs: "2026", obi: "image", obz: "0.00000001" })
        ?.zoom
    ).toBe(0.00000001);
  });

  it("removes all preview keys on close while retaining normal map parameters", () => {
    const removed = obliquePreviewHashParams(null);
    expect(removed).toEqual({
      obs: undefined,
      obi: undefined,
      obx: undefined,
      oby: undefined,
      obz: undefined,
    });
    const hash = buildOrderedSearchParamsString({
      lat: 51.27,
      lng: 7.2,
      ...obliquePreviewHashParams(state),
      ...removed,
    });
    expect(getHashParams(hash)).toEqual({ lat: "51.27", lng: "7.2" });
    expect(parseObliquePreviewHash(getHashParams(hash))).toBeNull();
  });

  it("keeps eight fractional digits without redundant zeros or negative zero", () => {
    const precise = {
      ...state,
      panX: 0.123456789 as Ratio,
      panY: -0.987654321 as Ratio,
      zoom: 1.123456789 as Ratio,
    };
    const params = obliquePreviewHashParams(precise);
    expect(params).toMatchObject({
      obx: "0.12345679",
      oby: "-0.98765432",
      obz: "1.12345679",
    });
    const parsed = parseObliquePreviewHash(
      getHashParams(buildOrderedSearchParamsString(params))
    )!;
    for (const key of ["panX", "panY", "zoom"] as const)
      expect(Math.abs(parsed[key] - precise[key])).toBeLessThanOrEqual(5e-9);
    expect(
      obliquePreviewHashParams({
        ...state,
        panX: -0 as Ratio,
        zoom: 2 as Ratio,
      })
    ).toMatchObject({ obx: "0", obz: "2" });
  });
});
