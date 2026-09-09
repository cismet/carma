import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShadowCorridorPresentation } from "./shadow-corridor-presentation";
import {
  SHADOW_CORRIDOR_CACHE,
  type ShadowCorridorCacheRecord,
  type ShadowCorridorCacheIdentity,
  type ShadowCorridorPackedCapture,
} from "../core/shadow-corridor-cache-record";
import type { ShadowAccumulationPage } from "./tiled-shadow-renderer";

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
    readRenderTargetPixelsAsync: vi.fn(
      async (
        _target: THREE.WebGLRenderTarget,
        _x: number,
        _y: number,
        _width: number,
        _height: number,
        buffer: Float32Array
      ) => buffer
    ),
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
  it("reuses a baked receiver at equal or smaller demand, but refines larger buffers", () => {
    const f = fixture();
    const page: ShadowAccumulationPage = {
      ...f.pages[0],
      presentationKey: "same-tile-lod-and-sun",
      captureSize: { width: 32, height: 32 },
    };
    expect(f.presentation.publish(f.color, f.reference, f.camera, page, 64)).toBe(true);
    const moved = { ...page, contentKey: "camera-or-traversal-changed" };
    expect(f.presentation.has(moved, 64)).toBe(true);
    expect(f.presentation.has({ ...moved, captureSize: { width: 16, height: 16 } }, 64)).toBe(true);
    const finer = { ...moved, captureSize: { width: 64, height: 32 } };
    expect(f.presentation.has(finer, 64)).toBe(false);
    expect(f.presentation.canReplay(finer)).toBe(true);
    expect(f.presentation.has({ ...moved, presentationKey: "different-sun" }, 64)).toBe(false);
    expect(f.presentation.has({ ...moved, id: "different-mesh-lod" }, 64)).toBe(false);
    expect(f.presentation.has(moved, 128)).toBe(false);
    f.presentation.dispose();
  });

  it.each(["basic", "instanced", "skinned", "transparent"])(
    "rejects visible unsupported %s receivers instead of capturing albedo as visibility",
    (kind) => {
      const f = fixture();
      const geometry = new THREE.BoxGeometry();
      const material =
        kind === "basic"
          ? new THREE.MeshBasicMaterial()
          : new THREE.MeshLambertMaterial({
              transparent: kind === "transparent",
            });
      const mesh =
        kind === "instanced"
          ? new THREE.InstancedMesh(geometry, material, 1)
          : kind === "skinned"
          ? new THREE.SkinnedMesh(geometry, material)
          : new THREE.Mesh(geometry, material);
      const overlay = new THREE.Group();
      overlay.add(mesh);
      f.scene.add(overlay);
      f.presentation.capture(f.scene, () => expect(f.publish()).toBe(false));
      expect(f.presentation.supportsCapture).toBe(false);
      overlay.visible = false;
      f.presentation.capture(f.scene, () => expect(f.publish()).toBe(true));
      expect(f.presentation.supportsCapture).toBe(true);
      f.presentation.dispose();
      geometry.dispose();
      material.dispose();
    }
  );

  it("changes its image revision only for actual publication, not replay/LRU touches", () => {
    const f = fixture();
    expect(f.presentation.revision).toBe(0);
    f.publish();
    const revision = f.presentation.revision;
    expect(revision).toBeGreaterThan(0);
    f.presentation.beginFrame(f.pages);
    f.presentation.render(f.scene, f.pages[0], 128, () => undefined);
    expect(f.presentation.revision).toBe(revision);
    f.publish();
    expect(f.presentation.revision).toBe(revision + 1);
    f.presentation.dispose();
  });
  it("reports retained dimensions without exposing mutable capture records", () => {
    const f = fixture();
    const page = f.pages[0];
    expect(f.presentation.getCapturedSize(page.id)).toBeNull();
    f.presentation.publish(f.color, f.reference, f.camera, page, 64);
    const size = f.presentation.getCapturedSize(page.id);
    expect(size).toEqual({ width: 32, height: 32, samples: 64 });
    Object.assign(size!, { width: 1 });
    expect(f.presentation.getCapturedSize(page.id)?.width).toBe(32);
  });

  it.each([
    ["lambert", THREE.MeshLambertMaterial],
    ["phong", THREE.MeshPhongMaterial],
    ["standard", THREE.MeshStandardMaterial],
  ] as const)(
    "captures raw visibility after display effects for %s",
    (name, Material) => {
      const f = fixture();
      const material = new Material({ color: 0x2468ac, alphaTest: 0.5 });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
      const shader = {
        uniforms: {} as Record<string, { value: unknown }>,
        vertexShader: THREE.ShaderLib[name].vertexShader,
        fragmentShader: THREE.ShaderLib[name].fragmentShader,
      };
      f.presentation.capture(scene, () => {
        material.onBeforeCompile(shader as never, f.renderer as never);
        expect(shader.uniforms.carmaCaptureVisibility.value).toBe(true);
        const output = shader.fragmentShader.indexOf(
          "if (carmaCaptureVisibility) gl_FragColor.rgb = vec3(carmaCapturedCoverage);"
        );
        expect(output).toBeGreaterThan(0);
        for (const chunk of [
          "clipping_planes_fragment",
          "alphatest_fragment",
          "opaque_fragment",
          "tonemapping_fragment",
          "colorspace_fragment",
          "fog_fragment",
          "dithering_fragment",
        ]) {
          const index = shader.fragmentShader.indexOf(`#include <${chunk}>`);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(output).toBeGreaterThan(index);
        }
        expect(shader.fragmentShader).not.toContain(
          "outgoingLight = vec3(carmaCapturedCoverage)"
        );
        expect(shader.fragmentShader).toContain(
          "carmaCapturedCoverage = getShadow("
        );
        expect(f.publish()).toBe(true);
      });
      expect(shader.uniforms.carmaCaptureVisibility.value).toBe(false);
      f.presentation.dispose();
    }
  );

  it.each(["dithering_fragment", "lights_fragment_begin"])(
    "rejects numeric capture when a custom shader removes %s",
    (chunk) => {
      const f = fixture();
      f.material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          `#include <${chunk}>`,
          ""
        );
      };
      const shader = {
        uniforms: {},
        vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
      };
      f.presentation.capture(f.scene, () => {
        f.material.onBeforeCompile(shader as never, f.renderer as never);
        expect(f.publish()).toBe(false);
      });
      expect(shader.fragmentShader).toBe(
        THREE.ShaderLib.lambert.fragmentShader.replace(
          `#include <${chunk}>`,
          ""
        )
      );
      expect(shader.vertexShader).toBe(THREE.ShaderLib.lambert.vertexShader);
      expect(shader.uniforms).toEqual({});
      // A reused compiled program must remain unsupported on the next capture.
      f.presentation.capture(f.scene, () => expect(f.publish()).toBe(false));
      expect(f.renderer.copyTextureToTexture).not.toHaveBeenCalled();
      expect(f.presentation.stats.pages).toBe(0);
      f.presentation.dispose();
    }
  );

  it("retains an immutable world projection across camera movement for Lambert terrain", () => {
    const f = fixture();
    expect(f.publish()).toBe(true);
    f.camera.position.x = 2;
    f.camera.updateMatrixWorld(true);
    let uniforms: Record<string, { value: unknown }> = {};
    f.presentation.render(f.scene, f.pages[0], 128, () => {
      const shader = {
        uniforms: {},
        vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
      };
      f.material.onBeforeCompile(shader as never, f.renderer as never);
      uniforms = shader.uniforms;
      expect(uniforms.carmaRetainedEnabled.value).toBe(true);
      expect(shader.vertexShader).toContain(
        "modelMatrix * vec4(transformed, 1.0)"
      );
      expect(shader.fragmentShader).not.toContain("expectedDepth");
      expect(shader.fragmentShader).not.toContain("dFdx(q)");
      expect(shader.fragmentShader).toContain("if (depth < 1.0)");
      expect(shader.fragmentShader).toContain(
        "return texture2D(carmaRetainedColor, uv).r;"
      );
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
    expect(f.presentation.canReplay(replacement)).toBe(true);
    expect(
      f.presentation.canReplay({
        ...replacement,
        presentationKey: "different-sun",
      })
    ).toBe(false);
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

  it("replaces a hard capture in a fully visible cache without losing its siblings or rollback", () => {
    const f = fixture();
    f.color.setSize(2048, 2048);
    const pages = Array.from({ length: 8 }, (_, index) => ({
      ...f.pages[0],
      id: String(index),
    }));
    f.presentation.beginFrame(pages);
    for (const page of pages) {
      expect(
        f.presentation.publish(f.color, f.reference, f.camera, page, 1)
      ).toBe(true);
    }
    const fullBytes = 256 * 1024 ** 2;
    expect(f.presentation.memoryBytes).toBe(fullBytes);
    expect(
      f.presentation.publish(
        f.color,
        f.reference,
        f.camera,
        { ...pages[0], id: "new" },
        1
      )
    ).toBe(false);
    f.renderer.copyTextureToTexture.mockImplementationOnce(() => {
      // The previous completed publication remains usable during the copy.
      expect(f.presentation.has(pages[0], 1)).toBe(true);
      throw new Error("replacement copy failed");
    });
    expect(() =>
      f.presentation.publish(f.color, f.reference, f.camera, pages[0], 512)
    ).toThrow("replacement copy failed");
    expect(f.presentation.has(pages[0], 1)).toBe(true);
    expect(f.presentation.memoryBytes).toBe(fullBytes);
    expect(
      f.presentation.publish(f.color, f.reference, f.camera, pages[0], 512)
    ).toBe(true);
    expect(f.presentation.has(pages[0], 512)).toBe(true);
    for (const sibling of pages.slice(1))
      expect(f.presentation.has(sibling, 1)).toBe(true);
    expect(f.presentation.memoryBytes).toBe(fullBytes);
    expect(f.presentation.stats.pages).toBe(8);
    // Replacement credit cannot increase the permanent retained budget either.
    f.color.setSize(4096, 2048);
    expect(
      f.presentation.publish(f.color, f.reference, f.camera, pages[0], 512)
    ).toBe(false);
    expect(f.presentation.has(pages[0], 512)).toBe(true);
    f.presentation.dispose();
  });

  it("bounds transient replacement storage instead of doubling arbitrary captures", () => {
    const f = fixture();
    const a = f.pages[0];
    const b = { ...a, id: "b" };
    f.presentation.beginFrame([a, b]);
    f.color.setSize(8192, 3072); // 192 MiB, larger than the replacement reserve.
    expect(f.presentation.publish(f.color, f.reference, f.camera, a, 1)).toBe(
      true
    );
    f.color.setSize(8192, 1024);
    expect(f.presentation.publish(f.color, f.reference, f.camera, b, 1)).toBe(
      true
    );
    f.color.setSize(8192, 3072);
    expect(f.presentation.publish(f.color, f.reference, f.camera, a, 512)).toBe(
      false
    );
    expect(f.presentation.has(a, 1)).toBe(true);
    expect(f.presentation.memoryBytes).toBe(256 * 1024 ** 2);
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

afterEach(() => vi.useRealTimers());

const persistentFixture = () => {
  const f = fixture();
  const identity = {
    source: "terrain:2024",
    dateTime: "2026-09-08T12:00:00Z",
    corridor: "native:1:2",
    resolution: "32x32",
    geometryFingerprint: "all-casters:1",
    samples: 128,
  };
  const worldBasis = new THREE.Matrix4().makeTranslation(400, 500, 600);
  const captureMatrix = new THREE.Matrix4().multiplyMatrices(
    f.camera.projectionMatrix,
    f.camera.matrixWorldInverse
  );
  const record: ShadowCorridorCacheRecord = {
    schema: SHADOW_CORRIDOR_CACHE.schema,
    identity,
    width: 32,
    height: 32,
    visibility: new Float32Array(1024).fill(0.75),
    depth: new Float32Array(1024).fill(0.5),
    captureMatrix: captureMatrix.toArray(),
    worldBasis: worldBasis.toArray(),
    crop: [0, 0, 1, 1],
  };
  const cache = {
    enabled: true,
    busy: false,
    read: vi.fn(async () => record as ShadowCorridorCacheRecord | null),
    write: vi.fn(async () => true),
    writePacked: vi.fn(
      async (
        _identity: ShadowCorridorCacheIdentity,
        _capture: ShadowCorridorPackedCapture
      ) => true
    ),
    dispose: vi.fn(),
  };
  const context = {
    cache,
    identity: vi.fn((_page: ShadowAccumulationPage, samples: number) => ({
      ...identity,
      samples,
    })),
    worldBasis: () => worldBasis.clone(),
    runIdleRender: vi.fn((draw: () => void) => {
      draw();
      return true;
    }),
    requestRepaint: vi.fn(),
  };
  f.presentation.setPersistence(context);
  return { ...f, identity, worldBasis, captureMatrix, record, cache, context };
};

const settlePersistence = async () => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

describe("persistent corridor GPU integration", () => {
  it("reuses restored finer masks after a demand change while still checking source geometry", async () => {
    const f = persistentFixture();
    const page: ShadowAccumulationPage = {
      ...f.pages[0],
      presentationKey: "stable-receiver-sun",
      captureSize: { width: 32, height: 32 },
    };
    f.presentation.prepareRestore(page, 128, f.captureMatrix);
    await settlePersistence();
    f.context.identity.mockImplementation((_page, samples) => ({
      ...f.identity,
      resolution: "smaller-demand",
      samples,
    }));
    expect(f.presentation.has({ ...page, captureSize: { width: 16, height: 16 } }, 128)).toBe(true);
    expect(f.presentation.has({ ...page, captureSize: { width: 64, height: 64 } }, 128)).toBe(false);
    f.context.identity.mockImplementation((_page, samples) => ({
      ...f.identity,
      geometryFingerprint: "changed-source-geometry",
      samples,
    }));
    expect(f.presentation.has(page, 128)).toBe(false);
    f.presentation.dispose();
  });

  it("only offers restored replay while its persistent source identity is current", async () => {
    const f = persistentFixture();
    expect(f.presentation.canReplay(f.pages[0])).toBe(false);
    f.presentation.prepareRestore(f.pages[0], 128, f.captureMatrix);
    await settlePersistence();
    expect(f.presentation.canReplay(f.pages[0])).toBe(true);
    f.context.identity.mockImplementation((_page, samples) => ({
      ...f.identity,
      geometryFingerprint: "different-casters",
      samples,
    }));
    expect(f.presentation.canReplay(f.pages[0])).toBe(false);
    f.presentation.render(f.scene, f.pages[0], 128, () => undefined);
    expect(f.presentation.stats.replays).toBe(0);
    f.presentation.dispose();
  });

  it("restores typed textures and converts the original local basis before matching coverage", async () => {
    const f = persistentFixture();
    const currentBasis = f.worldBasis
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(50, 0, -20));
    f.context.worldBasis = () => currentBasis.clone();
    const expected = f.captureMatrix
      .clone()
      .multiply(f.worldBasis.clone().invert())
      .multiply(currentBasis);
    f.presentation.prepareRestore(f.pages[0], 128, expected);
    expect(f.presentation.isRestorePending(f.pages[0], 128)).toBe(true);
    expect(f.presentation.has(f.pages[0], 128)).toBe(false);
    await settlePersistence();
    expect(f.presentation.isRestorePending(f.pages[0], 128)).toBe(false);
    expect(f.presentation.has(f.pages[0], 128)).toBe(true);
    expect(f.presentation.hasAtLeast(f.pages[0], 1)).toBe(true);
    expect(f.presentation.hasAtLeast(f.pages[0], 512)).toBe(false);
    expect(f.presentation.memoryBytes).toBe(1024 * 16);
    let uniforms: Record<string, { value: unknown }> = {};
    f.presentation.render(f.scene, f.pages[0], 128, () => {
      const shader = {
        uniforms: {},
        vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader,
      };
      f.material.onBeforeCompile(shader as never, f.renderer as never);
      uniforms = shader.uniforms;
    });
    expect(uniforms.carmaRetainedMatrix.value).toEqual(expected);
    expect(uniforms.carmaRetainedColor.value).toBeInstanceOf(THREE.DataTexture);
    expect(f.context.requestRepaint).toHaveBeenCalled();
    f.presentation.dispose();
    expect(f.cache.dispose).not.toHaveBeenCalled();
  });

  it("keeps another capture camera as display fallback without claiming a complete cache hit", async () => {
    const f = persistentFixture();
    f.presentation.prepareRestore(f.pages[0], 128);
    await settlePersistence();
    expect(f.presentation.has(f.pages[0], 128)).toBe(false);
    f.presentation.render(f.scene, f.pages[0], 128, () => undefined);
    expect(f.presentation.stats.replays).toBe(1);
    f.presentation.prepareRestore(f.pages[0], 128, new THREE.Matrix4());
    expect(f.presentation.has(f.pages[0], 128)).toBe(false);
    f.presentation.prepareRestore(f.pages[0], 128, f.captureMatrix);
    expect(f.presentation.has(f.pages[0], 128)).toBe(true);
    expect(f.cache.read).toHaveBeenCalledOnce();
    f.presentation.dispose();
  });

  it("rejects late restore when geometry changes or a new publication wins the race", async () => {
    const f = persistentFixture();
    let complete!: (record: ShadowCorridorCacheRecord) => void;
    f.cache.read.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    f.presentation.prepareRestore(f.pages[0], 128, f.captureMatrix);
    f.context.identity.mockImplementation((_page, samples) => ({
      ...f.identity,
      geometryFingerprint: "changed",
      samples,
    }));
    complete(f.record);
    await settlePersistence();
    expect(f.presentation.stats.pages).toBe(0);
    f.presentation.prepareRestore(
      { ...f.pages[0], ready: false },
      128,
      f.captureMatrix
    );
    expect(f.cache.read).toHaveBeenCalledOnce();
    f.presentation.dispose();
  });

  it("does not restore a screen crop as full-page coverage", async () => {
    const f = persistentFixture();
    f.cache.read.mockResolvedValue({ ...f.record, crop: [0.25, 0, 0.5, 1] });
    f.presentation.prepareRestore(f.pages[0], 128, f.captureMatrix);
    await settlePersistence();
    expect(f.presentation.has(f.pages[0], 128)).toBe(false);
    f.presentation.dispose();
  });

  it("packs scalar visibility and receiver depth only after publication and keeps hard and soft keys separate", async () => {
    vi.useFakeTimers();
    const f = persistentFixture();
    f.presentation.publish(f.color, f.reference, f.camera, f.pages[0], 1);
    expect(f.renderer.readRenderTargetPixelsAsync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cache.writePacked).toHaveBeenCalledOnce();
    expect(f.cache.writePacked.mock.calls[0][0]).toMatchObject({ samples: 1 });
    expect(f.cache.writePacked.mock.calls[0][1]).toMatchObject({
      width: 32,
      height: 32,
      crop: [0, 0, 1, 1],
      worldBasis: f.worldBasis.toArray(),
      captureMatrix: f.captureMatrix.toArray(),
    });
    f.presentation.publish(f.color, f.reference, f.camera, f.pages[0], 512);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.cache.writePacked.mock.calls[1][0]).toMatchObject({
      samples: 512,
    });
    expect(
      f.renderer.readRenderTargetPixelsAsync.mock.calls[0][0].texture.format
    ).toBe(THREE.RGBAFormat);
    expect(f.renderer.setRenderTarget).toHaveBeenLastCalledWith(f.host, 0, 0);
    f.presentation.dispose();
  });

  it("allows only one optional GPU readback and drops stale writes after disposal", async () => {
    vi.useFakeTimers();
    const f = persistentFixture();
    let complete!: (pixels: Float32Array) => void;
    f.renderer.readRenderTargetPixelsAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        })
    );
    f.publish();
    await vi.advanceTimersByTimeAsync(0);
    const pendingBytes = f.presentation.memoryBytes;
    f.presentation.publish(
      f.color,
      f.reference,
      f.camera,
      { ...f.pages[0], id: "b" },
      128
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(f.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledOnce();
    expect(pendingBytes).toBe(1024 * (8 + 16 + 16));
    f.presentation.dispose();
    complete(new Float32Array(4096));
    await settlePersistence();
    expect(f.cache.writePacked).not.toHaveBeenCalled();
  });

  it("drains more captures than the bounded write queue without pinning extra targets", async () => {
    vi.useFakeTimers();
    const f = persistentFixture();
    const pages = Array.from({ length: 7 }, (_, index) => ({
      ...f.pages[0],
      id: `tile:${index}`,
    }));
    f.presentation.beginFrame(pages);
    for (const page of pages)
      f.presentation.publish(f.color, f.reference, f.camera, page, 1);
    await vi.runAllTimersAsync();
    expect(f.cache.writePacked).toHaveBeenCalledTimes(7);
    expect(f.presentation.memoryBytes).toBe(7 * 1024 * 8);
    f.presentation.dispose();
  });

  it("admits more than 64 small native-tile captures within the byte budget", () => {
    const f = fixture();
    const pages = Array.from({ length: 80 }, (_, index) => ({
      ...f.pages[0],
      id: `tile:${index}`,
    }));
    f.presentation.beginFrame(pages);
    for (const page of pages)
      expect(
        f.presentation.publish(f.color, f.reference, f.camera, page, 1)
      ).toBe(true);
    expect(f.presentation.stats.pages).toBe(80);
    f.presentation.dispose();
  });
});
