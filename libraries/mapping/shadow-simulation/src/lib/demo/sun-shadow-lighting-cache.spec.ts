import {
  DirectionalLight,
  FloatType,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  Scene,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { describe, expect, it, vi } from "vitest";

import { createSunShadowLightingCache } from "./sun-shadow-lighting-cache";

describe("sun shadow lighting cache", () => {
  it.each([0, 1, 2])(
    "restores scene, light and target after pass failure %s",
    (failurePass) => {
      const scene = new Scene();
      const override = new MeshBasicMaterial();
      scene.overrideMaterial = override;
      const camera = new PerspectiveCamera();
      const light = new DirectionalLight(0xffffff, 3);
      light.castShadow = true;
      light.shadow.needsUpdate = true;
      const previousTarget = new WebGLRenderTarget(4, 4);
      let target = previousTarget;
      const captures: Array<{ target: WebGLRenderTarget; intensity: number }> =
        [];
      const renderer = {
        getRenderTarget: () => target,
        setRenderTarget: vi.fn((next: WebGLRenderTarget) => {
          target = next;
        }),
        clear: vi.fn(),
        render: vi.fn((renderedScene, renderedCamera) => {
          expect(renderedScene).toBe(scene);
          expect(renderedCamera).toBe(camera);
          expect(scene.overrideMaterial).toBeNull();
          expect(light.castShadow).toBe(false);
          captures.push({ target, intensity: light.intensity });
          light.shadow.needsUpdate = false;
          if (captures.length === failurePass)
            throw new Error("capture failed");
        }),
      };
      const cache = createSunShadowLightingCache(
        renderer as unknown as WebGLRenderer,
        scene,
        camera,
        light
      );
      if (failurePass)
        expect(() => cache.render(16, 8)).toThrow("capture failed");
      else cache.render(16, 8);
      expect(scene.overrideMaterial).toBe(override);
      expect(light.intensity).toBe(3);
      expect(light.castShadow).toBe(true);
      expect(light.shadow.needsUpdate).toBe(true);
      expect(target).toBe(previousTarget);
      expect(captures[0].intensity).toBe(3);
      expect(captures[0].target.texture).toBe(cache.lighting.unshadowed);
      if (failurePass !== 1) {
        expect(captures[1].intensity).toBe(0);
        expect(captures[1].target.texture).toBe(cache.lighting.indirect);
      }
      for (const capture of captures) {
        expect(capture.target.width).toBe(16);
        expect(capture.target.height).toBe(8);
        expect(capture.target.texture.type).toBe(FloatType);
        expect(capture.target.texture.minFilter).toBe(NearestFilter);
      }
      const disposeTarget = vi.spyOn(WebGLRenderTarget.prototype, "dispose");
      const disposeOverride = vi.spyOn(override, "dispose");
      cache.dispose();
      expect(disposeTarget).toHaveBeenCalledTimes(2);
      expect(
        disposeTarget.mock.instances.map((owned) => owned.texture)
      ).toEqual([cache.lighting.unshadowed, cache.lighting.indirect]);
      expect(disposeOverride).not.toHaveBeenCalled();
      disposeTarget.mockRestore();
      override.dispose();
      previousTarget.dispose();
    }
  );
});
