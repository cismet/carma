import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  OrthographicCamera,
  PerspectiveCamera,
  FrontSide,
  Vector2,
  Vector3,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  acquireCesiumTerrainTileSource,
  createProjectedTerrainTileGeometry,
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
} = vi.hoisted(() => ({
  acquireCesiumTerrainTileSource: vi.fn(),
  createProjectedTerrainTileGeometry: vi.fn(),
  notifySharedThreeTerrainChanged: vi.fn(),
  registerSharedThreeTerrainSampler: vi.fn(() => vi.fn()),
}));

vi.mock("@carma-mapping/engines/three/primitives", () => ({
  createProjectedTerrainTileGeometry,
}));

vi.mock("@carma-mapping/engines/cesium/terrain", () => ({
  acquireCesiumTerrainTileSource,
  cesiumTerrainTileKey: ({ level, x, y }: Record<string, number>) =>
    `${level}/${x}/${y}`,
}));

vi.mock("./shared-three-terrain-registry", () => ({
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
}));

import { buildCesiumTerrainRuntime } from "./cesium-terrain-tile-runtime";

describe("buildCesiumTerrainRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProjectedTerrainTileGeometry.mockImplementation(({ tile }) => {
      const geometry = new BufferGeometry();
      const isSyntheticFlat =
        tile.heightMeters.length === 4 &&
        tile.heightMeters.every((height) => height === 0);
      const west = tile.id.x === 531 ? -1 : tile.id.x === 533 ? 1 : 0;
      const nearHeight = tile.heightMeters[0] === 123 ? 1 : 0;
      const farHeight = !isSyntheticFlat && tile.id.x === 533 ? 1 : 0;
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(
          new Float32Array([
            west,
            nearHeight,
            0,
            west,
            nearHeight,
            -1,
            west + 1,
            farHeight,
            0,
            west + 1,
            farHeight,
            -1,
          ]),
          3
        )
      );
      geometry.setIndex([0, 2, 1, 1, 2, 3]);
      geometry.computeVertexNormals();
      return geometry;
    });
  });

  it("adds a shadeable terrain mesh in the shared local-meter frame", async () => {
    const tileId = { level: 10, x: 532, y: 218 };
    const sunTileId = { level: 10, x: 533, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices:
          id.x === sunTileId.x ? new Uint32Array([0, 1]) : new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices:
          id.x === tileId.x ? new Uint32Array([2, 3]) : new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileIdsForBounds: vi.fn((bounds) =>
        bounds.east > 7.25 ? [tileId, sunTileId] : [tileId]
      ),
      getTileGridIdsForBounds: vi.fn((bounds) =>
        bounds.east > 7.25 ? [tileId, sunTileId] : [tileId]
      ),
      getTileBounds: vi.fn((id) =>
        id.x === sunTileId.x
          ? { west: 7.4, south: 51, east: 7.5, north: 51.3 }
          : { west: 7, south: 51, east: 7.2, north: 51.3 }
      ),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
    };
    acquireCesiumTerrainTileSource.mockResolvedValue(source);
    const runtime = buildCesiumTerrainRuntime(
      "terrain",
      "https://example.test/terrain",
      [7.15, 51.256],
      { minimumLevel: 10, maximumLevel: 10, shadowLevelOffset: 0 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.2,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(runtime.root.children).toHaveLength(1);
    const mesh = runtime.root.children[0] as {
      castShadow: boolean;
      receiveShadow: boolean;
      material: { side: number; shadowSide: number | null };
      customDepthMaterial: {
        polygonOffset: boolean;
        polygonOffsetFactor: number;
        polygonOffsetUnits: number;
      };
      geometry: { getAttribute: (name: string) => { count: number } };
    };
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.material.side).toBe(FrontSide);
    expect(mesh.material.shadowSide).toBe(FrontSide);
    expect(mesh.customDepthMaterial.polygonOffset).toBe(true);
    expect(mesh.customDepthMaterial.polygonOffsetFactor).toBe(2);
    expect(mesh.customDepthMaterial.polygonOffsetUnits).toBe(4);
    expect(mesh.geometry.getAttribute("position").count).toBe(4);
    expect(source.requestTile).toHaveBeenCalledWith(tileId);
    expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    expect(notifySharedThreeTerrainChanged).toHaveBeenCalledWith(map);

    const shadowCamera = new OrthographicCamera(
      -1_000,
      1_000,
      1_000,
      -1_000,
      1,
      5_000
    );
    shadowCamera.position.set(20_000, 1_000, 0);
    shadowCamera.lookAt(20_000, 0, 0);
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    runtime.setShadowCamera(shadowCamera);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    });
    await vi.waitFor(() => {
      expect(source.requestTile).toHaveBeenCalledWith(sunTileId);
      expect(runtime.root.children).toHaveLength(2);
    });
    const viewportNormal = (
      runtime.root.children.find((child) =>
        child.name.endsWith("10/532/218")
      ) as {
        geometry: BufferGeometry;
      }
    ).geometry.getAttribute("normal");
    const occluderNormal = (
      runtime.root.children.find((child) =>
        child.name.endsWith("10/533/218")
      ) as {
        geometry: BufferGeometry;
      }
    ).geometry.getAttribute("normal");
    expect(viewportNormal.getX(2)).toBeCloseTo(occluderNormal.getX(0));
    expect(viewportNormal.getY(2)).toBeCloseTo(occluderNormal.getY(0));

    runtime.dispose();
    expect(runtime.root.children).toHaveLength(0);
  });

  it("fills unavailable viewport cells with zero-elevation receiver tiles", async () => {
    const zeroSourceId = { level: 10, x: 531, y: 218 };
    const sourceId = { level: 10, x: 532, y: 218 };
    const flatId = { level: 10, x: 533, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([id.x === zeroSourceId.x ? 0 : 123]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices:
          id.x === sourceId.x ? new Uint32Array([2, 3]) : new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileIdsForBounds: vi.fn(() => [zeroSourceId, sourceId]),
      getTileGridIdsForBounds: vi.fn(() => [zeroSourceId, sourceId, flatId]),
      getTileBounds: vi.fn((id) =>
        id.x === flatId.x
          ? { west: 7.2, south: 51, east: 7.4, north: 51.3 }
          : id.x === zeroSourceId.x
          ? { west: 6.8, south: 51, east: 7, north: 51.3 }
          : { west: 7, south: 51, east: 7.2, north: 51.3 }
      ),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn((id) => id.x !== flatId.x),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireCesiumTerrainTileSource.mockResolvedValue(source);
    const runtime = buildCesiumTerrainRuntime(
      "terrain-with-flat-coverage",
      "https://example.test/terrain-with-flat-coverage",
      [7.15, 51.256],
      { minimumLevel: 10, maximumLevel: 10 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(source.requestTile).toHaveBeenCalledWith(zeroSourceId);
    expect(source.requestTile).toHaveBeenCalledWith(sourceId);
    expect(runtime.root.children).toHaveLength(3);
    const flatMesh = runtime.root.children.find((child) =>
      child.name.includes("flat:10/533/218")
    ) as {
      castShadow: boolean;
      receiveShadow: boolean;
      geometry: BufferGeometry;
    };
    expect(flatMesh.castShadow).toBe(false);
    expect(flatMesh.receiveShadow).toBe(true);
    const flatNormals = flatMesh.geometry.getAttribute("normal");
    for (let index = 0; index < flatNormals.count; index += 1) {
      expect(flatNormals.getX(index)).toBeCloseTo(0);
      expect(flatNormals.getY(index)).toBeCloseTo(1);
      expect(flatNormals.getZ(index)).toBeCloseTo(0);
    }
    const zeroSourceMesh = runtime.root.children.find((child) =>
      child.name.includes("source:10/531/218")
    ) as { castShadow: boolean; receiveShadow: boolean };
    expect(zeroSourceMesh.castShadow).toBe(false);
    expect(zeroSourceMesh.receiveShadow).toBe(true);
    const reliefSourceMesh = runtime.root.children.find((child) =>
      child.name.includes("source:10/532/218")
    ) as { castShadow: boolean; receiveShadow: boolean };
    expect(reliefSourceMesh.castShadow).toBe(true);
    expect(reliefSourceMesh.receiveShadow).toBe(true);
    const flatGeometryCall = createProjectedTerrainTileGeometry.mock.calls.find(
      ([{ tile }]) => tile.id.x === flatId.x
    );
    expect(flatGeometryCall).toBeDefined();
    expect([...flatGeometryCall![0].tile.heightMeters]).toEqual([0, 0, 0, 0]);

    runtime.dispose();
  });

  it("replaces a coarse parent with mixed source and flat children", async () => {
    const parentId = { level: 10, x: 532, y: 218 };
    const sourceChildId = { level: 11, x: 1_064, y: 436 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileIdsForBounds: vi.fn(() => [parentId]),
      getTileGridIdsForBounds: vi.fn(() => [parentId]),
      getTileBounds: vi.fn((id) => {
        if (id.level === parentId.level) {
          return { west: 7, south: 51, east: 7.4, north: 51.4 };
        }
        const west = id.x % 2 === 0 ? 7 : 7.2;
        const north = id.y % 2 === 0 ? 51.4 : 51.2;
        return { west, south: north - 0.2, east: west + 0.2, north };
      }),
      getLevelMaximumGeometricError: vi.fn(() => 1_000_000),
      getTileDataAvailable: vi.fn(
        (id) => id.level === parentId.level || id.x === sourceChildId.x
      ),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireCesiumTerrainTileSource.mockResolvedValue(source);
    const runtime = buildCesiumTerrainRuntime(
      "terrain-mixed-children",
      "https://example.test/terrain-mixed-children",
      [7.2, 51.2],
      { minimumLevel: 10, maximumLevel: 11, errorTargetPixels: 0.1 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.4,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(source.requestTile).toHaveBeenCalledWith(sourceChildId);
    expect(source.requestTile).toHaveBeenCalledWith({
      level: 11,
      x: 1_064,
      y: 437,
    });
    expect(
      runtime.root.children.some((child) => child.name.includes("source:10/"))
    ).toBe(false);
    expect(
      runtime.root.children.filter((child) => child.name.includes("flat:11/"))
    ).toHaveLength(2);
    expect(runtime.root.children).toHaveLength(4);

    runtime.dispose();
  });
});
