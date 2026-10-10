import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";
import {
  createSharedThreePhotoDepth,
  photoSourceClipMatrix,
  photoDepthSource,
} from "./shared-three-photo-depth";

// Full sensor UV for a camera at the origin looking down -Z. Its depth row is metres.
const projection = () =>
  new THREE.Matrix4().set(
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
const setup = () => {
  const geometry = new THREE.PlaneGeometry(20, 20);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -10;
  const root = new THREE.Group();
  root.add(mesh);
  root.updateMatrixWorld(true);
  const runtimes = new Map([
    [
      "terrain",
      {
        id: "terrain",
        root,
        mountsOnLocalFrame: true,
        providesTerrain: true,
      } as unknown as SharedThreeSceneRuntime,
    ],
  ]);
  const depth = createSharedThreePhotoDepth(runtimes);
  const oldTarget = new THREE.WebGLRenderTarget(4, 4);
  let target: THREE.WebGLRenderTarget | null = oldTarget;
  const targets = new Set<THREE.WebGLRenderTarget>();
  const gl = {
    FRAMEBUFFER_BINDING: 1,
    DEPTH_RANGE: 2,
    FRAMEBUFFER: 3,
    getParameter: (key: number) =>
      key === 1 ? "host" : new Float32Array([0.2, 0.8]),
    depthRange: vi.fn(),
    bindFramebuffer: vi.fn(),
  };
  const renderer = {
    autoClear: true,
    capabilities: { maxTextureSize: 8192 },
    getContext: () => gl,
    getRenderTarget: () => target,
    setRenderTarget: vi.fn((value: THREE.WebGLRenderTarget | null) => {
      target = value;
      if (value && value !== oldTarget) targets.add(value);
    }),
    getViewport: (v: THREE.Vector4) => v.set(1, 2, 400, 300),
    getScissor: (v: THREE.Vector4) => v.set(1, 2, 400, 300),
    getScissorTest: () => true,
    getClearColor: (v: THREE.Color) => v.setRGB(0.1, 0.2, 0.3),
    getClearAlpha: () => 0.4,
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    resetState: vi.fn(() => {
      target = null;
    }),
    render: vi.fn(),
  };
  const render = (p: THREE.Matrix4) =>
    depth.renderSource(renderer as unknown as THREE.WebGLRenderer, p);
  const dispose = () => {
    depth.dispose();
    geometry.dispose();
    material.dispose();
    oldTarget.dispose();
  };
  return {
    depth,
    root,
    mesh,
    material,
    geometry,
    runtimes,
    renderer,
    gl,
    oldTarget,
    targets,
    render,
    dispose,
  };
};

describe("photo source depth", () => {
  it("uses displayed snapshot dimensions, preserves aspect ratio and only rerenders on resolution changes", () => {
    const f = setup();
    try {
      const p = projection();
      const texture = new THREE.Texture({ width: 640, height: 360 });
      const request = photoDepthSource(p, texture);
      f.depth.setSources([request, { projection: p, width: 320, height: 180 }]);
      f.depth.sync();
      f.render(p);
      expect(f.depth.state.sizes).toEqual([{ width: 640, height: 360 }]);
      expect(f.depth.state.allocatedBytes).toBe(640 * 360 * 8);
      f.depth.setSources([request]);
      expect(f.render(p)!.changed).toBe(false);
      const old = [...f.targets][0],
        disposed = vi.spyOn(old, "dispose");
      f.depth.setSources([{ projection: p, width: 960, height: 540 }]);
      expect(disposed).toHaveBeenCalledOnce();
      expect(f.render(p)!.changed).toBe(true);
      expect(f.depth.state.sizes).toEqual([{ width: 960, height: 540 }]);
      f.depth.setSources([{ projection: p, width: 4096, height: 2048 }]);
      f.render(p);
      expect(f.depth.state.sizes).toEqual([{ width: 2048, height: 1024 }]);
      texture.dispose();
    } finally {
      f.dispose();
    }
  });

  it("retains calibrated UV, uses positive metric depth and separates first surface from hidden ground", () => {
    const p = projection();
    // Off-centre principal point remains part of the calibrated source projection.
    p.elements[8] = -0.3;
    p.elements[9] = -0.65;
    const clip = photoSourceClipMatrix(p, 1, 20000);
    const project = (point: THREE.Vector3) =>
      new THREE.Vector4(...point.toArray(), 1).applyMatrix4(clip);
    for (const point of [
      new THREE.Vector3(0, 0, -10),
      new THREE.Vector3(2, -1, -20),
    ]) {
      const uv = new THREE.Vector4(...point.toArray(), 1).applyMatrix4(p);
      const c = project(point);
      expect((c.x / c.w + 1) / 2).toBeCloseTo(uv.x / uv.w, 12);
      expect((c.y / c.w + 1) / 2).toBeCloseTo(uv.y / uv.w, 12);
    }
    expect(project(new THREE.Vector3(0, 0, -1)).z).toBeCloseTo(-1, 12);
    expect(project(new THREE.Vector3(0, 0, -20000)).z / 20000).toBeCloseTo(
      1,
      12
    );
    const eyeDepth = (point: THREE.Vector3) => {
      const c = project(point);
      const ndc = c.z / c.w;
      return (2 * 1 * 20000) / (20001 - ndc * 19999);
    };
    const wall = eyeDepth(new THREE.Vector3(0, 0, -10));
    const ground = eyeDepth(new THREE.Vector3(0, 0, -20));
    expect(wall).toBeCloseTo(10, 10);
    expect(ground).toBeCloseTo(20, 10);
    expect(wall <= wall + 0.1).toBe(true);
    expect(ground <= wall + 0.1).toBe(false);
    expect(project(new THREE.Vector3(0, 0, 10)).w).toBeLessThan(0);
  });

  it("shares source cameras across crops and caches depth until receiver geometry changes", () => {
    const f = setup();
    try {
      const p = projection();
      f.depth.setSources([p, p.clone()]);
      f.depth.sync();
      const first = f.render(p)!;
      expect(first.changed).toBe(true);
      expect(f.depth.state.sources).toBe(1);
      expect(f.render(p)!.changed).toBe(false);
      expect(f.depth.state.depthRenderCount).toBe(1);
      expect(f.depth.state.cacheHits).toBe(1);
      f.mesh.position.x = 2;
      f.root.updateMatrixWorld(true);
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      const proxy = (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
        .children[0] as THREE.Mesh;
      expect(proxy.matrix.equals(f.mesh.matrixWorld)).toBe(true);
      expect(proxy.geometry).toBe(f.geometry);
      expect(f.renderer.getRenderTarget()).toBe(f.oldTarget);
      expect(f.renderer.autoClear).toBe(true);
      expect(
        f.renderer.setRenderTarget.mock.invocationCallOrder.at(-1)
      ).toBeGreaterThan(
        f.renderer.setViewport.mock.invocationCallOrder.at(-1)!
      );
      expect(f.gl.depthRange.mock.calls.at(-1)).toEqual([
        expect.closeTo(0.2, 6),
        expect.closeTo(0.8, 6),
      ]);
    } finally {
      f.dispose();
    }
  });

  it("invalidates updated alpha pixels, visibility and local-frame rebases, preserving borrowed resources", () => {
    const f = setup();
    const alpha = new THREE.Texture();
    f.material.alphaMap = alpha;
    f.material.alphaTest = 0.5;
    try {
      const disposeTexture = vi.spyOn(alpha, "dispose"),
        disposeGeometry = vi.spyOn(f.geometry, "dispose");
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      f.render(p);
      alpha.needsUpdate = true;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      f.root.visible = false;
      f.depth.sync();
      expect(f.render(p)).toBeNull();
      f.root.visible = true;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      const rebased = p
        .clone()
        .multiply(new THREE.Matrix4().makeTranslation(10, 0, 0));
      const old = [...f.targets][0],
        release = vi.spyOn(old, "dispose");
      f.depth.setSources([rebased]);
      expect(release).toHaveBeenCalledOnce();
      expect(f.render(p)).toBeNull();
      expect(f.render(rebased)!.changed).toBe(true);
      f.depth.detach();
      expect(f.depth.state.targets).toBe(0);
      expect(disposeTexture).not.toHaveBeenCalled();
      expect(disposeGeometry).not.toHaveBeenCalled();
    } finally {
      f.dispose();
      alpha.dispose();
    }
  });

  it("bounds all active camera targets together and reuses each source without a rotating-slot cache", () => {
    const f = setup();
    try {
      const cameras = Array.from({ length: 8 }, (_, i) =>
        projection().multiply(new THREE.Matrix4().makeTranslation(i, 0, 0))
      );
      f.depth.setSources(cameras);
      f.depth.sync();
      cameras.forEach(f.render);
      expect(f.depth.state.targets).toBe(8);
      expect(f.depth.state.allocatedBytes).toBeLessThanOrEqual(
        12 * 1024 * 1024 * 8
      );
      expect(f.depth.state.depthRenderCount).toBe(8);
      cameras.forEach((p) => expect(f.render(p)!.changed).toBe(false));
      expect(f.depth.state.depthRenderCount).toBe(8);
      const disposes = [...f.targets].map((t) => vi.spyOn(t, "dispose"));
      f.depth.setSources([]);
      expect(f.depth.state.targets).toBe(0);
      disposes.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
      f.depth.setSources([new THREE.Matrix4().multiplyScalar(0)]);
      expect(f.depth.state.sources).toBe(0);
    } finally {
      f.dispose();
    }
  });
});

describe("depth synchronization costs", () => {
  it("reuses retained proxies across publication revisions and reconciles membership", () => {
    const f = setup();
    let version = 0;
    f.runtimes.get("terrain")!.mapStyleProjectionVersion = () => version;
    try {
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      f.render(p);
      const scene = f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene;
      const proxy = scene.children[0];
      const clone = vi.spyOn(f.mesh, "clone");
      version++;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(false);
      expect(scene.children[0]).toBe(proxy);
      expect(clone).not.toHaveBeenCalled();
      const extra = new THREE.Mesh(f.geometry, f.material);
      f.root.add(extra);
      f.root.updateMatrixWorld(true);
      version++;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      expect(scene.children).toHaveLength(2);
      expect(scene.children).toContain(proxy);
      f.root.remove(extra);
      version++;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      expect(scene.children).toEqual([proxy]);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });
  it("ignores opaque RGB uploads but tracks alpha modes, displacement, clipping and morph poses", () => {
    const f = setup();
    const texture = new THREE.Texture();
    f.material.map = texture;
    try {
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      f.render(p);
      const proxy = (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
        .children[0] as THREE.Mesh;
      expect((proxy.material as THREE.MeshDepthMaterial).map).toBeNull();
      texture.needsUpdate = true;
      texture.matrix.makeTranslation(0.2, 0.3);
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(false);
      for (const mode of ["alphaTest", "alphaHash", "transparent"] as const) {
        f.material.alphaTest = mode === "alphaTest" ? 0.5 : 0;
        f.material.alphaHash = mode === "alphaHash";
        f.material.transparent = mode === "transparent";
        f.depth.sync();
        expect(f.render(p)!.changed).toBe(true);
        expect((proxy.material as THREE.MeshDepthMaterial).map).toBe(texture);
        expect((proxy.material as THREE.MeshDepthMaterial).alphaHash).toBe(
          f.material.alphaHash
        );
        texture.needsUpdate = true;
        f.depth.sync();
        expect(f.render(p)!.changed).toBe(true);
      }
      f.material.transparent = false;
      const shape = f.material as THREE.MeshBasicMaterial & {
        displacementMap?: THREE.Texture;
        displacementScale?: number;
      };
      shape.displacementMap = texture;
      shape.displacementScale = 1;
      f.depth.sync();
      f.render(p);
      texture.needsUpdate = true;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      shape.displacementScale = 2;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      f.material.clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 1),
      ];
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      f.material.clippingPlanes[0].constant = 2;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      f.mesh.morphTargetInfluences = [0];
      f.depth.sync();
      f.render(p);
      f.mesh.morphTargetInfluences[0] = 0.5;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
    } finally {
      f.dispose();
      texture.dispose();
    }
  });
});

it.each([false, true])(
  "restores explicit source-depth host state, nested=%s, without GL reads even on failure",
  (nested) => {
    const f = setup();
    const framebuffer = {} as WebGLFramebuffer;
    try {
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      if (!nested) f.renderer.setRenderTarget(null);
      const reads = vi.spyOn(f.gl, "getParameter").mockImplementation(() => {
        throw Error("unexpected sync read");
      });
      f.renderer.render.mockImplementationOnce(() => {
        throw Error("render failed");
      });
      expect(() =>
        f.depth.renderSource(f.renderer as unknown as THREE.WebGLRenderer, p, {
          framebuffer,
          depthRange: [0.2, 0.8],
        })
      ).toThrow("render failed");
      expect(reads).not.toHaveBeenCalled();
      expect(f.renderer.getRenderTarget()).toBe(nested ? f.oldTarget : null);
      expect(f.gl.depthRange).toHaveBeenLastCalledWith(
        ...(nested ? [0, 1] : [0.2, 0.8])
      );
      if (nested) expect(f.gl.bindFramebuffer).not.toHaveBeenCalled();
      else
        expect(f.gl.bindFramebuffer).toHaveBeenLastCalledWith(
          f.gl.FRAMEBUFFER,
          framebuffer
        );
    } finally {
      f.dispose();
    }
  }
);
