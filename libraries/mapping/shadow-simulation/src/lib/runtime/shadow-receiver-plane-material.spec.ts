import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  configureReceiverPlaneShadow,
  receiverPlaneShadowChunk,
} from "./shadow-receiver-plane-material";

describe("receiver-plane shadow material", () => {
  it("preserves stock PCF when disabled and compares texel centres with their own reference depth", () => {
    const chunk = receiverPlaneShadowChunk();
    expect(chunk).toContain("float carmaOriginalGetShadow( sampler2DShadow");
    expect(chunk).toContain(
      "if (!carmaReceiverPlaneShadow) return carmaOriginalGetShadow"
    );
    expect(chunk).toContain("dot(gradient, uv - receiver.xy)");
    expect(chunk).toContain(
      "vec2 halfTexel = vec2(0.5) / vec2(textureSize(map, 0))"
    );
    expect(chunk).toContain("uv = clamp(uv, halfTexel, vec2(1.0) - halfTexel)");
    expect(chunk.indexOf("uv = clamp(uv")).toBeLessThan(
      chunk.indexOf("dot(gradient, uv - receiver.xy)")
    );
    expect(chunk).toContain("(floor(pixel) + 0.5) / size");
    expect(chunk).toContain("#elif defined( SHADOWMAP_TYPE_VSM )");
  });
  it("chains the drape compile callback, reuses the uniform and never enables it by default", () => {
    const material = new THREE.MeshLambertMaterial();
    const before = vi.fn();
    material.onBeforeCompile = before;
    material.customProgramCacheKey = () => "drape-key";
    const flag = configureReceiverPlaneShadow(material);
    const version = material.version;
    expect(configureReceiverPlaneShadow(material)).toBe(flag);
    expect(material.version).toBe(version);
    expect(flag.value).toBe(false);
    const shader = {
      uniforms: {},
      fragmentShader: "#include <shadowmap_pars_fragment>",
    };
    material.onBeforeCompile(shader as never, {} as never);
    expect(before).toHaveBeenCalledOnce();
    expect(shader.uniforms).toMatchObject({ carmaReceiverPlaneShadow: flag });
    expect(material.customProgramCacheKey()).toBe(
      "drape-key|carma-receiver-plane-pcf-v3|stock"
    );
    configureReceiverPlaneShadow(material, true);
    expect(flag.value).toBe(true);
    expect(material.version).toBeGreaterThan(version);
    expect(material.customProgramCacheKey()).toBe(
      "drape-key|carma-receiver-plane-pcf-v3|mesh"
    );
    const enabledVersion = material.version;
    configureReceiverPlaneShadow(material, true);
    expect(material.version).toBe(enabledVersion);
    material.dispose();
  });
});
