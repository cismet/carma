import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { TiledShadowRenderer } from "./tiled-shadow-renderer";
import {
  ShadowDepthPageCache,
  shadowDepthPageBytes,
} from "./shadow-depth-page-cache";

const fixture = (budget = 8 * 1024 ** 2, targetPixels = 1) => {
  const scene = new THREE.Scene();
  const depths: THREE.WebGLRenderTarget[] = [];
  const colorViews: THREE.Camera[] = [];
  const shadowMatrices: number[][] = [];
  const disposed = vi.fn();
  const clipping: THREE.Plane[] = [];
  let target: THREE.RenderTarget | null = null;
  let cubeFace = 2;
  let mipLevel = 1;
  const viewport = new THREE.Vector4(1, 2, 320, 240);
  const scissor = new THREE.Vector4(3, 4, 100, 90);
  let scissorTest = true;
  const gl = {
    FRAMEBUFFER: 1,
    DRAW_FRAMEBUFFER: 2,
    READ_FRAMEBUFFER: 3,
    DRAW_FRAMEBUFFER_BINDING: 4,
    READ_FRAMEBUFFER_BINDING: 5,
    VIEWPORT: 6,
    SCISSOR_BOX: 7,
    SCISSOR_TEST: 8,
    DEPTH_TEST: 9,
    DEPTH_RANGE: 10,
    DEPTH_WRITEMASK: 11,
    DEPTH_FUNC: 12,
    DEPTH_CLEAR_VALUE: 13,
    COLOR_CLEAR_VALUE: 14,
    COLOR_WRITEMASK: 15,
    getParameter: (key: number) => native.get(key),
    isEnabled: (key: number) => native.get(key) === true,
    depthRange: (near: number, far: number) =>
      native.set(gl.DEPTH_RANGE, [near, far]),
    depthMask: (value: boolean) => native.set(gl.DEPTH_WRITEMASK, value),
    depthFunc: (value: number) => native.set(gl.DEPTH_FUNC, value),
    clearDepth: (value: number) => native.set(gl.DEPTH_CLEAR_VALUE, value),
    clearColor: (...value: number[]) => native.set(gl.COLOR_CLEAR_VALUE, value),
    colorMask: (...value: boolean[]) => native.set(gl.COLOR_WRITEMASK, value),
  };
  const native = new Map<number, unknown>([
    [gl.DRAW_FRAMEBUFFER_BINDING, { host: "draw" }],
    [gl.READ_FRAMEBUFFER_BINDING, { host: "read" }],
    [gl.VIEWPORT, [5, 6, 640, 480]],
    [gl.SCISSOR_BOX, [7, 8, 40, 50]],
    [gl.SCISSOR_TEST, true],
    [gl.DEPTH_TEST, false],
    [gl.DEPTH_RANGE, [0.1, 0.9]],
    [gl.DEPTH_WRITEMASK, false],
    [gl.DEPTH_FUNC, 513],
    [gl.DEPTH_CLEAR_VALUE, 0.75],
    [gl.COLOR_CLEAR_VALUE, [0.1, 0.2, 0.3, 0.4]],
    [gl.COLOR_WRITEMASK, [true, false, true, false]],
  ]);
  const renderer = {
    capabilities: { maxTextureSize: 4096 },
    shadowMap: {
      type: THREE.PCFShadowMap,
      enabled: true,
      autoUpdate: false,
      needsUpdate: false,
    },
    xr: { enabled: true },
    getContext: () => gl,
    getRenderTarget: () => target,
    getActiveCubeFace: () => cubeFace,
    getActiveMipmapLevel: () => mipLevel,
    getViewport: (out: THREE.Vector4) => out.copy(viewport),
    getScissor: (out: THREE.Vector4) => out.copy(scissor),
    getScissorTest: () => scissorTest,
    setViewport: (value: THREE.Vector4) => viewport.copy(value),
    setScissor: (value: THREE.Vector4) => scissor.copy(value),
    setScissorTest: (value: boolean) => {
      scissorTest = value;
    },
    setRenderTarget: (value: THREE.RenderTarget | null, cube = 0, mip = 0) => {
      target = value;
      cubeFace = cube;
      mipLevel = mip;
      native.set(gl.DRAW_FRAMEBUFFER_BINDING, value);
      native.set(gl.READ_FRAMEBUFFER_BINDING, value);
    },
    resetState: vi.fn(() => {
      native.set(gl.DRAW_FRAMEBUFFER_BINDING, null);
      native.set(gl.READ_FRAMEBUFFER_BINDING, null);
      native.set(gl.DEPTH_TEST, false);
      native.set(gl.SCISSOR_TEST, false);
    }),
    state: {
      bindFramebuffer: (kind: number, value: unknown) =>
        native.set(
          kind === gl.DRAW_FRAMEBUFFER
            ? gl.DRAW_FRAMEBUFFER_BINDING
            : gl.READ_FRAMEBUFFER_BINDING,
          value
        ),
      viewport: (value: THREE.Vector4) =>
        native.set(gl.VIEWPORT, value.toArray()),
      scissor: (value: THREE.Vector4) =>
        native.set(gl.SCISSOR_BOX, value.toArray()),
      setScissorTest: (value: boolean) => native.set(gl.SCISSOR_TEST, value),
      enable: (key: number) => native.set(key, true),
      disable: (key: number) => native.set(key, false),
    },
    clippingPlanes: clipping,
    autoClear: true,
    render: vi.fn((_scene: THREE.Scene, renderCamera: THREE.Camera) => {
      if (!(renderCamera instanceof THREE.ArrayCamera))
        colorViews.push(renderCamera);
      else colorViews.push(...renderCamera.cameras);
      for (const child of scene.children) {
        if (
          !(child instanceof THREE.DirectionalLight) ||
          !child.visible ||
          !child.shadow.needsUpdate
        )
          continue;
        const shadow = child.shadow;
        if (!shadow.map) {
          const target = new THREE.WebGLRenderTarget(
            shadow.mapSize.x,
            shadow.mapSize.y
          );
          target.addEventListener("dispose", () => disposed(target));
          shadow.map = target;
        }
        depths.push(shadow.map);
        shadowMatrices.push([
          ...shadow.camera.projectionMatrix.elements,
          ...shadow.camera.matrixWorldInverse.elements,
        ]);
        shadow.needsUpdate = false;
      }
    }),
  };
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  camera.position.set(10, 100, 150);
  camera.lookAt(10, 0, 0);
  camera.updateMatrixWorld(true);
  const cells = [0, 1].map((x) => ({
    id: String(x),
    bounds: new THREE.Box3(
      new THREE.Vector3(x * 20, 0, 0),
      new THREE.Vector3(x * 20 + 20, 10, 20)
    ),
  }));
  const lighting = {
    directionToSun: new THREE.Vector3(0, 1, 0),
    color: "white",
    intensity: 2,
    shadowIntensity: 1,
  };
  const pages = new TiledShadowRenderer(
    scene,
    renderer as unknown as THREE.WebGLRenderer,
    budget,
    256
  );
  const setView = (visibleCells = cells, pixels = targetPixels) =>
    pages.setView(
      visibleCells,
      camera,
      new THREE.Vector2(1440, 1440),
      pixels,
      lighting
    );
  setView();
  return {
    pages,
    camera,
    lighting,
    setView,
    renderer,
    depths,
    disposed,
    cells,
    clipping,
    scene,
    colorViews,
    shadowMatrices,
    gl,
    native,
  };
};

describe("shared tiled shadow runtime", () => {
  it("replays only the native receiver while sampling preserves other casters", () => {
    const f = fixture();
    const receiver = new THREE.Mesh();
    const caster = new THREE.Mesh();
    caster.castShadow = true;
    f.scene.add(receiver, caster);
    f.pages.setView(
      [{ ...f.cells[0], receiverObjectId: receiver.id }],
      f.camera,
      new THREE.Vector2(1440, 1440),
      1,
      f.lighting
    );
    expect(f.pages.accumulationPages[0].receiverObjectId).toBe(receiver.id);
    f.renderer.render.mockImplementationOnce(() => {
      expect(receiver.visible).toBe(true);
      expect(caster.visible).toBe(false);
      expect(f.renderer.shadowMap.autoUpdate).toBe(false);
      expect(f.renderer.shadowMap.needsUpdate).toBe(false);
    });
    expect(f.pages.renderPageColor(f.camera, "0")).toBe(true);
    expect(caster.visible).toBe(true);
    f.renderer.render.mockImplementationOnce(() => {
      expect(caster.visible).toBe(true);
      expect(caster.castShadow).toBe(true);
    });
    expect(f.pages.renderPageSample(f.camera, "0", 0, 64)).toBe(true);
    f.scene.remove(receiver);
    f.renderer.render.mockClear();
    expect(f.pages.renderPageSample(f.camera, "0", 1, 64)).toBe(false);
    expect(f.renderer.render).not.toHaveBeenCalled();
    f.pages.dispose();
  });

  it("measures the depth-pass versus texel-resolution tradeoff of merging capped pages", () => {
    const separate = fixture();
    const merged = fixture();
    merged.setView([
      {
        id: "merged",
        bounds: merged.cells[0].bounds.clone().union(merged.cells[1].bounds),
      },
    ]);
    for (let sample = 0; sample < 64; sample += 1) {
      separate.pages.renderSample(separate.camera, sample, 64);
      merged.pages.renderSample(merged.camera, sample, 64);
    }
    const texelSize = (f: ReturnType<typeof fixture>) =>
      Math.max(
        2 / Math.abs(f.shadowMatrices[0][0]) / f.depths[0].width,
        2 / Math.abs(f.shadowMatrices[0][5]) / f.depths[0].height
      );
    expect(separate.pages.stats.depthRenders).toBe(128);
    expect(merged.pages.stats.depthRenders).toBe(64);
    // Fewer draws at an unchanged per-page cap are NOT quality parity.
    expect(texelSize(merged)).toBeGreaterThan(texelSize(separate) * 1.1);
    console.info(
      "shadow-merge-operation-benchmark",
      JSON.stringify({
        separateDepthPasses: separate.pages.stats.depthRenders,
        mergedDepthPasses: merged.pages.stats.depthRenders,
        separateMetersPerTexel: texelSize(separate),
        mergedMetersPerTexel: texelSize(merged),
        gpuTiming: "not measured; mocked draw backend",
      })
    );
    separate.pages.dispose();
    merged.pages.dispose();
  });

  it("replays colour without generating depth and restores renderer state on failure", () => {
    const f = fixture();
    f.renderer.shadowMap.autoUpdate = true;
    f.renderer.shadowMap.needsUpdate = true;
    const clipping = f.renderer.clippingPlanes;
    const autoClear = f.renderer.autoClear;
    const background = f.scene.background;
    f.renderer.render.mockImplementationOnce(() => {
      expect(f.renderer.shadowMap.autoUpdate).toBe(false);
      expect(f.renderer.shadowMap.needsUpdate).toBe(false);
      expect(f.renderer.clippingPlanes.length).toBe(clipping.length + 4);
      throw new Error("colour draw failed");
    });
    expect(() => f.pages.renderPageColor(f.camera, "0")).toThrow(
      "colour draw failed"
    );
    expect(f.pages.stats.depthRenders).toBe(0);
    expect(f.renderer.shadowMap.autoUpdate).toBe(true);
    expect(f.renderer.shadowMap.needsUpdate).toBe(true);
    expect(f.renderer.clippingPlanes).toBe(clipping);
    expect(f.renderer.autoClear).toBe(autoClear);
    expect(f.scene.background).toBe(background);
    expect(f.pages.renderPageColor(f.camera, "missing")).toBe(false);
    f.pages.dispose();
  });

  it("reprojects retained pages without invalidating their shadow captures", () => {
    const f = fixture();
    f.pages.renderSample(f.camera, 0, 4);
    const initialDepthRenders = f.pages.stats.depthRenders;
    const initialRevision = f.pages.accumulationPages[0].revision;
    const initialScreenBounds =
      f.pages.accumulationPages[0].screenBounds.clone();
    f.camera.position.x += 5;
    f.camera.lookAt(10, 0, 0);
    f.camera.updateMatrixWorld(true);
    f.pages.updatePresentation(f.camera);
    expect(f.pages.accumulationPages[0].revision).toBe(initialRevision);
    expect(
      f.pages.accumulationPages[0].screenBounds.equals(initialScreenBounds)
    ).toBe(false);
    expect(f.pages.stats.depthRenders).toBe(initialDepthRenders);
    f.pages.dispose();
  });

  it("refreshes only a completed caster cut and retains it during pending refinement", () => {
    const f = fixture();
    f.pages.renderPageSample(f.camera, "0", 0, 1);
    const before = f.pages.accumulationPages;
    expect(f.pages.setCasterRevision("0", null)).toBe(false);
    expect(f.pages.setCasterRevision("0", "receiver+chimney-v1")).toBe(true);
    const complete = f.pages.accumulationPages;
    expect(complete[0].contentKey).not.toBe(before[0].contentKey);
    for (const page of before.filter((page) => page.id !== "0")) {
      expect(complete.find((next) => next.id === page.id)?.contentKey).toBe(
        page.contentKey
      );
    }
    const renders = f.pages.stats.depthRenders;
    f.pages.renderPageSample(f.camera, "0", 0, 1);
    expect(f.pages.stats.depthRenders).toBe(renders + 1);
    expect(f.pages.setCasterRevision("0", "receiver+chimney-v1")).toBe(false);
    expect(f.pages.setCasterRevision("0", null)).toBe(false);
    expect(f.pages.accumulationPages[0].contentKey).toBe(
      complete[0].contentKey
    );
    expect(f.pages.setCasterRevision("0", "receiver+chimney-v2")).toBe(true);
    f.pages.dispose();
  });

  it("renders one explicitly selected corridor without advancing other page samples", () => {
    const f = fixture();
    expect(f.pages.renderPageSample(f.camera, "0", 1, 4)).toBe(true);
    expect(f.pages.stats.colorPasses).toBe(1);
    expect(f.pages.stats.depthRenders).toBe(1);
    expect(f.colorViews).toEqual([f.camera]);
    expect(f.pages.renderPageSample(f.camera, "missing", 1, 4)).toBe(false);
    expect(f.pages.stats.colorPasses).toBe(1);
    f.pages.dispose();
  });

  it("publishes owned corridor bounds and RGB revisions without coupling light colour to depth invalidation", () => {
    const f = fixture();
    f.pages.renderSample(f.camera, 0, 4);
    const initial = f.pages.accumulationPages;
    initial[0].receiverBounds.makeEmpty();
    initial[0].screenBounds.set(0, 0, 0, 0);
    expect(f.pages.accumulationPages[0].receiverBounds.isEmpty()).toBe(false);
    expect(f.pages.accumulationPages[0].screenBounds.z).toBeGreaterThan(0);
    f.lighting.color = "red";
    f.lighting.intensity = 3;
    f.lighting.shadowIntensity = 0.5;
    f.setView();
    expect(f.pages.accumulationPages[0].revision).not.toBe(initial[0].revision);
    const depthRenders = f.pages.stats.depthRenders;
    f.pages.renderSample(f.camera, 0, 4);
    expect(f.pages.stats.depthRenders).toBe(depthRenders);
    const beforeContent = f.pages.accumulationPages[0].revision;
    const beforePresentation = f.pages.accumulationPages[0].presentationKey;
    f.pages.invalidateCasters(f.cells[0].bounds);
    expect(f.pages.accumulationPages[0].revision).not.toBe(beforeContent);
    expect(f.pages.accumulationPages[0].presentationKey).toBe(
      beforePresentation
    );
    f.lighting.directionToSun.set(0.5, 0.5, 0.7).normalize();
    f.setView();
    expect(f.pages.accumulationPages[0].presentationKey).not.toBe(
      beforePresentation
    );
    f.pages.dispose();
  });

  it("refuses ambiguous translucent receiver ownership but allows opaque alpha-tested geometry", () => {
    const f = fixture();
    const material = new THREE.MeshStandardMaterial({ alphaTest: 0.5 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.receiveShadow = true;
    f.scene.add(mesh);
    expect(f.pages.supportsOpaqueAccumulation).toBe(true);
    material.transparent = true;
    expect(f.pages.supportsOpaqueAccumulation).toBe(false);
    mesh.receiveShadow = false;
    expect(f.pages.supportsOpaqueAccumulation).toBe(true);
    mesh.receiveShadow = true;
    mesh.visible = false;
    expect(f.pages.supportsOpaqueAccumulation).toBe(true);
    mesh.visible = true;
    material.transparent = false;
    material.depthWrite = false;
    expect(f.pages.supportsOpaqueAccumulation).toBe(false);
    material.dispose();
    mesh.geometry.dispose();
    f.pages.dispose();
  });

  const configurePrewarm = (
    f: ReturnType<typeof fixture>,
    samples = 4,
    ids = ["warm"]
  ) => {
    const cells = ids.map((id, index) => ({
      id,
      bounds: f.cells[0].bounds
        .clone()
        .translate(new THREE.Vector3(300 + index * 40, 0, 0)),
    }));
    f.pages.setPrewarmView(
      cells,
      f.camera,
      new THREE.Vector2(1440, 1440),
      0.01,
      f.lighting,
      samples
    );
    return cells;
  };

  it("plans offscreen corridors and renders only the explicitly gated page without colour views", () => {
    const f = fixture();
    const cells = configurePrewarm(f, 4, ["warm", "not-ready"]);
    expect(f.pages.prewarmPages.map((page) => page.id)).toEqual([
      "warm",
      "not-ready",
    ]);
    expect(f.depths).toHaveLength(0);
    expect(f.pages.stats.pages).toBe(2);
    const descriptor = f.pages.prewarmPages[0];
    expect(descriptor.receiverBounds.equals(cells[0].bounds)).toBe(true);
    expect(descriptor.casterBounds.containsBox(cells[0].bounds)).toBe(true);
    descriptor.receiverBounds.makeEmpty();
    expect(f.pages.prewarmPages[0].receiverBounds.isEmpty()).toBe(false);
    for (let index = 0; index < 4; index += 1) {
      expect(f.pages.prewarmNext(f.camera, "warm")).toMatchObject({
        rendered: 1,
        cachedSamples: index + 1,
        totalSamples: 4,
        complete: index === 3,
        budgetLimited: false,
      });
    }
    expect(f.pages.prewarmNext(f.camera, "warm")).toMatchObject({
      rendered: 0,
      complete: true,
    });
    expect(f.pages.prewarmPages[1].cachedSamples).toBe(0);
    expect(f.colorViews).toHaveLength(0);
    expect(f.pages.stats.colorPasses).toBe(0);
    expect(f.depths).toHaveLength(4);
    for (const [, camera] of f.renderer.render.mock.calls) {
      expect(camera).toBeInstanceOf(THREE.ArrayCamera);
      expect((camera as THREE.ArrayCamera).cameras).toEqual([]);
      expect(camera.layers.mask).toBe(f.camera.layers.mask);
    }
    f.pages.dispose();
  });

  it("reuses the exact production controller sample sequence on a matching foreground revisit", () => {
    const f = fixture(8 * 1024 ** 2, 0.01);
    const cells = configurePrewarm(f);
    for (let sample = 0; sample < 4; sample += 1)
      f.pages.prewarmNext(f.camera, "warm");
    const matrices = f.shadowMatrices.map((matrix) => [...matrix]);
    f.camera.position.x += 300;
    f.camera.updateMatrixWorld(true);
    f.setView(cells, 0.01);
    for (let sample = 0; sample < 4; sample += 1)
      f.pages.renderSample(f.camera, sample, 4);
    expect(f.depths).toHaveLength(4);
    expect(f.pages.stats.hits).toBe(4);
    f.pages.clearCache();
    for (let sample = 0; sample < 4; sample += 1)
      f.pages.renderSample(f.camera, sample, 4);
    expect(f.shadowMatrices.slice(4)).toEqual(matrices);
    f.pages.dispose();
  });

  it("retains a useful subset without evicting protected visible sample targets", () => {
    const bytes = shadowDepthPageBytes(256, 256);
    const budget = 4 * bytes + 4;
    const f = fixture(budget, 0.01);
    f.pages.renderSample(f.camera, 0, 1);
    const visibleTargets = [...f.depths];
    configurePrewarm(f);
    expect(f.pages.prewarmNext(f.camera, "warm")).toMatchObject({
      rendered: 1,
      cachedSamples: 1,
      complete: false,
    });
    expect(f.pages.prewarmNext(f.camera, "warm")).toMatchObject({
      rendered: 0,
      cachedSamples: 1,
      budgetLimited: true,
      complete: false,
    });
    expect(
      f.pages.stats.cacheBytes + f.pages.stats.scratchBytes
    ).toBeLessThanOrEqual(budget);
    expect(f.disposed).not.toHaveBeenCalled();
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.pages.stats.hits).toBe(2);
    for (const target of visibleTargets)
      expect(f.disposed).not.toHaveBeenCalledWith(target);
    f.pages.dispose();
  });

  it("does no GPU work or eviction when even one offscreen direction cannot fit", () => {
    const f = fixture(3 * shadowDepthPageBytes(256, 256), 0.01);
    f.pages.renderSample(f.camera, 0, 1);
    configurePrewarm(f);
    expect(f.pages.canPrewarm("warm")).toBe(false);
    expect(f.pages.prewarmPages[0]).toMatchObject({
      canPrewarm: false,
      sampleBudget: 0,
    });
    expect(f.pages.prewarmNext(f.camera, "warm")).toMatchObject({
      rendered: 0,
      budgetLimited: true,
      complete: false,
    });
    expect(f.depths).toHaveLength(2);
    expect(f.disposed).not.toHaveBeenCalled();
    f.pages.dispose();
  });

  it("shares scarce sample slots across pages and does not starve every page for a tiny budget", () => {
    const bytes = shadowDepthPageBytes(256, 256);
    const f = fixture(5 * bytes + 4, 0.01);
    f.pages.renderSample(f.camera, 0, 1);
    configurePrewarm(f, 4, ["first", "second", "third"]);
    expect(f.pages.prewarmPages.map((page) => page.sampleBudget)).toEqual([
      1, 1, 0,
    ]);
    expect(f.pages.prewarmNext(f.camera, "first")).toMatchObject({
      rendered: 1,
      cachedSamples: 1,
    });
    expect(f.pages.prewarmNext(f.camera, "first")).toMatchObject({
      rendered: 0,
      budgetLimited: true,
    });
    expect(f.pages.prewarmPages.map((page) => page.sampleBudget)).toEqual([
      1, 1, 0,
    ]);
    expect(f.pages.prewarmNext(f.camera, "second")).toMatchObject({
      rendered: 1,
      cachedSamples: 1,
    });
    expect(f.pages.prewarmPages.every((page) => !page.canPrewarm)).toBe(true);
    expect(f.disposed).not.toHaveBeenCalled();
    f.pages.dispose();
  });

  it("restores host framebuffer, depth, scissor and renderer settings on success and failure", () => {
    const f = fixture();
    const background = new THREE.Color("red");
    f.scene.background = background;
    configurePrewarm(f);
    const saved = new Map(f.native);
    const render = f.renderer.render.getMockImplementation()!;
    const mutate = (scene: THREE.Scene, camera: THREE.Camera) => {
      expect(f.gl.getParameter(f.gl.DEPTH_RANGE)).toEqual([0, 1]);
      expect(f.renderer.getRenderTarget()).not.toBeNull();
      expect(f.renderer.xr.enabled).toBe(false);
      render(scene, camera);
      f.native.set(f.gl.DEPTH_FUNC, 999);
      f.native.set(f.gl.DEPTH_TEST, true);
      f.native.set(f.gl.SCISSOR_BOX, [0, 0, 1, 1]);
    };
    f.renderer.render.mockImplementationOnce(mutate);
    f.pages.prewarmNext(f.camera, "warm");
    expect(f.native).toEqual(saved);
    expect(f.renderer.getRenderTarget()).toBeNull();
    expect(f.renderer.getActiveCubeFace()).toBe(2);
    expect(f.renderer.getActiveMipmapLevel()).toBe(1);
    expect(f.renderer.clippingPlanes).toBe(f.clipping);
    expect(f.renderer.autoClear).toBe(true);
    expect(f.renderer.xr.enabled).toBe(true);
    expect(f.renderer.shadowMap.autoUpdate).toBe(false);
    expect(f.scene.background).toBe(background);
    f.renderer.render.mockImplementationOnce((scene, camera) => {
      mutate(scene, camera);
      throw new Error("prewarm failed");
    });
    expect(() => f.pages.prewarmNext(f.camera, "warm")).toThrow(
      "prewarm failed"
    );
    expect(f.native).toEqual(saved);
    expect(f.pages.prewarmPages[0].cachedSamples).toBe(1);
    expect(f.disposed).toHaveBeenCalledWith(f.depths[1]);
    f.pages.dispose();
  });

  it("does not publish cancelled or invalidated submissions and permits a later retry", () => {
    const f = fixture();
    const cells = configurePrewarm(f);
    const abort = new AbortController();
    abort.abort();
    expect(
      f.pages.prewarmNext(f.camera, "warm", { signal: abort.signal })
    ).toMatchObject({ rendered: 0, aborted: true });
    const during = new AbortController();
    const render = f.renderer.render.getMockImplementation()!;
    f.renderer.render.mockImplementationOnce((scene, camera) => {
      render(scene, camera);
      during.abort();
    });
    expect(
      f.pages.prewarmNext(f.camera, "warm", { signal: during.signal })
    ).toMatchObject({ rendered: 1, cachedSamples: 0, aborted: true });
    f.renderer.render.mockImplementationOnce((scene, camera) => {
      render(scene, camera);
      f.pages.invalidateCasters(cells[0].bounds);
    });
    expect(f.pages.prewarmNext(f.camera, "warm")).toMatchObject({
      rendered: 1,
      cachedSamples: 0,
    });
    expect(f.pages.prewarmNext(f.camera, "warm")).toMatchObject({
      rendered: 1,
      cachedSamples: 1,
    });
    f.pages.clearPrewarmView();
    expect(f.pages.prewarmNext(f.camera, "warm")).toMatchObject({
      rendered: 0,
      totalSamples: 0,
      complete: false,
    });
    f.pages.dispose();
    for (const target of new Set(f.depths))
      expect(
        f.disposed.mock.calls.filter(([value]) => value === target)
      ).toHaveLength(1);
  });

  it("invalidates all retained prewarm sun variants when missing casters arrive", () => {
    const f = fixture();
    const cells = configurePrewarm(f, 1);
    expect(f.pages.prewarmNext(f.camera, "warm").complete).toBe(true);
    f.lighting.directionToSun.set(1, 1, 0).normalize();
    configurePrewarm(f, 1);
    expect(f.pages.prewarmPages[0].cachedSamples).toBe(0);
    expect(f.pages.prewarmNext(f.camera, "warm").complete).toBe(true);
    expect(f.pages.stats.cachedSamplePages).toBe(2);
    expect(f.pages.invalidateCasters(cells[0].bounds)).toContain("warm");
    expect(f.pages.stats.cachedSamplePages).toBe(0);
    f.pages.dispose();
  });

  it("renders all visible cells, then reuses exact sample depths on a warm pan", () => {
    const f = fixture();
    for (let i = 0; i < 4; i += 1) f.pages.renderSample(f.camera, i, 4);
    expect(f.depths).toHaveLength(8);
    f.camera.position.x += 0.1;
    f.camera.updateMatrixWorld(true);
    f.setView();
    for (let i = 0; i < 4; i += 1) f.pages.renderSample(f.camera, i, 4);
    expect(f.depths).toHaveLength(8);
    expect(f.renderer.render).toHaveBeenCalledTimes(16);
    expect(f.pages.stats.hits).toBe(8);
    expect(f.renderer.clippingPlanes).toBe(f.clipping);
    expect(f.renderer.autoClear).toBe(true);
    f.pages.dispose();
  });

  it("does not invalidate raw shadows on a lighting colour change, but does on sun movement", () => {
    const f = fixture();
    f.pages.renderSample(f.camera, 0, 1);
    f.lighting.color = "red";
    f.lighting.intensity = 4;
    f.setView();
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(2);
    f.lighting.directionToSun.set(0, 1, 1).normalize();
    f.setView();
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(4);
    f.pages.dispose();
  });

  it("retains offscreen sample pages without rendering them and reuses them on return", () => {
    const f = fixture();
    for (let i = 0; i < 4; i += 1) f.pages.renderSample(f.camera, i, 4);
    const position = f.camera.position.clone();
    f.camera.position.x += 10_000;
    f.camera.updateMatrixWorld(true);
    f.setView();
    expect(f.pages.stats.pages).toBe(0);
    expect(f.pages.stats.dimensions).toEqual([]);
    expect(f.pages.stats.limitedPages).toBe(0);
    expect(f.pages.pageLevels).toEqual([]);
    expect(f.pages.stats.cachedSamplePages).toBe(8);
    expect(f.pages.stats.scratchBytes).toBe(0);
    f.pages.renderSample(f.camera, 0, 4);
    expect(f.renderer.render).toHaveBeenCalledTimes(8);
    expect(f.disposed).not.toHaveBeenCalled();

    f.camera.position.copy(position);
    f.camera.updateMatrixWorld(true);
    f.setView();
    for (let i = 0; i < 4; i += 1) f.pages.renderSample(f.camera, i, 4);
    expect(f.depths).toHaveLength(8);
    expect(f.pages.stats.hits).toBe(8);
    expect(f.pages.stats.pages).toBe(2);
    expect(f.pages.pageLevels).toHaveLength(2);
    expect(f.pages.stats.scratchBytes).toBeGreaterThan(0);
    f.pages.dispose();
  });

  it("invalidates retained offscreen pages when their caster corridor changes", () => {
    const f = fixture();
    f.pages.renderSample(f.camera, 0, 1);
    const position = f.camera.position.clone();
    f.camera.position.x += 10_000;
    f.camera.updateMatrixWorld(true);
    f.setView();
    expect(f.pages.stats.pages).toBe(0);
    expect(
      f.pages.invalidateCasters(
        new THREE.Box3(new THREE.Vector3(1, 5, 2), new THREE.Vector3(2, 6, 3))
      )
    ).toEqual(["0"]);
    expect(f.pages.stats.cachedSamplePages).toBe(1);

    f.camera.position.copy(position);
    f.camera.updateMatrixWorld(true);
    f.setView();
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(3);
    expect(f.pages.stats.hits).toBe(1);
    f.pages.dispose();
  });

  it("invalidates each page once for overlapping changes in one publication", () => {
    const f = fixture();
    const changes = Array.from(
      { length: 100 },
      () =>
        new THREE.Box3(new THREE.Vector3(1, 5, 2), new THREE.Vector3(2, 6, 3))
    );
    const before = f.pages.accumulationPages.map(({ revision }) => revision);
    expect(f.pages.invalidateCasters(changes)).toEqual(["0"]);
    const after = f.pages.accumulationPages.map(({ revision }) => revision);
    expect(after[0]).not.toEqual(before[0]);
    expect(after[1]).toEqual(before[1]);
    // One batch has exactly the same dependency revision as one matching edit.
    const reference = fixture();
    reference.pages.invalidateCasters(changes[0]);
    expect(after).toEqual(
      reference.pages.accumulationPages.map(({ revision }) => revision)
    );
    f.pages.dispose();
    reference.pages.dispose();
  });

  it("does not reuse a retained page after the sun changed while it was offscreen", () => {
    const f = fixture();
    f.pages.renderSample(f.camera, 0, 1);
    const position = f.camera.position.clone();
    f.camera.position.x += 10_000;
    f.camera.updateMatrixWorld(true);
    f.setView();
    f.lighting.directionToSun.set(0, 1, 1).normalize();
    f.setView();
    expect(f.pages.stats.cachedSamplePages).toBe(2);

    f.camera.position.copy(position);
    f.camera.updateMatrixWorld(true);
    f.setView();
    expect(f.pages.stats.cachedSamplePages).toBe(2);
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(4);
    expect(f.pages.stats.hits).toBe(0);
    f.pages.dispose();
  });

  it("reuses the original raw depth variant after a resolution-class round trip", () => {
    const f = fixture();
    f.pages.renderSample(f.camera, 0, 1);
    const originalDimensions = f.pages.stats.dimensions;
    f.setView(f.cells, 64);
    expect(f.pages.stats.dimensions).not.toEqual(originalDimensions);
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(4);
    expect(f.pages.stats.cachedSamplePages).toBe(4);
    expect(f.disposed).not.toHaveBeenCalled();

    f.setView();
    expect(f.pages.stats.dimensions).toEqual(originalDimensions);
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(4);
    expect(f.pages.stats.hits).toBe(2);
    expect(
      f.pages.invalidateCasters(
        new THREE.Box3(new THREE.Vector3(1, 5, 2), new THREE.Vector3(2, 6, 3))
      )
    ).toEqual(["0"]);
    expect(f.pages.stats.cachedSamplePages).toBe(2);
    f.pages.dispose();
  });

  it("keeps different finite-disc sample sequences separate and reusable", () => {
    const f = fixture();
    f.pages.renderSample(f.camera, 0, 4);
    f.pages.renderSample(f.camera, 0, 8);
    expect(f.depths).toHaveLength(4);
    expect(f.pages.stats.hits).toBe(0);
    f.pages.renderSample(f.camera, 0, 4);
    expect(f.depths).toHaveLength(4);
    expect(f.pages.stats.hits).toBe(2);
    f.pages.dispose();
  });

  it("invalidates older sun variants through their retained caster corridors", () => {
    const f = fixture();
    const cells = [f.cells[0]];
    f.lighting.directionToSun.set(1, 1, 0).normalize();
    f.setView(cells);
    f.pages.renderSample(f.camera, 0, 1);
    f.lighting.directionToSun.set(-1, 1, 0).normalize();
    f.setView(cells);
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.pages.stats.cachedSamplePages).toBe(2);
    expect(
      f.pages.invalidateCasters(
        new THREE.Box3(
          new THREE.Vector3(60, 40, 10),
          new THREE.Vector3(61, 41, 11)
        )
      )
    ).toEqual(["0"]);
    expect(f.pages.stats.cachedSamplePages).toBe(0);
    f.lighting.directionToSun.set(1, 1, 0).normalize();
    f.setView(cells);
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(3);
    expect(f.pages.stats.hits).toBe(0);
    f.pages.dispose();
  });

  it("evicts inactive samples for new active pages without cycling active samples", () => {
    const budget = 3 * shadowDepthPageBytes(256, 256);
    const f = fixture(budget, 0.01);
    expect(f.pages.stats.dimensions).toEqual(["256×256", "256×256"]);
    f.pages.renderSample(f.camera, 0, 1);
    const previousTargets = [...f.depths];
    const offset = new THREE.Vector3(10_000, 0, 0);
    const cells = f.cells.map(({ id, bounds }) => ({
      id: `next-${id}`,
      bounds: bounds.clone().translate(offset),
    }));
    f.camera.position.add(offset);
    f.camera.updateMatrixWorld(true);
    f.setView(cells);
    expect(f.disposed).not.toHaveBeenCalled();
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(4);
    for (const target of previousTargets) {
      expect(
        f.disposed.mock.calls.filter(([value]) => value === target)
      ).toHaveLength(1);
    }
    expect(f.pages.stats.cachedSamplePages).toBe(2);
    expect(
      f.pages.stats.cacheBytes + f.pages.stats.scratchBytes
    ).toBeLessThanOrEqual(budget);
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(4);
    expect(f.pages.stats.hits).toBe(2);
    f.pages.dispose();
  });

  it("bounds warm page residency by recency and disposes evicted and retained targets once", () => {
    const f = fixture(64 * 1024 ** 2);
    const position = f.camera.position.clone();
    const visit = (index: number) => {
      const offset = new THREE.Vector3(index * 1_000, 0, 0);
      f.camera.position.copy(position).add(offset);
      f.camera.updateMatrixWorld(true);
      f.setView([
        {
          id: `warm-${index}`,
          bounds: f.cells[0].bounds.clone().translate(offset),
        },
      ]);
      f.pages.renderSample(f.camera, 0, 1);
    };
    for (let index = 0; index < 33; index += 1) visit(index);
    expect(f.depths).toHaveLength(33);
    expect(f.pages.stats.pages).toBe(1);
    expect(f.pages.stats.cachedSamplePages).toBe(32);
    expect(
      f.scene.children.filter(
        (object) => object instanceof THREE.DirectionalLight
      )
    ).toHaveLength(32);
    expect(f.disposed).toHaveBeenCalledWith(f.depths[0]);
    visit(1);
    visit(33);
    visit(1);
    expect(f.depths).toHaveLength(34);
    expect(f.pages.stats.hits).toBe(2);
    expect(f.disposed).toHaveBeenCalledWith(f.depths[2]);
    expect(f.disposed).not.toHaveBeenCalledWith(f.depths[1]);

    f.pages.dispose();
    f.pages.dispose();
    expect(f.pages.stats.pages).toBe(0);
    expect(f.pages.stats.cachedSamplePages).toBe(0);
    expect(f.pages.pageLevels).toEqual([]);
    for (const target of new Set(f.depths)) {
      expect(
        f.disposed.mock.calls.filter(([value]) => value === target)
      ).toHaveLength(1);
    }
    expect(
      f.scene.children.filter(
        (object) => object instanceof THREE.DirectionalLight
      )
    ).toEqual([]);
  });

  it("invalidates only intersecting caster corridors, including newly loaded geometry", () => {
    const f = fixture();
    f.pages.renderSample(f.camera, 0, 1);
    expect(
      f.pages.invalidateCasters(
        new THREE.Box3(new THREE.Vector3(1, 5, 2), new THREE.Vector3(2, 6, 3))
      )
    ).toEqual(["0"]);
    f.pages.renderSample(f.camera, 0, 1);
    expect(f.depths).toHaveLength(3);
    expect(
      f.pages.invalidateCasters(
        new THREE.Box3(
          new THREE.Vector3(-900, 0, 0),
          new THREE.Vector3(-899, 1, 1)
        )
      )
    ).toEqual([]);
    f.pages.dispose();
  });

  it("streams a non-fitting disc without exceeding the attachment budget or losing all cache hits", () => {
    const budget = 2 * shadowDepthPageBytes(256, 256);
    const f = fixture(budget);
    for (let sweep = 0; sweep < 2; sweep += 1) {
      for (let i = 0; i < 8; i += 1) f.pages.renderSample(f.camera, i, 8);
      expect(
        f.pages.stats.cacheBytes + f.pages.stats.scratchBytes
      ).toBeLessThanOrEqual(budget);
    }
    expect(f.pages.stats.hits).toBeGreaterThan(0);
    const targets = [...new Set(f.depths)];
    const disposals = targets.map((t) => vi.spyOn(t, "dispose"));
    f.pages.dispose();
    f.pages.dispose();
    for (const disposed of disposals) expect(disposed).toHaveBeenCalledOnce();
  });

  it("keeps hard depth through alternating soft integration and hard presentation", () => {
    const budget = 2 * shadowDepthPageBytes(256, 256);
    const f = fixture(budget, 0.001);
    f.pages.renderPageSample(f.camera, "0", 0, 1);
    const retainedHard = f.depths[0];
    const dispose = vi.spyOn(retainedHard, "dispose");
    for (let sample = 0; sample < 8; sample += 1) {
      f.pages.renderPageSample(f.camera, "0", sample, 8);
      const depthRenders = f.pages.stats.depthRenders;
      f.pages.renderPageSample(f.camera, "0", 0, 1);
      expect(f.pages.stats.depthRenders).toBe(depthRenders);
      expect(
        f.pages.stats.cacheBytes + f.pages.stats.scratchBytes
      ).toBeLessThanOrEqual(budget);
    }
    expect(dispose).not.toHaveBeenCalled();
    expect(f.pages.stats.hits).toBeGreaterThanOrEqual(8);
    f.pages.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("restores the renderer on errors and rejects invalid samples", () => {
    const f = fixture();
    f.renderer.render.mockImplementationOnce(() => {
      throw new Error("render error");
    });
    expect(() => f.pages.renderSample(f.camera, 0, 4)).toThrow("render error");
    expect(f.renderer.clippingPlanes).toBe(f.clipping);
    expect(f.renderer.autoClear).toBe(true);
    expect(() => f.pages.renderSample(f.camera, 4, 4)).toThrow(RangeError);
    f.pages.dispose();
  });

  it("releases both depth and colour attachments on targeted cache invalidation", () => {
    const cache = new ShadowDepthPageCache();
    cache.setBudget(1_000_000, 0);
    const target = new THREE.WebGLRenderTarget(64, 64);
    target.depthTexture = new THREE.DepthTexture(64, 64);
    const depth = vi.spyOn(target.depthTexture, "dispose");
    const color = vi.spyOn(target, "dispose");
    expect(cache.admit("sample", "cell", target)).toBe(true);
    cache.invalidate("cell");
    cache.clear();
    expect(depth).toHaveBeenCalledOnce();
    expect(color).toHaveBeenCalledOnce();
    expect(cache.bytes).toBe(0);
  });

  it("admits active variants by evicting older classes of the same page first", () => {
    const cache = new ShadowDepthPageCache();
    const bytes = shadowDepthPageBytes(64, 64);
    cache.setBudget(2 * bytes, 0);
    const previous = new THREE.WebGLRenderTarget(64, 64);
    const current = new THREE.WebGLRenderTarget(64, 64);
    const next = new THREE.WebGLRenderTarget(64, 64);
    const streamed = new THREE.WebGLRenderTarget(64, 64);
    const disposePrevious = vi.spyOn(previous, "dispose");
    expect(cache.admit("previous-0", "cell", previous, "previous")).toBe(true);
    expect(cache.admit("current-0", "cell", current, "current")).toBe(true);
    cache.setActiveVariants(new Set(["current"]));
    expect(cache.admit("current-1", "cell", next, "current")).toBe(true);
    expect(disposePrevious).toHaveBeenCalledOnce();
    expect(cache.get("previous-0")).toBeUndefined();
    expect(cache.get("current-0")).toBe(current);
    expect(cache.admit("current-2", "cell", streamed, "current")).toBe(false);
    expect(cache.get("current-0")).toBe(current);
    expect(cache.get("current-1")).toBe(next);
    cache.invalidate("cell");
    expect(cache.count).toBe(0);
    cache.clear();
    streamed.dispose();
  });

  it("removes inactive variants first when the scratch reservation grows", () => {
    const cache = new ShadowDepthPageCache();
    const bytes = shadowDepthPageBytes(64, 64);
    cache.setBudget(3 * bytes, 0);
    const active = new THREE.WebGLRenderTarget(64, 64);
    const inactive = new THREE.WebGLRenderTarget(64, 64);
    expect(cache.admit("active", "visible", active)).toBe(true);
    expect(cache.admit("inactive", "warm", inactive)).toBe(true);
    cache.setActiveVariants(new Set(["visible"]));
    cache.setBudget(3 * bytes, 2 * bytes);
    expect(cache.get("active")).toBe(active);
    expect(cache.get("inactive")).toBeUndefined();
    expect(cache.bytes).toBe(bytes);
    cache.clear();
  });
});
