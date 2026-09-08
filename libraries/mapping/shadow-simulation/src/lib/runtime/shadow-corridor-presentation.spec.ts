import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { ShadowCorridorPresentation } from "./shadow-corridor-presentation";

const fixture = () => {
  const host = new THREE.WebGLRenderTarget(32, 32);
  const renderer = {
    getRenderTarget: () => host,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: vi.fn(),
    initRenderTarget: vi.fn(),
    copyTextureToTexture: vi.fn(),
    autoClear: true,
    getViewport: (out: THREE.Vector4) => out.set(0, 0, 32, 32),
    getScissor: (out: THREE.Vector4) => out.set(0, 0, 32, 32),
    getScissorTest: () => false,
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    render: vi.fn(),
  };
  const presentation = new ShadowCorridorPresentation(
    renderer as unknown as THREE.WebGLRenderer
  );
  const color = new THREE.WebGLRenderTarget(32, 32, { type: THREE.FloatType });
  const reference = new THREE.WebGLRenderTarget(32, 32, {
    depthTexture: new THREE.DepthTexture(32, 32, THREE.UnsignedIntType),
  });
  const camera = new THREE.PerspectiveCamera();
  const pages = [
    {
      id: "a",
      revision: "sun-casters-resolution",
      screenBounds: new THREE.Vector4(0, 0, 1, 1),
      receiverBounds: new THREE.Box3(
        new THREE.Vector3(-10, -10, -10),
        new THREE.Vector3(10, 10, 10)
      ),
    },
  ];
  const scene = new THREE.Scene();
  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  scene.add(mesh);
  const publish = () =>
    presentation.publish(color, reference, camera, pages[0], 128);
  return {
    presentation,
    renderer,
    host,
    color,
    reference,
    camera,
    pages,
    scene,
    material,
    publish,
  };
};

describe("completed corridor presentation", () => {
  it("retains an immutable world projection across camera movement for Lambert terrain", () => {
    const f = fixture();
    expect(f.publish()).toBe(true);
    f.camera.position.x = 2;
    f.camera.updateMatrixWorld(true);
    let uniforms: Record<string, { value: unknown }> = {};
    f.presentation.render(f.scene, f.pages[0], 128, () => {
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <project_vertex>",
        fragmentShader: "#include <common>\n#include <opaque_fragment>",
      };
      f.material.onBeforeCompile(shader as never, f.renderer as never);
      uniforms = shader.uniforms;
      expect(uniforms.carmaRetainedEnabled.value).toBe(true);
      expect(shader.vertexShader).toContain(
        "modelMatrix * vec4(transformed, 1.0)"
      );
      expect(shader.fragmentShader).toContain("abs(depth - expectedDepth)");
    });
    expect(uniforms.carmaRetainedEnabled.value).toBe(false);
    expect(f.presentation.stats).toMatchObject({
      pages: 1,
      matchingPages: 1,
      replays: 1,
    });
    expect(f.renderer.copyTextureToTexture).toHaveBeenCalledTimes(1);
  });

  it("rejects incompatible receiver/sun identities", () => {
    const f = fixture();
    f.publish();
    const draw = vi.fn();
    f.presentation.render(
      f.scene,
      { ...f.pages[0], revision: "changed" },
      128,
      draw
    );
    expect(draw).toHaveBeenCalledTimes(1);
    expect(f.presentation.stats.replays).toBe(0);
  });

  it("keeps a completed corridor at drag end until the target replacement is published", () => {
    const f = fixture();
    const page = {
      ...f.pages[0],
      presentationKey: "same-sun-and-footprint",
      contentKey: "casters-before-drag",
      revision: "moving-buffer",
    };
    f.presentation.publish(f.color, f.reference, f.camera, page, 128);
    const replacement = {
      ...page,
      contentKey: "refined-casters",
      revision: "resting-buffer",
      ready: false,
    };
    // It still needs recomputing, but must not fall back to a hard shadow.
    expect(f.presentation.has(replacement, 512)).toBe(false);
    f.presentation.render(f.scene, replacement, 512, () => undefined);
    expect(f.presentation.stats.replays).toBe(1);
    f.presentation.render(
      f.scene,
      { ...replacement, presentationKey: "different-sun" },
      512,
      () => undefined
    );
    expect(f.presentation.stats.replays).toBe(1);
    f.presentation.publish(f.color, f.reference, f.camera, replacement, 512);
    expect(f.presentation.has(replacement, 512)).toBe(true);
    expect(f.presentation.stats.pages).toBe(1);
  });

  it("keeps the old publication after failed replacement and restores the host target", () => {
    const f = fixture();
    f.publish();
    f.renderer.copyTextureToTexture.mockImplementationOnce(() => {
      throw new Error("copy failed");
    });
    expect(f.publish).toThrow("copy failed");
    expect(f.presentation.stats.pages).toBe(1);
    expect(f.renderer.setRenderTarget).toHaveBeenLastCalledWith(f.host, 0, 0);
  });

  it("restores material hooks and disables replay even when drawing throws", () => {
    const f = fixture();
    const compile = f.material.onBeforeCompile;
    f.publish();
    expect(() =>
      f.presentation.render(f.scene, f.pages[0], 128, () => {
        throw new Error("draw failed");
      })
    ).toThrow("draw failed");
    expect(f.material.onBeforeCompile).not.toBe(compile);
    f.presentation.dispose();
    expect(f.material.onBeforeCompile).toBe(compile);
    expect(f.presentation.memoryBytes).toBe(0);
  });

  it("publishes a cropped corridor without removing an earlier sibling", () => {
    const f = fixture();
    f.publish();
    const page = {
      ...f.pages[0],
      id: "b",
      screenBounds: new THREE.Vector4(0.25, 0.5, 0.5, 0.25),
    };
    expect(
      f.presentation.publish(f.color, f.reference, f.camera, page, 128)
    ).toBe(true);
    expect(f.presentation.has(f.pages[0], 128)).toBe(true);
    expect(f.presentation.has(page, 128)).toBe(true);
    expect(f.presentation.memoryBytes).toBe((32 * 32 + 16 * 8) * 8);
    expect(f.renderer.copyTextureToTexture.mock.calls.at(-1)?.[2]).toEqual(
      new THREE.Box2(new THREE.Vector2(8, 16), new THREE.Vector2(24, 24))
    );
  });

  it("does not evict visible completed corridors to admit a new capture", () => {
    const f = fixture();
    // Mock renderer: target dimensions model memory cost without GPU allocation.
    f.color.setSize(4096, 4096);
    const a = f.pages[0];
    const b = { ...a, id: "b" };
    const c = { ...a, id: "c" };
    f.presentation.publish(f.color, f.reference, f.camera, a, 128);
    f.presentation.publish(f.color, f.reference, f.camera, b, 128);
    f.presentation.beginFrame([a, b, c]);
    expect(f.presentation.publish(f.color, f.reference, f.camera, c, 128)).toBe(
      false
    );
    expect(f.presentation.has(a, 128)).toBe(true);
    expect(f.presentation.has(b, 128)).toBe(true);
    f.presentation.beginFrame([b, c]);
    expect(f.presentation.publish(f.color, f.reference, f.camera, c, 128)).toBe(
      true
    );
    expect(f.presentation.has(b, 128)).toBe(true);
    f.presentation.dispose();
  });

  it("reuses physical visibility across a buffer-size change but not changed casters", () => {
    const f = fixture();
    const page = {
      ...f.pages[0],
      contentKey: "sun-and-casters",
      revision: "512px",
    };
    f.presentation.publish(f.color, f.reference, f.camera, page, 128);
    expect(f.presentation.has({ ...page, revision: "1024px" }, 128)).toBe(true);
    expect(
      f.presentation.has({ ...page, contentKey: "new-casters" }, 128)
    ).toBe(false);
  });
});
