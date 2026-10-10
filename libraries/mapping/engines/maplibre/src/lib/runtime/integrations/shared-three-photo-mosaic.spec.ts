import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { CssPixels } from "@carma-units";
import { createSharedThreePhotoMosaic } from "./shared-three-photo-mosaic";
import { createSharedThreePhotoDepth } from "./shared-three-photo-depth";
import type { SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";

const setup = (instanced = false, shared = false) => {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const source = instanced
    ? new THREE.InstancedMesh(geometry, material, 2)
    : new THREE.Mesh(geometry, material);
  const root = new THREE.Group();
  root.add(source);
  root.updateMatrixWorld(true);
  let revision = 0;
  const runtime = {
    id: "surface",
    root,
    mountsOnLocalFrame: true,
    receivesScreenImages: true,
    mapStyleProjectionVersion: () => revision,
  } as unknown as SharedThreeSceneRuntime;
  const runtimes = new Map([[runtime.id, runtime]]);
  const sharedDepth = shared
    ? createSharedThreePhotoDepth(runtimes)
    : undefined;
  const mosaic = createSharedThreePhotoMosaic(runtimes, sharedDepth);
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 1, 1000);
  const viewport = new THREE.Vector2(800, 600);
  const oldTarget = new THREE.WebGLRenderTarget(8, 8);
  let target: THREE.WebGLRenderTarget | null = oldTarget;
  const targets = new Set<THREE.WebGLRenderTarget>();
  const calls: {
    scene: THREE.Scene;
    texture?: THREE.Texture;
    opacity?: number;
    sourceDepthEnabled?: number;
    projection?: THREE.Matrix4;
    outlineWidth?: number;
    outlineColor?: THREE.Color;
    outputPixelsPerCss?: THREE.Vector2;
  }[] = [];
  const gl = {
    FRAMEBUFFER_BINDING: 1,
    DEPTH_RANGE: 2,
    FRAMEBUFFER: 3,
    getParameter: (key: number) =>
      key === 1 ? "old-framebuffer" : new Float32Array([0.2, 0.8]),
    depthRange: vi.fn(),
    bindFramebuffer: vi.fn(),
  };
  const renderer = {
    autoClear: true,
    domElement: { clientWidth: 400, clientHeight: 300 },
    capabilities: { maxTextureSize: 8192 },
    getContext: () => gl,
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null) => {
      target = value;
      if (value && value !== oldTarget) targets.add(value);
    }),
    getViewport: (value: THREE.Vector4) => value.set(2, 3, 400, 300),
    getScissor: (value: THREE.Vector4) => value.set(5, 6, 200, 100),
    getScissorTest: () => true,
    getClearColor: (value: THREE.Color) => value.setRGB(0.1, 0.2, 0.3),
    getClearAlpha: () => 0.4,
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    resetState: vi.fn(() => {
      target = null;
    }),
    render: vi.fn((scene: THREE.Scene) => {
      const uniforms = (
        (scene.children[0] as THREE.Mesh)?.material as THREE.ShaderMaterial
      )?.uniforms;
      calls.push({
        scene,
        texture: uniforms?.photograph?.value,
        opacity: uniforms?.opacity?.value,
        sourceDepthEnabled: uniforms?.sourceDepthEnabled?.value,
        outlineWidth: uniforms?.outlineWidth?.value,
        outlineColor: uniforms?.outlineColor?.value.clone(),
        outputPixelsPerCss: uniforms?.outputPixelsPerCss?.value.clone(),
        projection: uniforms?.sceneToPhoto?.value.clone(),
      });
    }),
  };
  const entries = [3, 1, 4, 2].map((priority) => ({
    texture: new THREE.Texture(),
    sceneToTexture: new THREE.Matrix4().makeTranslation(priority, 0, 0),
    opacity: 0.5,
    priority,
  }));
  const render = (
    preparedDepth?: ReturnType<
      ReturnType<typeof createSharedThreePhotoDepth>["sync"]
    >
  ) =>
    mosaic.render(
      renderer as unknown as THREE.WebGLRenderer,
      camera,
      viewport,
      preparedDepth
    );
  const dispose = () => {
    mosaic.dispose();
    sharedDepth?.dispose();
    if (source.geometry !== geometry) source.geometry.dispose();
    geometry.dispose();
    material.dispose();
    entries.forEach((entry) => entry.texture.dispose());
    oldTarget.dispose();
  };
  return {
    sharedDepth,
    source,
    root,
    geometry,
    material,
    runtimes,
    mosaic,
    camera,
    viewport,
    renderer,
    gl,
    entries,
    calls,
    targets,
    oldTarget,
    render,
    dispose,
    revise: () => revision++,
  };
};

describe("shared scene photo mosaic", () => {
  it("shares source depth across crop/detail updates, rejects unavailable requested depth and preserves legacy entries", () => {
    const f = setup();
    try {
      const sourceProjection = new THREE.Matrix4().set(
        1,
        0,
        -0.5,
        0,
        0,
        1,
        -0.5,
        0,
        0,
        0,
        -1,
        0,
        0,
        0,
        -1,
        0
      );
      const first = { ...f.entries[0], sourceProjection };
      const detail = {
        ...f.entries[1],
        sourceProjection: sourceProjection.clone(),
      };
      f.mosaic.set("photo", [first, detail]);
      f.render();
      // Current-view depth, one shared source depth, then two photo passes.
      expect(f.calls.filter((call) => !call.texture)).toHaveLength(2);
      expect(
        f.calls
          .filter((call) => call.texture)
          .map((call) => call.sourceDepthEnabled)
      ).toEqual([1, 1]);
      const before = f.calls.length;
      f.mosaic.set("photo", [
        { ...first, opacity: 0.3 },
        { ...detail, sceneToTexture: new THREE.Matrix4().makeScale(2, 2, 1) },
      ]);
      f.render();
      expect(f.calls.slice(before)).toHaveLength(2);
      expect(f.calls.slice(before).every((call) => !!call.texture)).toBe(true);
      const invalid = {
        ...first,
        sourceProjection: new THREE.Matrix4().multiplyScalar(0),
      };
      f.mosaic.set("photo", [invalid, f.entries[1]]);
      f.render();
      expect(f.calls.slice(-2).map((call) => call.sourceDepthEnabled)).toEqual([
        0, -1,
      ]);
      const shader = (f.calls.at(-1)!.scene.children[0] as THREE.Mesh)
        .material as THREE.ShaderMaterial;
      expect(shader.fragmentShader).toContain("carmaPhotoSourceVisible");
      expect(shader.fragmentShader).toContain(
        "if(sourceDepthEnabled<0.0)discard"
      );
    } finally {
      f.dispose();
    }
  });

  it("composes uncapped outline passes and resets uniforms before ordinary photos", () => {
    const f = setup();
    try {
      const textureDispose = vi.spyOn(f.entries[0].texture, "dispose");
      const outlines = Array.from({ length: 40 }, (_, i) => ({
        ...f.entries[0],
        priority: i,
        outline: {
          color: new THREE.Color(0.2, 0.4, 0.6),
          width: 2 as CssPixels,
        },
      }));
      const ordinary = { ...f.entries[1], priority: 100 };
      f.mosaic.set("outlines", [...outlines, ordinary]);
      f.render();
      expect(f.calls).toHaveLength(42);
      expect(
        f.calls.slice(1, 41).every((call) => call.outlineWidth === 2)
      ).toBe(true);
      expect(f.calls[1].outlineColor).toEqual(outlines[0].outline.color);
      expect(f.calls[1].outputPixelsPerCss).toEqual(new THREE.Vector2(2, 2));
      expect(f.calls[41].outlineWidth).toBe(0);
      expect(f.calls[41].outlineColor).toEqual(new THREE.Color(1, 1, 1));
      expect(f.calls[41].texture).toBe(ordinary.texture);
      const shader = (f.calls[1].scene.children[0] as THREE.Mesh)
        .material as THREE.ShaderMaterial;
      expect(shader.fragmentShader).toContain("if(outlineWidth>0.0)");
      expect(shader.fragmentShader).toContain("fwidth(uv)");
      expect(shader.fragmentShader).toContain("if(alpha<=0.0)discard");
      expect(shader.fragmentShader).toContain("vec4(outlineColor*alpha,alpha)");
      expect(
        shader.fragmentShader.indexOf("if(outlineWidth>0.0)")
      ).toBeLessThan(shader.fragmentShader.indexOf("texture2D(photograph,uv)"));
      f.mosaic.set("outlines", null);
      expect(textureDispose).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });

  it("copies outline colors and invalidates toggles, width, color and CSS scaling only when changed", () => {
    const f = setup();
    try {
      const entry = {
        ...f.entries[0],
        outline: {
          color: new THREE.Color(0.1, 0.2, 0.3),
          width: 2 as CssPixels,
        },
      };
      expect(f.mosaic.set("photo", [entry])).toBe(true);
      f.render();
      expect(f.mosaic.set("photo", [entry])).toBe(false);
      expect(f.render().changed).toBe(false);
      entry.outline.color.setRGB(0.3, 0.2, 0.1);
      expect(f.render().changed).toBe(false);
      expect(f.mosaic.set("photo", [entry])).toBe(true);
      expect(f.render().changed).toBe(true);
      expect(f.calls.at(-1)?.outlineColor).toEqual(entry.outline.color);
      entry.outline.width = 3 as CssPixels;
      expect(f.mosaic.set("photo", [entry])).toBe(true);
      f.render();
      expect(f.calls.at(-1)?.outlineWidth).toBe(3);
      f.renderer.capabilities.maxTextureSize = 400;
      f.render();
      expect(f.calls.at(-1)?.outputPixelsPerCss).toEqual(
        new THREE.Vector2(1, 1)
      );
      f.renderer.domElement.clientWidth = 800;
      f.renderer.domElement.clientHeight = 600;
      expect(f.render().changed).toBe(true);
      expect(f.calls.at(-1)?.outputPixelsPerCss).toEqual(
        new THREE.Vector2(0.5, 0.5)
      );
      expect(f.mosaic.set("photo", [f.entries[0]])).toBe(true);
      f.render();
      expect(f.calls.at(-1)?.outlineWidth).toBe(0);
      expect(f.mosaic.set("photo", [f.entries[0]])).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it("composes more than two borrowed photos in ascending priority and restores renderer state", () => {
    const f = setup();
    try {
      f.mosaic.set("photos", f.entries);
      const result = f.render();
      expect(result.changed).toBe(true);
      expect(result.texture?.colorSpace).toBe(THREE.NoColorSpace);
      expect(f.calls).toHaveLength(5);
      expect(
        f.calls
          .slice(1)
          .map(
            (call) =>
              f.entries.find((entry) => entry.texture === call.texture)
                ?.priority
          )
      ).toEqual([1, 2, 3, 4]);
      expect(f.calls.slice(1).map((call) => call.opacity)).toEqual([
        0.5, 0.5, 0.5, 0.5,
      ]);
      expect(f.mosaic.state).toMatchObject({
        photos: 4,
        receivers: 1,
        passes: 5,
        width: 800,
        height: 600,
        reduced: false,
      });
      expect(f.renderer.autoClear).toBe(true);
      expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
      expect(f.renderer.setViewport).toHaveBeenLastCalledWith(
        new THREE.Vector4(2, 3, 400, 300)
      );
      expect(f.renderer.setScissorTest).toHaveBeenLastCalledWith(true);
      expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
      expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
      expect(f.gl.depthRange.mock.calls.at(-1)![0]).toBeCloseTo(0.2);
      expect(f.gl.depthRange.mock.calls.at(-1)![1]).toBeCloseTo(0.8);
    } finally {
      f.dispose();
    }
  });

  it("reuses receiver depth for fades, cropped projectors and progressive or replaced photo textures", () => {
    const f = setup();
    const replacement = new THREE.Texture();
    try {
      f.mosaic.set("photos", f.entries);
      f.render();
      expect(f.calls.filter((call) => !call.texture)).toHaveLength(1);
      const colorOnly = (change: () => void) => {
        f.calls.length = 0;
        change();
        expect(f.render().changed).toBe(true);
        expect(f.calls).toHaveLength(4);
        expect(f.calls.every((call) => !!call.texture)).toBe(true);
        expect(f.mosaic.state.passes).toBe(4);
        expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
        expect(f.renderer.autoClear).toBe(true);
        expect(f.render().changed).toBe(false);
      };
      colorOnly(() => {
        f.entries[0].opacity = 0.25;
        f.mosaic.set("photos", f.entries);
      });
      colorOnly(() => {
        f.entries[0].sceneToTexture.makeScale(0.5, 0.5, 1);
        f.mosaic.set("photos", f.entries);
      });
      colorOnly(() => {
        f.entries[0].texture.needsUpdate = true;
      });
      colorOnly(() => {
        f.mosaic.set(
          "photos",
          f.entries.map((entry, index) =>
            index === 0 ? { ...entry, texture: replacement } : entry
          )
        );
      });
    } finally {
      replacement.dispose();
      f.dispose();
    }
  });

  it("refreshes depth after camera, output dimensions and receiver changes even after a color-only frame", () => {
    const f = setup(true);
    try {
      f.mosaic.set("photos", f.entries);
      f.render();
      const changes: Array<() => void> = [
        () => {
          f.camera.projectionMatrix.elements[0] *= 1.1;
        },
        () => {
          f.camera.matrixWorldInverse.makeTranslation(1, 0, 0);
        },
        () => {
          f.viewport.set(1024, 768);
        },
        () => {
          f.root.position.x += 1;
          f.root.updateMatrixWorld(true);
        },
        () => {
          f.root.visible = false;
        },
        () => {
          f.root.visible = true;
        },
        () => {
          f.geometry.attributes.position.needsUpdate = true;
        },
        () => {
          f.geometry.index!.needsUpdate = true;
        },
        () => {
          f.geometry.setDrawRange(0, 6);
        },
        () => {
          f.material.alphaTest = 0.25;
        },
        () => {
          f.material.visible = false;
        },
        () => {
          f.material.visible = true;
        },
        () => {
          f.material.needsUpdate = true;
        },
        () => {
          const source = f.source as THREE.InstancedMesh;
          source.setMatrixAt(0, new THREE.Matrix4().makeTranslation(2, 0, 0));
          source.instanceMatrix.needsUpdate = true;
        },
        () => {
          (f.source as THREE.InstancedMesh).count = 1;
        },
        () => {
          f.source.geometry = f.geometry.clone();
          f.revise();
        },
      ];
      for (const change of changes) {
        f.entries[0].opacity = f.entries[0].opacity === 0.5 ? 0.4 : 0.5;
        f.mosaic.set("photos", f.entries);
        f.render();
        f.calls.length = 0;
        change();
        expect(f.render().changed).toBe(true);
        expect(f.calls.filter((call) => !call.texture)).toHaveLength(1);
        expect(f.calls.filter((call) => !!call.texture)).toHaveLength(4);
        expect(f.mosaic.state.passes).toBe(5);
        expect(f.render().changed).toBe(false);
      }
    } finally {
      f.dispose();
    }
  });

  it("restores GL state and retries color without redrawing valid depth after a color pass fails", () => {
    const f = setup();
    try {
      f.mosaic.set("photos", f.entries);
      f.render();
      f.calls.length = 0;
      f.entries[0].opacity = 0.2;
      f.mosaic.set("photos", f.entries);
      f.renderer.render.mockImplementationOnce(() => {
        throw new Error("color interrupted");
      });
      expect(f.render).toThrow("color interrupted");
      expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
      expect(f.renderer.autoClear).toBe(true);
      expect(f.renderer.setViewport).toHaveBeenLastCalledWith(
        new THREE.Vector4(2, 3, 400, 300)
      );
      expect(f.renderer.setScissor).toHaveBeenLastCalledWith(
        new THREE.Vector4(5, 6, 200, 100)
      );
      expect(f.renderer.setScissorTest).toHaveBeenLastCalledWith(true);
      expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
      expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
      expect(f.gl.depthRange.mock.calls.at(-1)![0]).toBeCloseTo(0.2);
      expect(f.gl.depthRange.mock.calls.at(-1)![1]).toBeCloseTo(0.8);
      expect(f.render().changed).toBe(true);
      expect(f.calls).toHaveLength(4);
      expect(f.calls.every((call) => !!call.texture)).toBe(true);
      expect(f.mosaic.state.passes).toBe(4);
    } finally {
      f.dispose();
    }
  });

  it("reuses unchanged frames and refreshes camera, photo content and copied projector changes", () => {
    const f = setup();
    try {
      expect(f.mosaic.set("photos", f.entries)).toBe(true);
      const first = f.render();
      expect(f.mosaic.set("photos", f.entries)).toBe(false);
      expect(f.render()).toEqual({ texture: first.texture, changed: false });
      expect(f.calls).toHaveLength(5);
      f.camera.projectionMatrix.elements[0] *= 1.1;
      expect(f.render().changed).toBe(true);
      f.entries[0].texture.needsUpdate = true;
      expect(f.render().changed).toBe(true);
      f.entries[0].sceneToTexture.elements[12] = 7;
      expect(f.render().changed).toBe(false); // submitted projectors are copied
      expect(f.mosaic.set("photos", f.entries)).toBe(true);
      expect(f.render().changed).toBe(true);
    } finally {
      f.dispose();
    }
  });

  it("tracks world transforms, hidden ancestors, geometry and material changes without mutating sources", () => {
    const f = setup();
    try {
      f.mosaic.set("photos", f.entries);
      f.render();
      const proxy = f.calls[0].scene.children[0] as THREE.Mesh;
      expect(proxy).not.toBe(f.source);
      expect(proxy.geometry).toBe(f.geometry);
      expect(proxy.material).not.toBe(f.material);
      f.root.position.set(3, 4, 5);
      f.root.updateMatrixWorld(true);
      expect(f.render().changed).toBe(true);
      expect(proxy.matrix.equals(f.source.matrixWorld)).toBe(true);
      f.root.visible = false;
      expect(f.render().changed).toBe(true);
      expect(proxy.visible).toBe(false);
      expect(f.mosaic.state.receivers).toBe(0);
      f.root.visible = true;
      expect(f.render().changed).toBe(true);
      f.geometry.attributes.position.needsUpdate = true;
      expect(f.render().changed).toBe(true);
      f.material.alphaTest = 0.3;
      expect(f.render().changed).toBe(true);
      expect((proxy.material as THREE.MeshDepthMaterial).alphaTest).toBe(0.3);
      expect(f.source.material).toBe(f.material);
      expect(f.source.parent).toBe(f.root);
      expect(f.render().changed).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it("invalidates instanced transforms and receiver revisions", () => {
    const f = setup(true);
    try {
      f.mosaic.set("photos", f.entries);
      f.render();
      const source = f.source as THREE.InstancedMesh;
      const proxy = f.calls[0].scene.children[0] as THREE.InstancedMesh;
      expect(proxy.instanceMatrix).toBe(source.instanceMatrix);
      source.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 2, 3));
      source.instanceMatrix.needsUpdate = true;
      expect(f.render().changed).toBe(true);
      source.count = 1;
      expect(f.render().changed).toBe(true);
      expect(proxy.count).toBe(1);
      f.revise();
      expect(f.render().changed).toBe(false);
      expect(f.calls[0].scene.children[0]).toBe(proxy);
      const extra = new THREE.Mesh(f.geometry, f.material);
      f.root.add(extra);
      f.root.updateMatrixWorld(true);
      f.revise();
      expect(f.render().changed).toBe(true);
      expect(f.calls[0].scene.children).toHaveLength(2);
      expect(f.calls[0].scene.children).toContain(proxy);
    } finally {
      f.dispose();
    }
  });

  it("reports output-buffer reduction truthfully when edge or pixel budgets apply", () => {
    const f = setup();
    try {
      f.mosaic.set("photos", f.entries);
      f.viewport.set(12000, 9000);
      f.render();
      const stats = f.mosaic.state;
      expect(stats).toMatchObject({
        requestedWidth: 12000,
        requestedHeight: 9000,
        reduced: true,
      });
      expect(stats.width).toBeLessThanOrEqual(8192);
      expect(stats.height).toBeLessThanOrEqual(8192);
      expect(stats.width * stats.height).toBeLessThanOrEqual(16 * 1024 * 1024);
      expect(stats.width / stats.height).toBeCloseTo(4 / 3, 2);
    } finally {
      f.dispose();
    }
  });

  it("releases owned targets and depth materials while preserving borrowed assets on disable, detach and removal", () => {
    const f = setup();
    try {
      const geometryDispose = vi.spyOn(f.geometry, "dispose"),
        materialDispose = vi.spyOn(f.material, "dispose");
      const textureDispose = f.entries.map((entry) =>
        vi.spyOn(entry.texture, "dispose")
      );
      f.mosaic.set("photos", f.entries);
      f.render();
      const ownedTargets = [...f.targets].map((target) =>
        vi.spyOn(target, "dispose")
      );
      const depthMaterial = (f.calls[0].scene.children[0] as THREE.Mesh)
        .material as THREE.Material;
      const depthDispose = vi.spyOn(depthMaterial, "dispose");
      f.runtimes.clear();
      expect(f.render().changed).toBe(true);
      expect(f.mosaic.state.receivers).toBe(0);
      expect(depthDispose).toHaveBeenCalledOnce();
      f.mosaic.detach();
      ownedTargets.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
      expect(f.mosaic.active).toBe(true); // borrowed entries survive a renderer reattach
      expect(f.render().changed).toBe(true);
      expect(f.mosaic.set("photos", null)).toBe(true);
      expect(f.mosaic.active).toBe(false);
      expect(f.render()).toEqual({ texture: null, changed: false });
      expect(f.mosaic.state).toMatchObject({
        photos: 0,
        width: 0,
        height: 0,
        passes: 0,
      });
      f.mosaic.dispose();
      expect(geometryDispose).not.toHaveBeenCalled();
      expect(materialDispose).not.toHaveBeenCalled();
      textureDispose.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    } finally {
      f.dispose();
    }
  });

  it("restores the shared renderer even if a render pass throws", () => {
    const f = setup();
    try {
      f.mosaic.set("photos", f.entries);
      f.renderer.render.mockImplementationOnce(() => {
        throw new Error("GPU interrupted");
      });
      expect(f.render).toThrow("GPU interrupted");
      expect(f.renderer.autoClear).toBe(true);
      expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
      expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
      expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
      expect(f.render().changed).toBe(true);
    } finally {
      f.dispose();
    }
  });
});

describe("shared depth synchronization owner", () => {
  it("consumes one explicit prepared sync and still synchronizes independent calls", () => {
    const f = setup(false, true);
    try {
      const sync = vi.spyOn(f.sharedDepth!, "sync");
      f.mosaic.set("photos", f.entries);
      const prepared = f.sharedDepth!.sync();
      f.render(prepared);
      expect(sync).toHaveBeenCalledOnce();
      f.render();
      expect(sync).toHaveBeenCalledTimes(2);
      f.revise();
      expect(f.render().changed).toBe(false);
      expect(sync).toHaveBeenCalledTimes(3);
    } finally {
      f.dispose();
    }
  });
});

it("forwards explicit host state to nested source depth without GL reads and retains its Three target", () => {
  const f = setup();
  try {
    const p = new THREE.Matrix4().set(
      1,
      0,
      -0.5,
      0,
      0,
      1,
      -0.5,
      0,
      0,
      0,
      -1,
      0,
      0,
      0,
      -1,
      0
    );
    f.mosaic.set("photos", [{ ...f.entries[0], sourceProjection: p }]);
    const reads = vi.spyOn(f.gl, "getParameter").mockImplementation(() => {
      throw Error("unexpected sync read");
    });
    f.mosaic.render(
      f.renderer as unknown as THREE.WebGLRenderer,
      f.camera,
      f.viewport,
      undefined,
      { framebuffer: null, depthRange: [0.2, 0.8] }
    );
    expect(reads).not.toHaveBeenCalled();
    expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
    expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
    expect(f.gl.depthRange).toHaveBeenLastCalledWith(0, 1);
  } finally {
    f.dispose();
  }
});

it("restores the supplied MapLibre framebuffer and compressed depth after a mosaic failure", () => {
  const f = setup();
  const framebuffer = {} as WebGLFramebuffer;
  try {
    f.renderer.setRenderTarget(null);
    f.mosaic.set("photos", f.entries);
    const reads = vi.spyOn(f.gl, "getParameter").mockImplementation(() => {
      throw Error("unexpected sync read");
    });
    f.renderer.render.mockImplementationOnce(() => {
      throw Error("draw failed");
    });
    expect(() =>
      f.mosaic.render(
        f.renderer as unknown as THREE.WebGLRenderer,
        f.camera,
        f.viewport,
        undefined,
        { framebuffer, depthRange: [0.1, 0.9] }
      )
    ).toThrow("draw failed");
    expect(reads).not.toHaveBeenCalled();
    expect(f.renderer.getRenderTarget()).toBe(null);
    expect(f.gl.bindFramebuffer).toHaveBeenLastCalledWith(
      f.gl.FRAMEBUFFER,
      framebuffer
    );
    expect(f.gl.depthRange).toHaveBeenLastCalledWith(0.1, 0.9);
    expect(f.renderer.autoClear).toBe(true);
  } finally {
    f.dispose();
  }
});
