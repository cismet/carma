import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NightLightAtlasInput } from "../../core/night-light-atlas";
import { createSharedSceneNightLightAtlas } from "./shared-scene-night-light-atlas";

class WorkerStub {
  static instances: WorkerStub[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    WorkerStub.instances.push(this);
  }

  respond(data: { id: number; pixels?: Uint8Array; error?: string }) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const atlasInput = (groundHeight: number): NightLightAtlasInput => ({
  resolution: 2,
  bounds: [0, 10, 20, 30],
  heightRange: [0, 100],
  lights: [
    {
      position: [5, groundHeight + 8, 15],
      groundHeight,
      radius: 30,
      color: [1, 0.8, 0.4],
      strength: 1,
    },
  ],
});

describe("shared scene night light atlas", () => {
  beforeEach(() => {
    WorkerStub.instances = [];
    vi.stubGlobal("Worker", WorkerStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps one bake active and coalesces busy updates to the latest input", () => {
    const scene = new THREE.Scene();
    const integration = createSharedSceneNightLightAtlas(
      scene,
      vi.fn(),
      vi.fn()
    );
    const worker = WorkerStub.instances[0];
    const first = atlasInput(10);
    const superseded = atlasInput(20);
    const latest = atlasInput(30);

    integration.setLights(first);
    integration.setLights(superseded);
    integration.setLights(latest);

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: 1,
      input: first,
    });

    worker.respond({ id: 1, pixels: new Uint8Array(16) });

    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: 3,
      input: latest,
    });
    expect(
      scene.getObjectByName("night-baked-streetlight-markers")
    ).toBeUndefined();
  });

  it("ignores stale worker results and installs only the current generation", () => {
    const scene = new THREE.Scene();
    const integration = createSharedSceneNightLightAtlas(
      scene,
      vi.fn(),
      vi.fn()
    );
    const worker = WorkerStub.instances[0];
    integration.setLights(atlasInput(10));
    integration.setLights(atlasInput(40));

    worker.respond({ id: 999, pixels: new Uint8Array(16).fill(255) });
    expect(scene.children).toHaveLength(0);

    worker.respond({ id: 1, pixels: new Uint8Array(16) });
    expect(scene.children).toHaveLength(0);
    worker.respond({ id: 2, pixels: new Uint8Array(16).fill(128) });
    expect(
      scene.getObjectByName("night-baked-streetlight-markers")
    ).toBeInstanceOf(THREE.InstancedMesh);
  });

  it("composes existing shader hooks and cache keys", () => {
    const integration = createSharedSceneNightLightAtlas(
      new THREE.Scene(),
      vi.fn(),
      vi.fn()
    );
    const originalCompile = vi.fn(
      (shader: THREE.WebGLProgramParametersWithUniforms) => {
        shader.vertexShader = `// original\n${shader.vertexShader}`;
      }
    );
    const material = new THREE.MeshStandardMaterial();
    material.onBeforeCompile = originalCompile;
    material.customProgramCacheKey = () => "original-key";
    integration.reconcile(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const shader = {
      uniforms: {},
      vertexShader: "void main() { #include <project_vertex> }",
      fragmentShader: "void main() { #include <opaque_fragment> }",
    } as unknown as THREE.WebGLProgramParametersWithUniforms;

    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(originalCompile).toHaveBeenCalledOnce();
    expect(material.customProgramCacheKey()).toBe(
      "original-key|night-field-v1"
    );
    expect(shader.uniforms).toMatchObject({
      nightAtlas: expect.any(Object),
      nightBounds: expect.any(Object),
      nightHeights: expect.any(Object),
      nightStrength: expect.any(Object),
    });
    expect(shader.vertexShader).toContain("nightWorldPosition");
    expect(shader.vertexShader).toContain("// original");
    expect(shader.fragmentShader).toContain("outgoingLight +=");
  });

  it("does not wrap an already reconciled material twice", () => {
    const integration = createSharedSceneNightLightAtlas(
      new THREE.Scene(),
      vi.fn(),
      vi.fn()
    );
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    integration.reconcile(mesh);
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey;

    integration.reconcile(mesh);

    expect(material.onBeforeCompile).toBe(compile);
    expect(material.customProgramCacheKey).toBe(key);
  });

  it("replaces texture storage atomically instead of resizing an uploaded placeholder", () => {
    const integration = createSharedSceneNightLightAtlas(
      new THREE.Scene(),
      vi.fn(),
      vi.fn()
    );
    const worker = WorkerStub.instances[0];
    const material = new THREE.MeshStandardMaterial();
    integration.reconcile(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const shader = {
      uniforms: {},
      vertexShader: "#include <project_vertex>",
      fragmentShader: "#include <opaque_fragment>",
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const placeholder = shader.uniforms.nightAtlas.value as THREE.DataTexture;
    const disposePlaceholder = vi.spyOn(placeholder, "dispose");
    integration.setLights(atlasInput(10));
    worker.respond({ id: 1, pixels: new Uint8Array(16) });
    const first = shader.uniforms.nightAtlas.value as THREE.DataTexture;
    expect(first).not.toBe(placeholder);
    expect(placeholder.image.width).toBe(1);
    expect(first.image.width).toBe(2);
    expect(disposePlaceholder).toHaveBeenCalledOnce();
    integration.setLights(atlasInput(20));
    expect(shader.uniforms.nightAtlas.value).toBe(first);
    worker.respond({ id: 2, pixels: new Uint8Array(16) });
    expect(shader.uniforms.nightAtlas.value).not.toBe(first);
    integration.dispose();
  });

  it("restores hooks, terminates the worker, and disposes owned resources", () => {
    const scene = new THREE.Scene();
    const markerDispose = vi.spyOn(THREE.InstancedMesh.prototype, "dispose");
    const geometryDispose = vi.spyOn(THREE.SphereGeometry.prototype, "dispose");
    const textureDispose = vi.spyOn(THREE.DataTexture.prototype, "dispose");
    const materialDispose = vi.spyOn(
      THREE.MeshBasicMaterial.prototype,
      "dispose"
    );
    const integration = createSharedSceneNightLightAtlas(
      scene,
      vi.fn(),
      vi.fn()
    );
    const worker = WorkerStub.instances[0];
    const material = new THREE.MeshStandardMaterial();
    const originalCompile = material.onBeforeCompile;
    const originalKey = material.customProgramCacheKey;
    integration.reconcile(new THREE.Mesh(new THREE.BoxGeometry(), material));
    integration.setLights(atlasInput(10));
    worker.respond({ id: 1, pixels: new Uint8Array(16) });

    integration.dispose();
    integration.dispose();

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(material.onBeforeCompile).toBe(originalCompile);
    expect(material.customProgramCacheKey).toBe(originalKey);
    expect(
      scene.getObjectByName("night-baked-streetlight-markers")
    ).toBeUndefined();
    expect(markerDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledTimes(2);
  });
});
