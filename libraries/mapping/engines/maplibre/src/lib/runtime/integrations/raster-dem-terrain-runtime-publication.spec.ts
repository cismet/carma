import {
  Camera,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Vector2,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import {
  acquireRasterDemTerrainTileSource,
  createProjectedTerrainTileGeometry,
  registerSharedThreeTerrainSampler,
  terrainConfig,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

describe("buildRasterDemTerrainRuntime frontier publication", () => {
  installRasterDemTerrainRuntimeFixture();

  it("transfers coverage without copies and publishes fast replacement tiles before slow ones", async () => {
    const ids = [
      { level: 10, x: 532, y: 218 },
      { level: 10, x: 533, y: 218 },
    ];
    const makeTile = (id: (typeof ids)[number]) => ({
      id,
      heightMeters: new Float32Array([100]),
      westIndices: new Uint32Array(),
      southIndices: new Uint32Array(),
      eastIndices: new Uint32Array(),
      northIndices: new Uint32Array(),
    });
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    const source = {
      requestTile: vi.fn(async (id) => makeTile(id)),
      getTileGridIdsForBounds: vi.fn(() => ids),
      getTileBounds: vi.fn(() => ({
        west: 7,
        south: 51,
        east: 7.4,
        north: 51.3,
      })),
      getLevelMaximumGeometricError: vi.fn(() => 0.00001),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    const replacementSource = {
      ...source,
      requestTile: vi.fn(async (id) => {
        if (id.x === 533) await slow;
        return makeTile(id);
      }),
    };
    acquireRasterDemTerrainTileSource
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(replacementSource);
    const origin: [number, number] = [7.15, 51.256];
    const previous = buildRasterDemTerrainRuntime(
      "previous",
      terrainConfig("/previous"),
      origin,
      { minimumLevel: 10, maximumLevel: 10 }
    );
    const map = {
      getBounds: () => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.3,
      }),
      triggerRepaint: vi.fn(),
    };
    const camera = new PerspectiveCamera(60, 1, 1, 10_000);
    camera.position.set(0, 1_000, 0);
    const frame = {
      map: map as never,
      renderCamera: new Camera(),
      lodCamera: camera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new Matrix4(),
        sceneFromLocalRotation: new Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new Matrix4(),
        referenceToCurrent: new Matrix4(),
        currentToReference: new Matrix4(),
      },
    };
    previous.onAdd?.(map as never);
    await vi.waitFor(() =>
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalledTimes(1)
    );
    previous.update(frame);
    await previous.ready;
    await vi.waitFor(() =>
      expect(
        previous.root.children.filter((node) => node.visible)
      ).toHaveLength(2)
    );
    const oldNodes = [...previous.root.children] as Group[];
    const oldGeometry = oldNodes.map(
      (node) => (node.children[0] as Mesh).geometry
    );
    const disposed = oldGeometry.map((geometry) =>
      vi.spyOn(geometry, "dispose")
    );
    const oldAttributes = oldGeometry.map((geometry) => ({
      position: geometry.getAttribute("position"),
      normal: geometry.getAttribute("normal"),
      index: geometry.getIndex(),
    }));
    const replacement = buildRasterDemTerrainRuntime(
      "replacement",
      terrainConfig("/replacement"),
      origin,
      { minimumLevel: 10, maximumLevel: 10 }
    );
    replacement.adoptPresentation(previous);
    previous.dispose();
    expect(replacement.root.children).toEqual(oldNodes);
    expect(oldNodes.every((node) => node.visible)).toBe(true);
    expect(disposed.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    expect(createProjectedTerrainTileGeometry).toHaveBeenCalledTimes(2);
    expect(previous.mapStyleProjectionVersion?.()).toBe(1);
    replacement.onAdd?.(map as never);
    await vi.waitFor(() =>
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalledTimes(2)
    );
    replacement.update(frame);
    const oldFast = oldNodes.find((node) => node.name.endsWith("10/532/218"))!;
    const oldSlow = oldNodes.find((node) => node.name.endsWith("10/533/218"))!;
    await vi.waitFor(() => expect(oldFast.parent).toBeNull());
    expect(oldSlow.parent).toBe(replacement.root);
    expect(oldSlow.visible).toBe(true);
    const slowIndex = oldNodes.indexOf(oldSlow);
    const slowGeometry = (oldSlow.children[0] as Mesh).geometry;
    expect(slowGeometry.getAttribute("position")).toBe(
      oldAttributes[slowIndex].position
    );
    expect(slowGeometry.getAttribute("normal")).toBe(
      oldAttributes[slowIndex].normal
    );
    expect(slowGeometry.getIndex()).toBe(oldAttributes[slowIndex].index);
    expect(
      replacement.root.children.filter((node) => node.visible)
    ).toHaveLength(2);
    expect(createProjectedTerrainTileGeometry).toHaveBeenCalledTimes(3);
    releaseSlow();
    await vi.waitFor(() => expect(oldSlow.parent).toBeNull());
    expect(
      replacement.root.children.filter((node) => node.visible)
    ).toHaveLength(2);
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    replacement.dispose();
  });
});
