import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { buildSharedThreeSceneLayer } from "./shared-three-scene-layer";

describe("shared Three.js scene layer", () => {
  it("exposes attached roots and reports visible shadeable content", () => {
    const onContentChange = vi.fn();
    const layer = buildSharedThreeSceneLayer("shared-three-scene", {
      onContentChange,
    });
    const root = new THREE.Group();
    const dispose = vi.fn();

    layer.addRuntime({
      id: "mesh-runtime",
      originLngLat: [7.15, 51.25],
      root,
      supportsShadows: true,
      update: vi.fn(),
      dispose,
    });

    expect(layer.getScene().children).toContain(root);
    expect(layer.hasRuntime("mesh-runtime")).toBe(true);
    expect(layer.hasShadeableContent()).toBe(true);
    expect(onContentChange).toHaveBeenCalledOnce();

    root.visible = false;
    expect(layer.hasShadeableContent()).toBe(false);

    layer.removeRuntime("mesh-runtime");

    expect(layer.getScene().children).not.toContain(root);
    expect(dispose).toHaveBeenCalledOnce();
    expect(onContentChange).toHaveBeenCalledTimes(2);
  });
});
