import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type {
  MapStyleAxisBoundaryOverlay,
  SharedThreeSceneLocalFrame,
  SharedThreeSceneRuntime,
} from "../../core/shared-three-scene-types";
import { createSharedThreeMapStyleProjection } from "./shared-three-map-style-projection";

const projectionAt = (x: number) =>
  new THREE.Matrix4().set(
    0.005,
    0,
    0,
    -0.005 * x + 0.5,
    0,
    0.005,
    0,
    0.5,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1
  );

const overlay = (ids: readonly string[], xs: readonly number[] = []) =>
  ({
    referenceToMetric: new THREE.Matrix4(),
    sources: ids.map((id, index) => ({
      id,
      sceneToImage: projectionAt(xs[index] ?? 0),
      eye: new THREE.Vector3(xs[index] ?? 0, 0, 10),
      direction: new THREE.Vector3(0, 0, -1),
    })),
  } satisfies MapStyleAxisBoundaryOverlay);

const runtimeWithSharedMaterial = (positions: readonly number[]) => {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial();
  for (const x of positions) {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = x;
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  const runtime = {
    id: "axis-receiver",
    originLngLat: [0, 0],
    root,
    mountsOnLocalFrame: true,
    receivesScreenImages: true,
    update: vi.fn(),
  } as unknown as SharedThreeSceneRuntime;
  return { runtime, root, material };
};

const attachWithoutCapturing = (
  projection: ReturnType<typeof createSharedThreeMapStyleProjection>
) => {
  const map = {
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    getCanvas: () => ({ clientWidth: 800 }),
    getStyle: () => ({ layers: [], sources: {} }),
    getLayersOrder: () => ["axis-test"],
    getLayer: () => null,
    listImages: () => [],
    getImage: () => null,
    isMoving: () => false,
    loaded: () => true,
  };
  const renderer = {
    copyFramebufferToTexture: vi.fn(),
    properties: { get: vi.fn(() => ({})), remove: vi.fn() },
  };
  projection.attach(map as never, renderer as never);
  return { map, renderer };
};

const capture = (
  projection: ReturnType<typeof createSharedThreeMapStyleProjection>,
  localFrame?: SharedThreeSceneLocalFrame,
  sceneToClip = new THREE.Matrix4()
) => projection.capture(sceneToClip, false, localFrame);
const broadSceneToClip = () =>
  new THREE.Matrix4().set(
    0.001,
    0,
    0,
    -0.5,
    0,
    0.01,
    0,
    0,
    0,
    0,
    0.01,
    0,
    0,
    0,
    0,
    1
  );

describe("map-style projection axis-boundary orchestration", () => {
  it("unions receiver bounds for meshes sharing one material", () => {
    const { runtime, material } = runtimeWithSharedMaterial([0, 1000]);
    const projection = createSharedThreeMapStyleProjection(
      "axis-test",
      new Map([[runtime.id, runtime]]),
      new THREE.Vector2(800, 600)
    );
    projection.setAxisBoundaries(
      "test",
      overlay(["near", "far"], [0, 1000]),
      false
    );

    capture(projection, undefined, broadSceneToClip());

    expect(projection.getState(0).axisBoundaries).toMatchObject({
      sources: 2,
      receivers: 1,
      visibleBounds: {
        min: [-1.001, -1.001, -1.001],
        max: [1001.001, 1.001, 1.001],
      },
    });
    const uniforms = material.userData.carmaMapStyleAxisBoundaryUniforms;
    expect(uniforms.carmaAxisBoundaryDisplayEnabled.value).toBe(0);
    projection.dispose();
    material.dispose();
  });

  it("rebases current mesh bounds into the overlay reference frame", () => {
    const { runtime, material } = runtimeWithSharedMaterial([0]);
    const projection = createSharedThreeMapStyleProjection(
      "axis-test",
      new Map([[runtime.id, runtime]]),
      new THREE.Vector2(800, 600)
    );
    projection.setAxisBoundaries("test", overlay(["rebased"], [1000]), false);
    const localFrame = {
      currentToReference: new THREE.Matrix4().makeTranslation(1000, 0, 0),
    } as SharedThreeSceneLocalFrame;

    capture(projection, localFrame, broadSceneToClip());

    expect(projection.getState(0).axisBoundaries.visibleBounds).toEqual({
      min: [998.999, -1.001, -1.001],
      max: [1001.001, 1.001, 1.001],
    });
    projection.dispose();
    material.dispose();
  });

  it("keeps every camera when receiver geometry has no trustworthy bounds", () => {
    const { runtime, root, material } = runtimeWithSharedMaterial([0]);
    const mesh = root.children[0] as THREE.Mesh;
    mesh.geometry.boundingSphere = null;
    mesh.geometry.boundingBox = null;
    const projection = createSharedThreeMapStyleProjection(
      "axis-test",
      new Map([[runtime.id, runtime]]),
      new THREE.Vector2(800, 600)
    );
    projection.setAxisBoundaries(
      "test",
      overlay(["near", "far"], [0, 1000]),
      false
    );

    capture(projection);

    expect(projection.getState(0).axisBoundaries.visibleBounds).toBeNull();
    projection.dispose();
    material.dispose();
  });

  it("shares one bounded display sampler across distinct receivers", () => {
    const root = new THREE.Group();
    const nearMaterial = new THREE.MeshBasicMaterial();
    const farMaterial = new THREE.MeshBasicMaterial();
    for (const [x, material] of [
      [0, nearMaterial],
      [1000, farMaterial],
    ] as const) {
      const geometry = new THREE.BoxGeometry(2, 2, 2);
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.x = x;
      root.add(mesh);
    }
    root.updateMatrixWorld(true);
    const runtime = {
      id: "axis-receiver",
      originLngLat: [0, 0],
      root,
      mountsOnLocalFrame: true,
      receivesScreenImages: true,
      update: vi.fn(),
    } as unknown as SharedThreeSceneRuntime;
    const projection = createSharedThreeMapStyleProjection(
      "axis-test",
      new Map([[runtime.id, runtime]]),
      new THREE.Vector2(800, 600)
    );
    projection.setAxisBoundaries(
      "test",
      overlay(["near", "far"], [0, 1000]),
      false
    );

    capture(projection);

    expect(projection.getState(0).axisBoundaries.receivers).toBe(2);
    expect(nearMaterial.userData.carmaMapStyleAxisBoundaryUniforms).toBe(
      farMaterial.userData.carmaMapStyleAxisBoundaryUniforms
    );
    // Visibility clipping is deferred to individual screen tiles, never a
    // full-screen source loop in either receiver material.
    expect(projection.getState(0).axisBoundaries.renderedTiles).toBe(0);
    projection.dispose();
    nearMaterial.dispose();
    farMaterial.dispose();
  });

  it("clears the shared style and count when disabled without capturing a basemap", () => {
    const { runtime, material } = runtimeWithSharedMaterial([0]);
    const projection = createSharedThreeMapStyleProjection(
      "axis-test",
      new Map([[runtime.id, runtime]]),
      new THREE.Vector2(800, 600)
    );
    const { renderer } = attachWithoutCapturing(projection);
    projection.setAxisBoundaries("test", overlay(["one"]), false);
    capture(projection);
    const uniforms = material.userData.carmaMapStyleAxisBoundaryUniforms;
    expect(projection.getState(0).axisBoundaries.sources).toBe(1);

    projection.setAxisBoundaries("test", null, false);
    capture(projection);

    expect(projection.getState(0).axisBoundaries.sources).toBe(0);
    expect(uniforms.carmaAxisBoundaryDisplayEnabled.value).toBe(0);
    expect(uniforms.carmaAxisBoundaryDisplayTexture.value).toBeNull();
    expect(projection.getState(0).captures).toBe(0);
    expect(renderer.copyFramebufferToTexture).not.toHaveBeenCalled();
    projection.dispose();
    material.dispose();
  });
});
