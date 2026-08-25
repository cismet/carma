import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  OrthographicCamera,
  PerspectiveCamera,
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
      const farHeight = tile.id.x === 533 ? 1 : 0;
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(
          new Float32Array([
            tile.id.x === 533 ? 1 : 0,
            0,
            0,
            tile.id.x === 533 ? 1 : 0,
            0,
            -1,
            tile.id.x === 533 ? 2 : 1,
            farHeight,
            0,
            tile.id.x === 533 ? 2 : 1,
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
    expect(runtime.supportsShadows).toBe(true);
    expect(runtime.root.children).toHaveLength(1);
    const mesh = runtime.root.children[0] as {
      castShadow: boolean;
      receiveShadow: boolean;
      geometry: { getAttribute: (name: string) => { count: number } };
    };
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
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
});
