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

describe("direct receiver positions", () => {
  it("caches an opt-in material on the same proxies and preserves the default depth pass", () => {
    const f = setup();
    try {
      const camera = new THREE.Camera();
      const renderer = f.renderer as unknown as THREE.WebGLRenderer;
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      f.render(p);
      const proxy = (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
        .children[0] as THREE.Mesh;
      const depthMaterial = proxy.material as THREE.MeshDepthMaterial;
      let positionMaterial: THREE.MeshDepthMaterial | undefined;
      const traverse = vi.spyOn(f.root, "traverse").mockImplementation(() => {
        throw Error("positions pass must not resync sources");
      });
      f.renderer.render.mockImplementation((scene: THREE.Scene) => {
        expect(scene.children[0]).toBe(proxy);
        const material = proxy.material as THREE.MeshDepthMaterial;
        if (positionMaterial) expect(material).toBe(positionMaterial);
        positionMaterial = material;
        expect(material).not.toBe(depthMaterial);
        expect(material.colorWrite).toBe(true);
        expect(material.toneMapped).toBe(false);
        expect(material.blending).toBe(THREE.NoBlending);
        expect(material.depthTest).toBe(true);
        expect(material.depthWrite).toBe(true);
      });
      const callsBefore = f.renderer.render.mock.calls.length;
      f.depth.renderView(renderer, camera, { positions: true });
      f.depth.renderView(renderer, camera, { positions: true });
      expect(f.renderer.render).toHaveBeenCalledTimes(callsBefore + 2);
      expect(proxy.material).toBe(depthMaterial);
      expect(traverse).not.toHaveBeenCalled();
      f.renderer.render.mockImplementation(() => {
        expect(proxy.material).toBe(depthMaterial);
        expect(depthMaterial.colorWrite).toBe(false);
      });
      f.depth.renderView(renderer, camera);
      f.depth.renderView(renderer, camera, { positions: false });
      expect(f.render(p)?.changed).toBe(false);
      const dispose = vi.spyOn(positionMaterial!, "dispose");
      f.depth.detach();
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      f.dispose();
    }
  });

  it("keeps alpha, clipping and deformed-vertex shader stages before direct world output", () => {
    const f = setup();
    const texture = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({
      map: texture,
      alphaMap: texture,
      alphaTest: 0.4,
      alphaHash: true,
      side: THREE.DoubleSide,
      opacity: 0.7,
      displacementMap: texture,
      displacementScale: 2,
      displacementBias: -0.5,
      clippingPlanes: [new THREE.Plane(new THREE.Vector3(1, 0, 0), 3)],
      clipIntersection: true,
    });
    const mesh = new THREE.Mesh(f.geometry, source);
    f.root.remove(f.mesh);
    f.root.add(mesh);
    mesh.morphTargetInfluences = [0.4];
    try {
      f.depth.sync();
      const renderer = f.renderer as unknown as THREE.WebGLRenderer;
      const captured: THREE.MeshDepthMaterial[] = [];
      f.renderer.render.mockImplementation((scene: THREE.Scene) => {
        const proxy = scene.children[0] as THREE.Mesh;
        const material = proxy.material as THREE.MeshDepthMaterial;
        captured.push(material);
        expect(proxy.morphTargetInfluences).toEqual([0.4]);
        for (const key of [
          "map",
          "alphaMap",
          "alphaTest",
          "alphaHash",
          "side",
          "opacity",
          "displacementMap",
          "displacementScale",
          "displacementBias",
          "clippingPlanes",
          "clipIntersection",
        ] as const)
          expect(material[key]).toBe(source[key]);
        const shader = {
          vertexShader: THREE.ShaderLib.depth.vertexShader,
          fragmentShader: THREE.ShaderLib.depth.fragmentShader,
          uniforms: {},
        } as Parameters<THREE.Material["onBeforeCompile"]>[0];
        material.onBeforeCompile(shader, renderer);
        const world = shader.vertexShader.indexOf(
          "vec4 carmaPhotoWorldPosition"
        );
        for (const chunk of [
          "morphtarget_vertex",
          "skinning_vertex",
          "displacementmap_vertex",
          "project_vertex",
        ])
          expect(
            shader.vertexShader.indexOf(`#include <${chunk}>`)
          ).toBeLessThan(world);
        expect(shader.vertexShader).toContain(
          "batchingMatrix * carmaPhotoWorldPosition"
        );
        expect(shader.vertexShader).toContain(
          "instanceMatrix * carmaPhotoWorldPosition"
        );
        expect(shader.vertexShader).toContain(
          "(modelMatrix * carmaPhotoWorldPosition).xyz"
        );
        const output = shader.fragmentShader.indexOf(
          "gl_FragColor = vec4(carmaPhotoScenePosition, 1.0)"
        );
        for (const chunk of [
          "clipping_planes_fragment",
          "alphatest_fragment",
          "alphahash_fragment",
          "logdepthbuf_fragment",
        ])
          expect(
            shader.fragmentShader.indexOf(`#include <${chunk}>`)
          ).toBeLessThan(output);
        expect(shader.fragmentShader).not.toContain(
          "#include <colorspace_fragment>"
        );
        expect(shader.fragmentShader).not.toContain(
          "#include <tonemapping_fragment>"
        );
      });
      f.depth.renderView(renderer, new THREE.Camera(), { positions: true });
      source.alphaTest = 0.6;
      source.displacementScale = 3;
      f.depth.sync();
      f.depth.renderView(renderer, new THREE.Camera(), { positions: true });
      expect(captured[1]).toBe(captured[0]);
    } finally {
      f.dispose();
      source.dispose();
      texture.dispose();
    }
  });

  it("restores grouped depth materials after render failure and releases both caches", () => {
    const f = setup();
    const second = new THREE.MeshBasicMaterial();
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(f.geometry, [f.material, second, hidden]);
    f.root.remove(f.mesh);
    f.root.add(mesh);
    try {
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      f.render(p);
      const proxy = (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
        .children[0] as THREE.Mesh;
      const depthMaterials = proxy.material as THREE.MeshDepthMaterial[];
      expect(
        depthMaterials.every(
          (material) => !material.visible || !material.colorWrite
        )
      ).toBe(true);
      let positionMaterials: THREE.MeshDepthMaterial[] = [];
      f.renderer.render.mockImplementationOnce(() => {
        positionMaterials = proxy.material as THREE.MeshDepthMaterial[];
        expect(positionMaterials).not.toBe(depthMaterials);
        expect(positionMaterials[0].colorWrite).toBe(true);
        expect(positionMaterials[1].colorWrite).toBe(true);
        expect(positionMaterials[2].visible).toBe(false);
        throw Error("positions render failed");
      });
      expect(() =>
        f.depth.renderView(
          f.renderer as unknown as THREE.WebGLRenderer,
          new THREE.Camera(),
          { positions: true }
        )
      ).toThrow("positions render failed");
      expect(proxy.material).toBe(depthMaterials);
      const disposes = [
        ...depthMaterials.slice(0, 2),
        ...positionMaterials.slice(0, 2),
      ].map((material) => vi.spyOn(material, "dispose"));
      f.root.remove(mesh);
      f.runtimes.get("terrain")!.mapStyleProjectionVersion = () => 1;
      f.depth.sync();
      disposes.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    } finally {
      f.dispose();
      second.dispose();
      hidden.dispose();
    }
  });
});

describe("depth synchronization costs", () => {
  it("never clones objects or serializes userData and preserves borrowed geometry", () => {
    const f = setup();
    try {
      const p = projection();
      f.mesh.userData.self = f.mesh.userData;
      f.mesh.userData.cachedGeometry = f.geometry;
      const toJSON = vi.spyOn(f.geometry, "toJSON").mockImplementation(() => {
        throw Error("geometry serialization forbidden");
      });
      const clone = vi.spyOn(f.mesh, "clone").mockImplementation(() => {
        throw Error("Object3D copy forbidden");
      });
      f.mesh.frustumCulled = false;
      f.mesh.renderOrder = 7;
      f.mesh.layers.set(3);
      f.depth.setSources([p]);
      expect(() => f.depth.sync()).not.toThrow();
      f.render(p);
      const proxy = (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
        .children[0] as THREE.Mesh;
      expect(proxy).not.toBe(f.mesh);
      expect(proxy.geometry).toBe(f.geometry);
      expect(proxy.geometry.attributes.position).toBe(
        f.geometry.attributes.position
      );
      expect(proxy.userData).toEqual({});
      expect(proxy.children).toHaveLength(0);
      expect(proxy.matrix.equals(f.mesh.matrixWorld)).toBe(true);
      expect(proxy.layers.mask).toBe(f.mesh.layers.mask);
      expect(proxy.frustumCulled).toBe(false);
      expect(proxy.renderOrder).toBe(7);
      expect(proxy.castShadow).toBe(false);
      expect(proxy.receiveShadow).toBe(false);
      expect(proxy.material).toBeInstanceOf(THREE.MeshDepthMaterial);
      const geometryDispose = vi.spyOn(f.geometry, "dispose");
      const materialDispose = vi.spyOn(f.material, "dispose");
      f.depth.dispose();
      expect(geometryDispose).not.toHaveBeenCalled();
      expect(materialDispose).not.toHaveBeenCalled();
      expect(toJSON).not.toHaveBeenCalled();
      expect(clone).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });

  it.each(["view", "source", "positions"] as const)(
    "updates %s depth proxy world matrices after a manually managed source refit",
    (pass) => {
      const f = setup();
      try {
        const p = projection();
        const camera = new THREE.Camera();
        f.mesh.matrixAutoUpdate = false;
        f.mesh.matrixWorldAutoUpdate = false;
        const localMatrix = f.mesh.matrix.clone();
        const firstWorld = new THREE.Matrix4().makeTranslation(1, 2, -10);
        const secondWorld = new THREE.Matrix4().makeTranslation(7, 3, -12);
        f.mesh.matrixWorld.copy(firstWorld);
        // Match WebGLRenderer's real scene update, including Object3D's world-auto guard.
        f.renderer.render.mockImplementation((scene: THREE.Scene) => {
          if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld();
        });
        const render = () => {
          if (pass !== "source")
            f.depth.renderView(
              f.renderer as unknown as THREE.WebGLRenderer,
              camera,
              { positions: pass === "positions" }
            );
          else expect(f.render(p)?.changed).toBe(true);
          return (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
            .children[0] as THREE.Mesh;
        };
        f.depth.setSources([p]);
        f.depth.sync();
        const proxy = render();
        expect(proxy.matrixWorldAutoUpdate).toBe(true);
        expect(proxy.matrixAutoUpdate).toBe(false);
        expect(proxy.matrixWorld.equals(firstWorld)).toBe(true);
        expect(f.mesh.matrixWorld.equals(firstWorld)).toBe(true);

        f.mesh.matrixWorld.copy(secondWorld);
        f.depth.sync();
        expect(render()).toBe(proxy);
        expect(proxy.matrix.equals(secondWorld)).toBe(true);
        expect(proxy.matrixWorld.equals(secondWorld)).toBe(true);
        expect(f.mesh.matrixWorld.equals(secondWorld)).toBe(true);
        expect(f.mesh.matrix.equals(localMatrix)).toBe(true);
        expect(f.mesh.matrixWorldAutoUpdate).toBe(false);
      } finally {
        f.dispose();
      }
    }
  );

  it("borrows instanced matrices, colors, morph texture and bounds without copying buffers", () => {
    const f = setup(),
      texture = new THREE.DataTexture(
        new Float32Array(8),
        2,
        1,
        THREE.RGBAFormat,
        THREE.FloatType
      );
    const source = new THREE.InstancedMesh(f.geometry, f.material, 2);
    f.root.remove(f.mesh);
    f.root.add(source);
    source.position.z = -10;
    source.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(6),
      3
    );
    source.morphTexture = texture;
    source.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    source.boundingBox = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1)
    );
    source.userData.self = source.userData;
    f.root.updateMatrixWorld(true);
    try {
      const matrixClone = vi
        .spyOn(source.instanceMatrix, "clone")
        .mockImplementation(() => {
          throw Error("instance buffer copy forbidden");
        });
      const colorClone = vi
        .spyOn(source.instanceColor, "clone")
        .mockImplementation(() => {
          throw Error("color buffer copy forbidden");
        });
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      f.render(p);
      const proxy = (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
        .children[0] as THREE.InstancedMesh;
      expect(proxy).toBeInstanceOf(THREE.InstancedMesh);
      expect(proxy.count).toBe(2);
      expect(proxy.instanceMatrix).toBe(source.instanceMatrix);
      expect(proxy.instanceColor).toBe(source.instanceColor);
      expect(proxy.morphTexture).toBe(texture);
      expect(proxy.boundingSphere).toBe(source.boundingSphere);
      expect(proxy.boundingBox).toBe(source.boundingBox);
      const oldInstanceMatrix = source.instanceMatrix;
      source.instanceMatrix = new THREE.InstancedBufferAttribute(
        new Float32Array(16),
        16
      );
      source.instanceColor = null;
      source.count = 1;
      source.boundingSphere = new THREE.Sphere(new THREE.Vector3(2, 0, 0), 4);
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      expect(proxy.instanceMatrix).toBe(source.instanceMatrix);
      expect(proxy.instanceMatrix).not.toBe(oldInstanceMatrix);
      expect(proxy.count).toBe(1);
      expect(proxy.instanceColor).toBeNull();
      expect(proxy.boundingSphere).toBe(source.boundingSphere);
      texture.needsUpdate = true;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      expect(matrixClone).not.toHaveBeenCalled();
      expect(colorClone).not.toHaveBeenCalled();
      const textureDispose = vi.spyOn(texture, "dispose");
      f.depth.dispose();
      expect(textureDispose).not.toHaveBeenCalled();
    } finally {
      f.dispose();
      texture.dispose();
    }
  });

  it("preserves skin binding and live skeleton without copying or reparenting bones", () => {
    const f = setup(),
      source = new THREE.SkinnedMesh(f.geometry, f.material),
      bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    source.add(bone);
    source.bind(skeleton, new THREE.Matrix4().makeTranslation(1, 2, 3));
    source.bindMode = THREE.DetachedBindMode;
    source.position.z = -10;
    source.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
    source.boundingBox = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1)
    );
    source.userData.self = source.userData;
    f.root.remove(f.mesh);
    f.root.add(source);
    f.root.updateMatrixWorld(true);
    try {
      const calculate = vi.spyOn(skeleton, "calculateInverses");
      const boneClone = vi.spyOn(bone, "clone").mockImplementation(() => {
        throw Error("bone cloning forbidden");
      });
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      f.render(p);
      const proxy = (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
        .children[0] as THREE.SkinnedMesh;
      expect(proxy).toBeInstanceOf(THREE.SkinnedMesh);
      expect(proxy.skeleton).toBe(skeleton);
      expect(bone.parent).toBe(source);
      expect(proxy.children).toHaveLength(0);
      expect(proxy.bindMode).toBe(source.bindMode);
      expect(proxy.bindMatrix.equals(source.bindMatrix)).toBe(true);
      expect(proxy.bindMatrixInverse.equals(source.bindMatrixInverse)).toBe(
        true
      );
      expect(proxy.bindMatrix).not.toBe(source.bindMatrix);
      expect(proxy.bindMatrixInverse).not.toBe(source.bindMatrixInverse);
      expect(proxy.boundingSphere).toBe(source.boundingSphere);
      expect(proxy.boundingBox).toBe(source.boundingBox);
      source.bindMatrix.makeTranslation(4, 5, 6);
      source.bindMatrixInverse.copy(source.bindMatrix).invert();
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      expect(proxy.bindMatrix.equals(source.bindMatrix)).toBe(true);
      expect(calculate).not.toHaveBeenCalled();
      expect(boneClone).not.toHaveBeenCalled();
      const skeletonDispose = vi.spyOn(skeleton, "dispose");
      f.depth.dispose();
      expect(skeletonDispose).not.toHaveBeenCalled();
    } finally {
      f.dispose();
      skeleton.dispose();
    }
  });

  it("keeps an independent reusable morph-weight snapshot and tracks removal", () => {
    const f = setup();
    f.mesh.morphTargetInfluences = [0.25, 0];
    f.mesh.morphTargetDictionary = { first: 0, second: 1 };
    try {
      const p = projection();
      f.depth.setSources([p]);
      f.depth.sync();
      f.render(p);
      const proxy = (f.renderer.render.mock.calls.at(-1)![0] as THREE.Scene)
        .children[0] as THREE.Mesh;
      const weights = proxy.morphTargetInfluences;
      expect(weights).toEqual([0.25, 0]);
      expect(weights).not.toBe(f.mesh.morphTargetInfluences);
      expect(proxy.morphTargetDictionary).toBe(f.mesh.morphTargetDictionary);
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(false);
      expect(proxy.morphTargetInfluences).toBe(weights);
      f.mesh.morphTargetInfluences[1] = 0.5;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      expect(proxy.morphTargetInfluences).toBe(weights);
      expect(weights).toEqual([0.25, 0.5]);
      f.mesh.morphTargetInfluences = undefined;
      f.depth.sync();
      expect(f.render(p)!.changed).toBe(true);
      expect(proxy.morphTargetInfluences).toBeUndefined();
    } finally {
      f.dispose();
    }
  });

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
  it("keeps the first-hit revision and cached source depth across opaque shader restyles", () => {
    const f = setup();
    let publicationVersion = 0;
    f.runtimes.get("terrain")!.mapStyleProjectionVersion = () =>
      publicationVersion;
    try {
      const p = projection();
      f.depth.setSources([p]);
      const initial = f.depth.sync();
      f.render(p);
      const renders = f.depth.state.depthRenderCount;
      const materialVersion = f.material.version;
      f.material.color.set("#345678");
      f.material.onBeforeCompile = vi.fn();
      f.material.needsUpdate = true;
      publicationVersion++;
      expect(f.material.version).toBeGreaterThan(materialVersion);
      expect(f.depth.sync().revision).toBe(initial.revision);
      expect(f.render(p)!.changed).toBe(false);
      expect(f.depth.state.depthRenderCount).toBe(renders);

      // Actual first-hit changes still invalidate even without needsUpdate.
      f.material.alphaTest = 0.4;
      expect(f.depth.sync().revision).toBeGreaterThan(initial.revision);
      expect(f.render(p)!.changed).toBe(true);
      expect(f.depth.state.depthRenderCount).toBe(renders + 1);
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
