import { describe, expect, it } from "vitest";

import {
  AREA_OCCLUSION_STYLE_DEFAULTS,
  resolveAreaOcclusionLineRenderOptions,
  resolveAreaOcclusionStyleOptions,
  resolveAreaOverlayFillColor,
} from "./area-occlusion-style-options";

describe("area occlusion style options", () => {
  it("merges partial app options with the provided defaults", () => {
    expect(
      resolveAreaOcclusionStyleOptions(
        {
          fill: {
            overlay: true,
          },
          line: {
            overlayDashed: false,
          },
        },
        {
          ...AREA_OCCLUSION_STYLE_DEFAULTS,
          fill: {
            overlay: false,
            overlayAlphaMultiplier: 0.25,
          },
          line: {
            overlayDashed: true,
          },
        }
      )
    ).toEqual({
      fill: {
        overlay: true,
        overlayAlphaMultiplier: 0.25,
      },
      line: {
        overlayDashed: false,
      },
    });
  });

  it("applies the overlay alpha multiplier to rgba fill colors", () => {
    expect(
      resolveAreaOverlayFillColor(
        "rgba(10, 20, 30, 0.4)",
        resolveAreaOcclusionStyleOptions({
          fill: {
            overlayAlphaMultiplier: 0.5,
          },
        })
      )
    ).toBe("rgba(10,20,30,0.2)");
  });

  it("resolves overlay-only line render flags independently from fill placement", () => {
    const options = resolveAreaOcclusionStyleOptions({
      line: {
        overlayDashed: true,
      },
    });

    expect(resolveAreaOcclusionLineRenderOptions(options)).toEqual({
      overlayDashed: true,
    });
  });
});
