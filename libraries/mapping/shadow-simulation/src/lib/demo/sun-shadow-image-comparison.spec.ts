import { describe, expect, it } from "vitest";

import { compareSunShadowLinearImages } from "./sun-shadow-image-comparison";
import { createShadowVisibilityMaterial } from "../runtime/shadow-visibility-material";

describe("sun shadow precision diagnostics", () => {
  it("detects clipped HDR samples before tone mapping", () => {
    const result = compareSunShadowLinearImages(
      new Float32Array([1, 1, 0.5, 1]),
      new Float32Array([4, 2, 0.5, 1])
    );
    expect(result.maxAbsolute).toBe(3);
    expect(result.rmsAbsolute).toBeCloseTo(Math.sqrt(10 / 3));
    expect(result.referencePeak).toBe(4);
  });
  it("rejects absent and mismatched reference pixels", () => {
    expect(() =>
      compareSunShadowLinearImages(new Float32Array(4), new Float32Array(0))
    ).toThrow();
    expect(() =>
      compareSunShadowLinearImages(new Float32Array(4), new Float32Array(4))
    ).toThrow("Empty");
  });
  it("reuses Three's shadow queries and writes untonemapped visibility", () => {
    const material = createShadowVisibilityMaterial();
    expect(material.fragmentShader).toContain(
      "vec4(vec3(getShadowMask()), 1.0)"
    );
    expect(material.fragmentShader).toContain(
      "#include <shadowmask_pars_fragment>"
    );
    expect(material.fragmentShader).not.toContain(
      "#include <tonemapping_fragment>"
    );
    expect(material.lights).toBe(true);
    expect(material.toneMapped).toBe(false);
    material.dispose();
  });
});
