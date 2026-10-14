import { describe, expect, it } from "vitest";
import { CustomBlending, MinEquation, type WebGLRenderer } from "three";
import {
  SCENE_DARKEN_GLSL,
  createLineHaloMaterial,
} from "./maplibre-scene-line-materials";
import {
  createMarkerMaterial,
  createMarkerUniforms,
} from "./maplibre-scene-marker-material";
import { MAPLIBRE_SCENE_LINE_DEFAULTS } from "./maplibre-scene-defaults";

// Evaluate the actual shared scalar GLSL expression; blending itself remains a GPU browser gate.
const shadeAt = (strength: number): number => {
  const expression = SCENE_DARKEN_GLSL.match(/return\s+([^;]+);/)?.[1];
  if (!expression) throw new Error("Missing scene shade expression");
  return new Function("strength", "clamp", "return " + expression)(
    strength,
    (value: number, low: number, high: number) =>
      Math.max(low, Math.min(high, value))
  );
};

describe("common faint scene darkening", () => {
  it("caps white at faint grey, leaves medium grey unchanged and cannot accumulate", () => {
    expect(MAPLIBRE_SCENE_LINE_DEFAULTS.haloDarkness).toBe(0.9);
    for (const strength of [0, 0.25, 0.5, 1, 2]) {
      const shade = shadeAt(strength);
      expect(shade).toBeGreaterThanOrEqual(0.9);
      expect(shade).toBeLessThanOrEqual(1);
      const once = Math.min(1, shade);
      expect(Math.min(once, shade, shade)).toBe(once);
      expect(Math.min(0.5, shade)).toBe(0.5);
    }
    expect(shadeAt(1)).toBe(0.9);
    expect(shadeAt(0)).toBe(1);
  });

  it("injects the same screen-space shader and Min blend into node and line backdrops", () => {
    const line = createLineHaloMaterial();
    const uniforms = createMarkerUniforms();
    const node = createMarkerMaterial(uniforms, true);
    const foreground = createMarkerMaterial(uniforms);
    const shader = {
      uniforms: {},
      vertexShader: line.vertexShader,
      fragmentShader: line.fragmentShader,
    };
    line.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.fragmentShader).toContain(SCENE_DARKEN_GLSL);
    expect(shader.fragmentShader).toContain(
      "sceneDarkenShade( strength * opacity )"
    );
    expect(node.fragmentShader).toContain(SCENE_DARKEN_GLSL);
    expect(node.fragmentShader).toContain("sceneDarkenShade( ( 1.0 - fade )");
    for (const material of [line, node]) {
      expect(material.blending).toBe(CustomBlending);
      expect(material.blendEquation).toBe(MinEquation);
      expect(material.depthWrite).toBe(false);
    }
    expect(node.uniforms).toBe(foreground.uniforms);
    expect(node.defines.MARKER_DARKEN_PASS).toBe(1);
    expect(foreground.defines.MARKER_DARKEN_PASS).toBeUndefined();
    expect(foreground.blending).not.toBe(CustomBlending);
    line.dispose();
    node.dispose();
    foreground.dispose();
  });

  it("replaces only the black soft ring while preserving white rings and foreground colours", () => {
    const foreground = createMarkerMaterial(createMarkerUniforms());
    const guard = foreground.fragmentShader.match(
      /bool oldShadow = ([^;]+);/
    )?.[1];
    expect(guard).toBeDefined();
    const isReplaced = (soft: number, rgb: number[]) =>
      new Function("vMarkerLook", "vMarkerRing", "dot", "return " + guard)(
        { x: soft },
        { rgb },
        (a: number[], b: number[]) =>
          a.reduce((sum, v, i) => sum + v * b[i]!, 0)
      );
    expect(isReplaced(1, [0, 0, 0])).toBe(true);
    expect(isReplaced(1, [1, 1, 1])).toBe(false);
    expect(isReplaced(0, [0, 0, 0])).toBe(false);
    expect(foreground.fragmentShader).toContain(
      "ringWidth > 0.0 && !oldShadow"
    );
    expect(foreground.fragmentShader).toContain(
      "#include <colorspace_fragment>"
    );
    foreground.dispose();
  });
  it("discards invisible styles and keeps a transparent outlined centre free of black alpha", () => {
    const backdrop = createMarkerMaterial(createMarkerUniforms(), true);
    const invisible = backdrop.fragmentShader.match(
      /if \( (vMarkerLook\.z[^;]+) \) discard;/
    )?.[1];
    expect(invisible).toBeDefined();
    const discard = (
      opacity: number,
      fillAlpha: number,
      outlineAlpha: number
    ) =>
      new Function(
        "vMarkerLook",
        "vMarkerFill",
        "vMarkerOutline",
        "max",
        "return " + invisible
      )({ z: opacity }, { a: fillAlpha }, { a: outlineAlpha }, Math.max);
    expect(discard(0, 1, 1)).toBe(true);
    expect(discard(1, 0, 0)).toBe(true);
    expect(discard(1, 0, 0.92)).toBe(false);
    const band = backdrop.fragmentShader.match(
      /float bandDistance = ([^;]+);/
    )?.[1];
    expect(band).toBeDefined();
    const distance = (distanceToCore: number) =>
      new Function(
        "outlined",
        "vMarkerFill",
        "distanceToCore",
        "radius",
        "outlineWidth",
        "abs",
        "max",
        "return " + band
      )(true, { a: 0 }, distanceToCore, 5, 1, Math.abs, Math.max);
    expect(distance(0)).toBe(4);
    expect(distance(4.5)).toBe(0);
    expect(shadeAt((1 - distance(0) / 10) ** 2)).toBeGreaterThan(shadeAt(1));
    backdrop.dispose();
  });
  it("includes the actual shader hook in the program cache identity", () => {
    const material = createLineHaloMaterial();
    const before = material.customProgramCacheKey();
    expect(before).toContain(SCENE_DARKEN_GLSL);
    expect(before).toContain(material.onBeforeCompile.toString());
    material.onBeforeCompile = () => undefined;
    expect(material.customProgramCacheKey()).not.toBe(before);
    material.dispose();
  });
});
