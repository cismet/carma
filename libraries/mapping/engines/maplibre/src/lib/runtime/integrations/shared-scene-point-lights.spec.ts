import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { TILE_CAMERA_ROLE } from "../../core/tile-camera-demand";
import type { SharedThreeSceneLayer } from "../../core/shared-three-scene-types";
import {
  createSharedScenePointLights,
  sampleOrbitLightPosition,
} from "./shared-scene-point-lights";

const createLayer = (maxTextures?: number) => {
  const scene = new THREE.Scene();
  const views = new Map<
    string,
    Parameters<SharedThreeSceneLayer["setTileCameraView"]>[0]
  >();
  const layer = {
    getScene: vi.fn(() => scene),
    getRenderer: vi.fn(() =>
      maxTextures === undefined
        ? null
        : ({ capabilities: { maxTextures } } as THREE.WebGLRenderer)
    ),
    setTileCameraView: vi.fn((view) => views.set(view.id, view)),
    removeTileCameraView: vi.fn((id) => views.delete(id)),
  } as unknown as SharedThreeSceneLayer;
  return { layer, scene, views };
};

const OPTIONS = {
  positions: [new THREE.Vector3(10, 20, 30)],
  colors: [0xff8800],
  intensity: 120,
  range: 500,
  shadowMapSize: 256,
  errorTargetPixels: 1.5,
  normalBias: 0.03,
} as const;

describe("shared scene point lights", () => {
  it("registers six geometry-only cube faces in one shared scene", () => {
    const { layer, scene, views } = createLayer();
    const integration = createSharedScenePointLights(layer, OPTIONS);

    expect(layer.getScene).toHaveBeenCalledOnce();
    expect(layer.getRenderer).toHaveBeenCalledOnce();
    expect(scene.children).toHaveLength(1);
    expect(views).toHaveLength(6);
    views.forEach((view) => {
      expect(view.role).toBe(TILE_CAMERA_ROLE.GEOMETRY);
      expect(view.viewport).toEqual([256, 256]);
      expect(view.errorTargetPixels).toBe(1.5);
      expect(view.camera).toBeInstanceOf(THREE.PerspectiveCamera);
      const camera = view.camera as THREE.PerspectiveCamera;
      expect(camera.fov).toBe(90);
      expect(camera.near).toBe(0.5);
      expect(camera.far).toBe(500);
    });

    const group = scene.children[0] as THREE.Group;
    const light = group.children.find(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
    )!;
    const marker = group.children.find(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh
    )!;
    expect(light.castShadow).toBe(true);
    expect(light.shadow.autoUpdate).toBe(false);
    expect(light.shadow.needsUpdate).toBe(true);
    expect(light.shadow.mapSize.toArray()).toEqual([256, 256]);
    expect(light.shadow.normalBias).toBe(0.03);
    expect(marker.castShadow).toBe(false);
    expect(marker.receiveShadow).toBe(false);

    integration.dispose();
  });

  it("covers the six CubeCamera directions and updates live poses without re-registering", () => {
    const { layer } = createLayer();
    const integration = createSharedScenePointLights(layer, OPTIONS);
    const expectedDirections = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    const expectedUps = [
      [0, -1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0, -1, 0],
      [0, -1, 0],
    ];
    const direction = new THREE.Vector3();

    integration.getCameras().forEach(({ camera }, index) => {
      camera.getWorldDirection(direction);
      expectedDirections[index].forEach((component, componentIndex) => {
        expect(direction.getComponent(componentIndex)).toBeCloseTo(component);
      });
      expect(camera.up.toArray()).toEqual(expectedUps[index]);
    });

    integration.setPosition(0, new THREE.Vector3(-4, 7, 12));
    expect(layer.setTileCameraView).toHaveBeenCalledTimes(6);
    integration.getCameras().forEach(({ camera }) => {
      expect(camera.position.toArray()).toEqual([-4, 7, 12]);
    });
  });

  it("does not dirty shadows or recalculate cameras for an unchanged position", () => {
    const { layer, scene } = createLayer();
    const integration = createSharedScenePointLights(layer, OPTIONS);
    const light = scene.children[0].children.find(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
    )!;
    const cameras = integration.getCameras().map(({ camera }) => camera);
    const updateSpies = cameras.map((camera) =>
      vi.spyOn(camera, "updateMatrixWorld")
    );
    light.shadow.needsUpdate = false;

    integration.setPosition(0, OPTIONS.positions[0].clone());

    expect(light.shadow.needsUpdate).toBe(false);
    updateSpies.forEach((update) => expect(update).not.toHaveBeenCalled());
  });

  it("cycles configured colors across all lights", () => {
    const { layer, scene } = createLayer();
    createSharedScenePointLights(layer, {
      ...OPTIONS,
      positions: [
        new THREE.Vector3(),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(2, 0, 0),
      ],
      colors: [0xff8800],
    });
    const group = scene.children[0];
    const lights = group.children.filter(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
    );
    const markers = group.children.filter(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh
    );

    expect(lights.map((light) => light.color.getHex())).toEqual([
      0xff8800, 0xff8800, 0xff8800,
    ]);
    expect(
      markers.map((marker) =>
        (marker.material as THREE.MeshBasicMaterial).color.getHex()
      )
    ).toEqual([0xff8800, 0xff8800, 0xff8800]);
  });

  it("keeps all 12 lights while budgeting four shadow casters", () => {
    const { layer, scene, views } = createLayer();
    const positions = Array.from(
      { length: 12 },
      (_, index) => new THREE.Vector3(index, 0, 0)
    );
    const integration = createSharedScenePointLights(layer, {
      ...OPTIONS,
      positions,
    });
    const lights = scene.children[0].children.filter(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
    );

    expect(lights).toHaveLength(12);
    expect(lights.filter((light) => light.castShadow)).toHaveLength(4);
    expect(integration.getShadowLightCount()).toBe(4);
    expect(integration.getCameras()).toHaveLength(24);
    expect(views).toHaveLength(24);
    expect(scene.children).toHaveLength(1);
  });

  it("caps the explicit shadow budget against available texture units", () => {
    const { layer } = createLayer(16);
    const integration = createSharedScenePointLights(layer, {
      ...OPTIONS,
      positions: Array.from(
        { length: 12 },
        (_, index) => new THREE.Vector3(index, 0, 0)
      ),
      maxShadowLights: 12,
    });

    expect(integration.getShadowLightCount()).toBe(8);
    expect(integration.getCameras()).toHaveLength(48);
  });

  it("supports lights with an explicit zero shadow budget", () => {
    const { layer, scene, views } = createLayer(16);
    const integration = createSharedScenePointLights(layer, {
      ...OPTIONS,
      positions: [new THREE.Vector3(), new THREE.Vector3(1, 0, 0)],
      maxShadowLights: 0,
    });
    const lights = scene.children[0].children.filter(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
    );

    expect(lights).toHaveLength(2);
    expect(lights.every((light) => !light.castShadow)).toBe(true);
    expect(integration.getShadowLightCount()).toBe(0);
    expect(integration.getCameras()).toHaveLength(0);
    expect(views).toHaveLength(0);
  });

  it("uses unique IDs per instance and removes only owned registrations", () => {
    const { layer, scene, views } = createLayer();
    const first = createSharedScenePointLights(layer, OPTIONS);
    const second = createSharedScenePointLights(layer, OPTIONS);
    const firstIds = first.getCameras().map(({ id }) => id);
    const secondIds = second.getCameras().map(({ id }) => id);

    expect(new Set([...firstIds, ...secondIds])).toHaveLength(12);
    expect(scene.children).toHaveLength(2);
    first.dispose();
    expect(scene.children).toHaveLength(1);
    expect([...views.keys()]).toEqual(secondIds);
    expect(layer.removeTileCameraView).toHaveBeenCalledTimes(6);
    second.dispose();
  });

  it("invalidates shadows and disposes marker resources", () => {
    const { layer, scene } = createLayer();
    const integration = createSharedScenePointLights(layer, OPTIONS);
    const group = scene.children[0] as THREE.Group;
    const light = group.children.find(
      (child): child is THREE.PointLight => child instanceof THREE.PointLight
    )!;
    const marker = group.children.find(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh
    )!;
    const geometryDispose = vi.spyOn(marker.geometry, "dispose");
    const materialDispose = vi.spyOn(
      marker.material as THREE.Material,
      "dispose"
    );
    const shadowDispose = vi.spyOn(light.shadow, "dispose");

    light.shadow.needsUpdate = false;
    integration.invalidateShadows();
    expect(light.shadow.needsUpdate).toBe(true);
    integration.dispose();
    integration.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(shadowDispose).toHaveBeenCalledOnce();
  });

  it("validates finite positive limits", () => {
    const { layer } = createLayer();
    expect(() =>
      createSharedScenePointLights(layer, { ...OPTIONS, range: 0 })
    ).toThrow(RangeError);
    expect(() =>
      createSharedScenePointLights(layer, { ...OPTIONS, range: 0.5 })
    ).toThrow(RangeError);
    expect(() =>
      createSharedScenePointLights(layer, {
        ...OPTIONS,
        positions: [new THREE.Vector3(Number.NaN, 0, 0)],
      })
    ).toThrow(RangeError);
    expect(() =>
      createSharedScenePointLights(layer, {
        ...OPTIONS,
        shadowMapSize: Infinity,
      })
    ).toThrow(RangeError);
  });
});

describe("point light orbit sampling", () => {
  const orbit = {
    radius: 10,
    minHeight: 2,
    maxHeight: 8,
    periodSeconds: 20,
  } as const;

  it("phase-spaces lights and changes elevation", () => {
    const center = new THREE.Vector3(1, 5, 2);
    expect(sampleOrbitLightPosition(center, 0, 4, 0, orbit).toArray()).toEqual([
      11, 10, 2,
    ]);
    const quarter = sampleOrbitLightPosition(center, 1, 4, 0, orbit);
    expect(quarter.x).toBeCloseTo(1);
    expect(quarter.y).toBe(13);
    expect(quarter.z).toBe(12);
  });

  it("repeats exactly after one period", () => {
    const center = new THREE.Vector3(-2, 3, 4);
    const start = sampleOrbitLightPosition(center, 2, 4, 3.25, orbit);
    const repeated = sampleOrbitLightPosition(center, 2, 4, 23.25, orbit);
    expect(repeated.distanceTo(start)).toBeLessThan(1e-12);
  });

  it("rejects invalid orbit arguments", () => {
    expect(() =>
      sampleOrbitLightPosition(new THREE.Vector3(), 0, 0, 0, orbit)
    ).toThrow(RangeError);
    expect(() =>
      sampleOrbitLightPosition(new THREE.Vector3(), 0, 1, 0, {
        ...orbit,
        periodSeconds: 0,
      })
    ).toThrow(RangeError);
  });
});
