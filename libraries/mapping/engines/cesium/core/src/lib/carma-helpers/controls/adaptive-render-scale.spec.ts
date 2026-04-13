import { describe, expect, it } from "vitest";

import {
  DEFAULT_CESIUM_ADAPTIVE_RENDER_SCALE_STEPS,
  quantizeCesiumAdaptiveRenderScale,
  readCesiumAdaptiveRenderScaleTarget,
  readNextCesiumAdaptiveRenderScaleStep,
} from "./adaptive-render-scale";
describe("adaptive render scale", () => {
  it("derives a smaller target scale for larger pixel budgets", () => {
    expect(
      readCesiumAdaptiveRenderScaleTarget({
        basePixelCountAtScaleOne: 1920 * 1080,
        pixelsPerMsEstimate: 60000,
        targetFps: 60,
      })
    ).toBeCloseTo(0.6944, 3);

    expect(
      readCesiumAdaptiveRenderScaleTarget({
        basePixelCountAtScaleOne: 960 * 540,
        pixelsPerMsEstimate: 60000,
        targetFps: 60,
      })
    ).toBeCloseTo(1, 8);
  });

  it("quantizes conservatively to supported downscale steps", () => {
    expect(
      quantizeCesiumAdaptiveRenderScale({
        targetScale: 0.78,
        scaleSteps: DEFAULT_CESIUM_ADAPTIVE_RENDER_SCALE_STEPS,
        mode: "down",
      })
    ).toBeCloseTo(0.75, 8);

    expect(
      quantizeCesiumAdaptiveRenderScale({
        targetScale: 0.78,
        scaleSteps: DEFAULT_CESIUM_ADAPTIVE_RENDER_SCALE_STEPS,
        mode: "up",
      })
    ).toBeCloseTo(0.875, 8);
  });

  it("walks supported render-scale steps without inventing intermediate ratios", () => {
    expect(
      readNextCesiumAdaptiveRenderScaleStep({
        currentScale: 1,
        direction: "down",
      })
    ).toBeCloseTo(0.875, 8);

    expect(
      readNextCesiumAdaptiveRenderScaleStep({
        currentScale: 0.75,
        direction: "down",
      })
    ).toBeCloseTo(2 / 3, 8);

    expect(
      readNextCesiumAdaptiveRenderScaleStep({
        currentScale: 0.625,
        direction: "up",
      })
    ).toBeCloseTo(2 / 3, 8);
  });
});
