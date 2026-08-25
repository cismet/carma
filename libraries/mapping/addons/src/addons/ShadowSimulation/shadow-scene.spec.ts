// @vitest-environment node

import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: vi.fn(),
  getGenericThreeLayers: vi.fn(() => []),
  subscribeGenericThreeLayers: vi.fn(() => vi.fn()),
}));

import {
  acquireSharedThreeScene,
  getGenericThreeLayers,
  subscribeGenericThreeLayers,
} from "@carma-mapping/engines/maplibre";

import {
  buildShadowSimulationScene,
  solarPositionToSceneDirection,
} from "./shadow-scene";

describe("shadow scene sun direction", () => {
  const position = (azimuthDegrees: number, elevationDegrees: number) => ({
    instant: new Date("2026-06-21T10:00:00Z"),
    azimuthDegrees,
    elevationDegrees,
  });

  it("maps north to the shared scene's negative Z axis", () => {
    const direction = solarPositionToSceneDirection(position(0, 0));

    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);
  });

  it("maps east and zenith into the shared local frame", () => {
    expect(solarPositionToSceneDirection(position(90, 0)).x).toBeCloseTo(1);
    expect(solarPositionToSceneDirection(position(180, 90)).y).toBeCloseTo(1);
  });
});

describe("shadow scene lighting integration", () => {
  const releaseScene = vi.fn();
  let scene: THREE.Scene;

  beforeEach(() => {
    vi.clearAllMocks();
    scene = new THREE.Scene();
    vi.mocked(getGenericThreeLayers).mockReturnValue([]);
    vi.mocked(subscribeGenericThreeLayers).mockReturnValue(vi.fn());
    vi.mocked(acquireSharedThreeScene).mockReturnValue({
      layer: { getScene: () => scene } as never,
      release: releaseScene,
    });
  });

  it("drives MapLibre and the Three.js sun from the same solar position", () => {
    const setLight = vi.fn();
    const map = {
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight,
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const controller = buildShadowSimulationScene(map as never);
    const solarPosition = {
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    };

    controller.updateSolarPosition(solarPosition);

    expect(acquireSharedThreeScene).toHaveBeenCalledWith(map);
    expect(setLight).toHaveBeenLastCalledWith(
      expect.objectContaining({
        anchor: "map",
        position: [1.5, 135, 45],
      })
    );
    const sun = scene.getObjectByName(
      "shadow-simulation-sun"
    ) as THREE.DirectionalLight;
    expect(sun.castShadow).toBe(true);
    expect(sun.position.clone().normalize().x).toBeCloseTo(0.5);
    expect(sun.position.clone().normalize().y).toBeCloseTo(Math.SQRT1_2);
    expect(sun.position.clone().normalize().z).toBeCloseTo(0.5);

    controller.dispose();
    expect(scene.getObjectByName("shadow-simulation-sun")).toBeUndefined();
    expect(releaseScene).toHaveBeenCalledOnce();
  });

  it("enables and restores shadows for registered ALKIS Three.js layers", () => {
    const alkisScene = new THREE.Scene();
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(10, 20, 10),
      new THREE.MeshLambertMaterial()
    );
    alkisScene.add(building);
    const renderer = {
      shadowMap: { enabled: false, type: THREE.BasicShadowMap },
    };
    vi.mocked(getGenericThreeLayers).mockReturnValue([
      { scene: alkisScene, renderer } as never,
    ]);
    const map = {
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    const controller = buildShadowSimulationScene(map as never);
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });

    expect(renderer.shadowMap.enabled).toBe(true);
    expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
    expect(building.castShadow).toBe(true);
    expect(building.receiveShadow).toBe(true);
    expect(alkisScene.getObjectByName("shadow-simulation-sun")).toBeDefined();

    controller.dispose();
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(renderer.shadowMap.type).toBe(THREE.BasicShadowMap);
    expect(alkisScene.getObjectByName("shadow-simulation-sun")).toBeUndefined();
  });
});
