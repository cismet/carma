import { MercatorCoordinate } from "maplibre-gl";
import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  Group,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  FrontSide,
  MeshLambertMaterial,
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
  let fineBoundaryNormalBeforeSmoothing: Vector3 | null;

  beforeEach(() => {
    vi.clearAllMocks();
    fineBoundaryNormalBeforeSmoothing = null;
    createProjectedTerrainTileGeometry.mockImplementation(({ tile }) => {
      const geometry = new BufferGeometry();
      const isSyntheticFlat =
        tile.heightMeters.length === 4 &&
        tile.heightMeters.every((height) => height === 0);
      const tileX = tile.id?.x;
      const west = tileX === 531 ? -1 : tileX === 533 ? 1 : 0;
      const nearHeight = tile.heightMeters[0] === 123 ? 1 : 0;
      const farHeight = !isSyntheticFlat && tileX === 533 ? 1 : 0;
      if (tile.heightMeters[0] === 456) {
        geometry.setAttribute(
          "position",
          new Float32BufferAttribute(
            new Float32Array([
              1, 0, 0, 1, 0, -0.5, 1, 0, -1, 2, 1, 0, 2, 1, -0.5, 2, 1, -1,
            ]),
            3
          )
        );
        geometry.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
        geometry.computeVertexNormals();
        const normal = geometry.getAttribute("normal");
        fineBoundaryNormalBeforeSmoothing = new Vector3(
          normal.getX(1),
          normal.getY(1),
          normal.getZ(1)
        );
        return geometry;
      }
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

  it("interpolates coarse neighbor normals for finer LOD edge vertices", async () => {
    const coarseId = { level: 10, x: 532, y: 218 };
    const fineId = { level: 11, x: 533, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters:
          id === fineId ? new Float32Array([456]) : new Float32Array([100]),
        westIndices:
          id === fineId ? new Uint32Array([0, 1, 2]) : new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices:
          id === coarseId ? new Uint32Array([2, 3]) : new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileIdsForBounds: vi.fn(() => [coarseId, fineId]),
      getTileGridIdsForBounds: vi.fn(() => [coarseId, fineId]),
      getTileBounds: vi.fn((id) =>
        id === fineId
          ? { west: 7.2, south: 51, east: 7.4, north: 51.3 }
          : { west: 7, south: 51, east: 7.2, north: 51.3 }
      ),
      getLevelMaximumGeometricError: vi.fn(() => 0.00001),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
    };
    acquireCesiumTerrainTileSource.mockResolvedValue(source);
    const runtime = buildCesiumTerrainRuntime(
      "mixed-lod-terrain",
      "https://example.test/mixed-lod-terrain",
      [7.15, 51.256],
      { minimumLevel: 10, maximumLevel: 11 }
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
    const fineMesh = (
      runtime.root.children.find((child) =>
        child.name.endsWith("11/533/218")
      ) as Group
    ).children[0] as Mesh;
    const smoothedNormal = fineMesh.geometry.getAttribute("normal");

    expect(fineBoundaryNormalBeforeSmoothing).not.toBeNull();
    expect(smoothedNormal.getY(1)).toBeGreaterThan(
      fineBoundaryNormalBeforeSmoothing!.y + 0.1
    );

    runtime.dispose();
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
    const onContentChanged = vi.fn();
    const runtime = buildCesiumTerrainRuntime(
      "terrain",
      "https://example.test/terrain",
      [7.15, 51.256],
      {
        minimumLevel: 10,
        maximumLevel: 10,
        shadowLevelOffset: 0,
        onContentChanged,
      }
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
    expect(runtime.root.children).toHaveLength(2);
    const coverageMesh = runtime.root.children.find((child) =>
      child.name.endsWith("-viewport-coverage")
    ) as Mesh;
    expect(coverageMesh.castShadow).toBe(false);
    expect(coverageMesh.receiveShadow).toBe(true);
    expect(coverageMesh.userData.disableShadowCasting).toBe(true);
    expect((coverageMesh.material as MeshLambertMaterial).polygonOffset).toBe(
      true
    );
    const tileNode = runtime.root.children.find((child) =>
      child.name.includes("source:")
    ) as Group;
    expect(tileNode.children).toHaveLength(1);
    const mesh = tileNode.children[0] as Mesh & {
      castShadow: boolean;
      receiveShadow: boolean;
      material: { side: number; shadowSide: number | null };
      customDepthMaterial?: unknown;
      geometry: { getAttribute: (name: string) => { count: number } };
    };
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.material).toBeInstanceOf(MeshLambertMaterial);
    expect(mesh.material.side).toBe(FrontSide);
    expect(mesh.material.shadowSide).toBe(FrontSide);
    // Standard depth pass: acne control lives in the light's texel-scaled
    // normal bias, not in a per-mesh depth material.
    expect(mesh.customDepthMaterial).toBeUndefined();
    expect(mesh.geometry.getAttribute("position").count).toBe(4);
    expect(source.requestTile).toHaveBeenCalledWith(tileId);
    expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    expect(notifySharedThreeTerrainChanged).toHaveBeenCalledWith(map);
    expect(onContentChanged).toHaveBeenCalledOnce();

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
      expect(runtime.root.children).toHaveLength(3);
    });
    expect(onContentChanged).toHaveBeenCalledTimes(2);
    const viewportNormal = (
      (
        runtime.root.children.find((child) =>
          child.name.endsWith("10/532/218")
        ) as Group
      ).children[0] as Mesh
    ).geometry.getAttribute("normal");
    const occluderNormal = (
      (
        runtime.root.children.find((child) =>
          child.name.endsWith("10/533/218")
        ) as Group
      ).children[0] as Mesh
    ).geometry.getAttribute("normal");
    expect(viewportNormal.getX(2)).toBeCloseTo(occluderNormal.getX(0));
    expect(viewportNormal.getY(2)).toBeCloseTo(occluderNormal.getY(0));

    runtime.dispose();
    expect(runtime.root.children).toHaveLength(0);
  });

  it("selects terrain from the union of all shadow-camera frusta", async () => {
    const westId = { level: 10, x: 531, y: 218 };
    const viewportId = { level: 10, x: 532, y: 218 };
    const eastId = { level: 10, x: 533, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileIdsForBounds: vi.fn(() => [viewportId]),
      getTileGridIdsForBounds: vi.fn((bounds) => {
        const ids = [viewportId];
        if (bounds.west < 7.05) ids.unshift(westId);
        if (bounds.east > 7.25) ids.push(eastId);
        return ids;
      }),
      getTileBounds: vi.fn((id) =>
        id.x === westId.x
          ? { west: 6.8, south: 51.2, east: 7, north: 51.3 }
          : id.x === eastId.x
          ? { west: 7.4, south: 51.2, east: 7.5, north: 51.3 }
          : { west: 7.1, south: 51.2, east: 7.2, north: 51.3 }
      ),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireCesiumTerrainTileSource.mockResolvedValue(source);
    const originLngLat: [number, number] = [7.15, 51.256];
    const runtime = buildCesiumTerrainRuntime(
      "multi-shadow-terrain",
      "https://example.test/multi-shadow-terrain",
      originLngLat,
      { minimumLevel: 10, maximumLevel: 10 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.1,
        getSouth: () => 51.2,
        getEast: () => 7.2,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
    lodCamera.position.set(0, 1_000, 0);
    const frame = {
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    };
    runtime.update(frame);
    await expect(runtime.ready).resolves.toBe(true);

    const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
    const meterScale = origin.meterInMercatorCoordinateUnits();
    const makeShadowCamera = (longitude: number) => {
      const coordinate = MercatorCoordinate.fromLngLat(
        [longitude, originLngLat[1]],
        0
      );
      const x = (coordinate.x - origin.x) / meterScale;
      const z = (coordinate.y - origin.y) / meterScale;
      const camera = new OrthographicCamera(-500, 500, 500, -500, 1, 5_000);
      camera.position.set(x, 1_000, z);
      camera.lookAt(x, 0, z);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      return camera;
    };
    runtime.setShadowCameras([makeShadowCamera(6.9), makeShadowCamera(7.45)]);
    runtime.update(frame);

    await vi.waitFor(() => {
      expect(source.requestTile).toHaveBeenCalledWith(westId);
      expect(source.requestTile).toHaveBeenCalledWith(eastId);
    });
    runtime.dispose();
  });

  it("uses orthographic shadow resolution to refine offscreen occluders", async () => {
    const parentId = { level: 10, x: 532, y: 218 };
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
          return { west: 7.4, south: 51.24, east: 7.46, north: 51.27 };
        }
        const west = id.x % 2 === 0 ? 7.4 : 7.43;
        const north = id.y % 2 === 0 ? 51.27 : 51.255;
        return { west, south: north - 0.015, east: west + 0.03, north };
      }),
      getLevelMaximumGeometricError: vi.fn(() => 100),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireCesiumTerrainTileSource.mockResolvedValue(source);
    const originLngLat: [number, number] = [7.15, 51.256];
    const runtime = buildCesiumTerrainRuntime(
      "orthographic-shadow-terrain",
      "https://example.test/orthographic-shadow-terrain",
      originLngLat,
      {
        minimumLevel: 10,
        maximumLevel: 11,
        errorTargetPixels: 2.5,
        shadowLevelOffset: 2,
      }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.1,
        getSouth: () => 51.24,
        getEast: () => 7.2,
        getNorth: () => 51.27,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
    const coordinate = MercatorCoordinate.fromLngLat(
      [7.43, originLngLat[1]],
      0
    );
    const meterScale = origin.meterInMercatorCoordinateUnits();
    const x = (coordinate.x - origin.x) / meterScale;
    const z = (coordinate.y - origin.y) / meterScale;
    const shadowCamera = new OrthographicCamera(-500, 500, 500, -500, 1, 5_000);
    shadowCamera.position.set(x, 1_000, z);
    shadowCamera.lookAt(x, 0, z);
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    runtime.setShadowCameras([
      {
        camera: shadowCamera,
        shadowMapSize: { width: 1_000, height: 1_000 },
      },
    ]);
    const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
    lodCamera.position.set(0, 1_000, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      // Deliberately unrelated to the 1,000 px shadow map: terrain shadow LOD
      // must follow the raster it is rendered into, not the browser viewport.
      viewport: new Vector2(1, 1),
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile.mock.calls.some(([id]) => id.level === 11)).toBe(
      true
    );
    expect(source.requestTile).not.toHaveBeenCalledWith(parentId);
    runtime.dispose();
  });

  it("fills unavailable viewport cells with zero-elevation receiver tiles", async () => {
    const zeroSourceId = { level: 10, x: 531, y: 218 };
    const sourceId = { level: 10, x: 532, y: 218 };
    const flatId = { level: 10, x: 533, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        bounds:
          id.x === zeroSourceId.x
            ? { west: 6.8, south: 51, east: 7, north: 51.3 }
            : { west: 7, south: 51, east: 7.2, north: 51.3 },
        u: new Float32Array([0, 0, 1, 1]),
        v: new Float32Array([0, 1, 0, 1]),
        heightMeters:
          id.x === zeroSourceId.x
            ? new Float32Array([0, 0, 0, 0])
            : new Float32Array([123, 123, 123, 0]),
        indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
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
      { minimumLevel: 10, maximumLevel: 10, noDataHeightMeters: 0 }
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
    expect(runtime.root.children).toHaveLength(4);
    const flatNode = runtime.root.children.find((child) =>
      child.name.includes("flat:10/533/218")
    ) as Group;
    expect(flatNode.children).toHaveLength(1);
    const flatMesh = flatNode.children[0] as Mesh;
    expect(flatMesh.castShadow).toBe(false);
    expect(flatMesh.receiveShadow).toBe(true);
    const flatNormals = flatMesh.geometry.getAttribute("normal");
    for (let index = 0; index < flatNormals.count; index += 1) {
      expect(flatNormals.getX(index)).toBeCloseTo(0);
      expect(flatNormals.getY(index)).toBeCloseTo(1);
      expect(flatNormals.getZ(index)).toBeCloseTo(0);
    }
    const zeroSourceNode = runtime.root.children.find((child) =>
      child.name.includes("source:10/531/218")
    ) as Group;
    expect(zeroSourceNode.children).toHaveLength(1);
    const zeroSourceMesh = zeroSourceNode.children[0] as Mesh;
    expect(zeroSourceMesh.castShadow).toBe(false);
    expect(zeroSourceMesh.receiveShadow).toBe(true);
    const mixedSourceNode = runtime.root.children.find((child) =>
      child.name.includes("source:10/532/218")
    ) as Group;
    expect(mixedSourceNode.children).toHaveLength(2);
    const mixedBaseMesh = mixedSourceNode.children.find((child) =>
      child.name.endsWith("-base")
    ) as Mesh;
    const reliefSourceMesh = mixedSourceNode.children.find((child) =>
      child.name.endsWith("-relief")
    ) as Mesh;
    expect(mixedBaseMesh.castShadow).toBe(false);
    expect(mixedBaseMesh.receiveShadow).toBe(true);
    expect(mixedBaseMesh.geometry.getAttribute("position").count).toBe(4);
    const mixedBaseNormals = mixedBaseMesh.geometry.getAttribute("normal");
    for (let index = 0; index < mixedBaseNormals.count; index += 1) {
      expect(mixedBaseNormals.getX(index)).toBeCloseTo(0);
      expect(mixedBaseNormals.getY(index)).toBeCloseTo(1);
      expect(mixedBaseNormals.getZ(index)).toBeCloseTo(0);
    }
    expect(reliefSourceMesh.castShadow).toBe(true);
    expect(reliefSourceMesh.receiveShadow).toBe(true);
    expect(reliefSourceMesh.customDepthMaterial).toBeUndefined();
    expect(reliefSourceMesh.geometry.getAttribute("position").count).toBe(4);
    expect(Array.from(reliefSourceMesh.geometry.getIndex()!.array)).toEqual([
      0, 2, 1,
    ]);
    const flatGeometryCall = createProjectedTerrainTileGeometry.mock.calls.find(
      ([{ tile }]) => tile.id?.x === flatId.x
    );
    expect(flatGeometryCall).toBeDefined();
    expect([...flatGeometryCall![0].tile.heightMeters]).toEqual([0, 0, 0, 0]);

    runtime.dispose();
  });

  it("keeps a coarse parent whole when a child quadrant has no data", async () => {
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
    const lowResolutionShadowCamera = new OrthographicCamera(
      -50_000,
      50_000,
      50_000,
      -50_000,
      1,
      5_000
    );
    lowResolutionShadowCamera.position.set(0, 1_000, 0);
    lowResolutionShadowCamera.lookAt(0, 0, 0);
    lowResolutionShadowCamera.updateProjectionMatrix();
    lowResolutionShadowCamera.updateMatrixWorld(true);
    runtime.setShadowCameras([lowResolutionShadowCamera]);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    });

    await expect(runtime.ready).resolves.toBe(true);
    // Splitting would trade the parent's real ground for sea-level plates in
    // the quadrants without data - a hole in the view, and up-sun a hole in
    // the shadow. The parent stays whole; refinement ends at the
    // availability boundary.
    expect(source.requestTile).toHaveBeenCalledTimes(1);
    expect(source.requestTile).toHaveBeenCalledWith(parentId);
    expect(
      runtime.root.children.some((child) => child.name.includes("source:10/"))
    ).toBe(true);
    expect(
      runtime.root.children.some((child) => child.name.includes("flat:11/"))
    ).toBe(false);

    runtime.dispose();
  });

  it("refines the viewport to its error target before the sun coverage", async () => {
    // One viewport tile and three sun-coverage tiles west of it compete for a
    // budget that only fits the viewport split. The view must reach its own
    // pixel-error target regardless of how demanding the sun coverage is, and
    // its tiles must be first in the download order.
    const viewportId = { level: 10, x: 532, y: 218 };
    // A one-tile gap to the viewport keeps edge-touching out of the picture.
    const westIds = [
      { level: 10, x: 528, y: 218 },
      { level: 10, x: 529, y: 218 },
      { level: 10, x: 530, y: 218 },
    ];
    const boundsOf = (id: { level: number; x: number; y: number }) => {
      const scale = 2 ** (id.level - 10);
      const width = 0.1 / scale;
      const west = 7.1 + (id.x - 532 * scale) * width;
      const north = 51.3 - (id.y - 218 * scale) * width;
      return { west, south: north - width, east: west + width, north };
    };
    const intersects = (
      a: { west: number; south: number; east: number; north: number },
      b: { west: number; south: number; east: number; north: number }
    ) => a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileIdsForBounds: vi.fn(() => [viewportId]),
      getTileGridIdsForBounds: vi.fn((bounds) =>
        [...westIds, viewportId].filter((id) => intersects(boundsOf(id), bounds))
      ),
      getTileBounds: vi.fn(boundsOf),
      getLevelMaximumGeometricError: vi.fn((level) => 200 / 2 ** (level - 10)),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireCesiumTerrainTileSource.mockResolvedValue(source);
    const originLngLat: [number, number] = [7.15, 51.25];
    const runtime = buildCesiumTerrainRuntime(
      "viewport-priority-terrain",
      "https://example.test/viewport-priority-terrain",
      originLngLat,
      {
        minimumLevel: 10,
        maximumLevel: 11,
        errorTargetPixels: 0.1,
        shadowLevelOffset: 0,
        // Roots (4) plus the viewport split (net +3) fit; the sun-coverage
        // split (net +3 more) must not.
        maxSelectionTiles: 7,
      }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.1,
        getSouth: () => 51.2,
        getEast: () => 7.2,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
    const meterScale = origin.meterInMercatorCoordinateUnits();
    const westCenter = MercatorCoordinate.fromLngLat([6.85, 51.25], 0);
    const shadowCamera = new OrthographicCamera(
      -12_000,
      12_000,
      12_000,
      -12_000,
      1,
      20_000
    );
    shadowCamera.position.set(
      (westCenter.x - origin.x) / meterScale,
      2_000,
      (westCenter.y - origin.y) / meterScale
    );
    shadowCamera.lookAt(
      (westCenter.x - origin.x) / meterScale,
      0,
      (westCenter.y - origin.y) / meterScale
    );
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    runtime.setShadowCameras([shadowCamera]);
    const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
    lodCamera.position.set(0, 500, 0);
    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    });
    await expect(runtime.ready).resolves.toBe(true);

    const requestedIds = source.requestTile.mock.calls.map(([id]) => id);
    // The viewport root split into its level-11 children ...
    expect(
      requestedIds.filter((id) => id.level === 11 && id.x >> 1 === 532)
    ).toHaveLength(4);
    // ... while the sun coverage stayed at its root level: the leftover
    // budget cannot fit another split.
    expect(requestedIds.filter((id) => id.level === 11 && id.x >> 1 !== 532))
      .toHaveLength(0);
    for (const westId of westIds) {
      expect(requestedIds).toContainEqual(westId);
    }
    // Download order: everything in view comes before the sun coverage.
    const viewportIndices = requestedIds
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => id.level === 11 || (id.level === 10 && id.x === 532))
      .map(({ index }) => index);
    const coverageIndices = requestedIds
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => id.level === 10 && id.x !== 532)
      .map(({ index }) => index);
    expect(Math.max(...viewportIndices)).toBeLessThan(
      Math.min(...coverageIndices)
    );

    runtime.dispose();
  });

  it("keeps visible ground untouched when a superseded batch lands", async () => {
    // The sun animation supersedes selection after selection. A superseded
    // batch caches its tiles for the successor - but it also lists every
    // tile of the current view, and it must never blank the meshes that are
    // already on screen.
    // 0.125 is binary-exact; 0.1 is not, and the resulting wobble once let a
    // neighbouring tile leak into the first selection.
    const boundsOf = (id: { level: number; x: number; y: number }) => {
      const width = 0.125;
      const west = 7.125 + (id.x - 532) * width;
      return { west, south: 51.2, east: west + width, north: 51.3 };
    };
    const intersects = (
      a: { west: number; south: number; east: number; north: number },
      b: { west: number; south: number; east: number; north: number }
    ) => a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
    const allIds = [
      { level: 10, x: 532, y: 218 },
      { level: 10, x: 533, y: 218 },
      { level: 10, x: 534, y: 218 },
    ];
    const pendingResolvers: Array<() => void> = [];
    const source = {
      requestTile: vi.fn(
        (id) =>
          new Promise((resolve) => {
            pendingResolvers.push(() =>
              resolve({
                id,
                heightMeters: new Float32Array([100]),
                westIndices: new Uint32Array(),
                southIndices: new Uint32Array(),
                eastIndices: new Uint32Array(),
                northIndices: new Uint32Array(),
              })
            );
          })
      ),
      getTileIdsForBounds: vi.fn(() => [allIds[0]]),
      getTileGridIdsForBounds: vi.fn((bounds) =>
        allIds.filter((id) => intersects(boundsOf(id), bounds))
      ),
      getTileBounds: vi.fn(boundsOf),
      getLevelMaximumGeometricError: vi.fn(() => 0.0001),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireCesiumTerrainTileSource.mockResolvedValue(source);
    const runtime = buildCesiumTerrainRuntime(
      "superseded-batch-terrain",
      "https://example.test/superseded-batch-terrain",
      [7.15, 51.25],
      { minimumLevel: 10, maximumLevel: 10 }
    );
    let viewEast = 7.2;
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.125,
        getSouth: () => 51.2,
        getEast: () => viewEast,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const renderAt = (x: number) => {
      const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
      lodCamera.position.set(x, 1_000, 0);
      lodCamera.updateMatrixWorld(true);
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1_000, 1_000),
      });
    };

    // Generation 1: one tile, loads and applies.
    renderAt(0);
    pendingResolvers.splice(0).forEach((resolve) => resolve());
    await flush();
    const visibleNode = () =>
      runtime.root.children.find((child) =>
        child.name.includes("source:10/532/")
      );
    expect(visibleNode()?.visible).toBe(true);

    // Generation 2 widens the view, then generation 3 supersedes it before
    // its fetches resolve.
    viewEast = 7.3;
    renderAt(100);
    await flush();
    expect(pendingResolvers).toHaveLength(2);
    viewEast = 7.45;
    renderAt(200);
    await flush();
    expect(pendingResolvers).toHaveLength(5);
    // The winner lands first ...
    pendingResolvers.splice(2).forEach((resolve) => resolve());
    await flush();
    expect(visibleNode()?.visible).toBe(true);
    // ... and only then the superseded batch completes. It lists the tile
    // that is on screen; finishing late must not blank it.
    pendingResolvers.splice(0).forEach((resolve) => resolve());
    await flush();
    expect(visibleNode()?.visible).toBe(true);

    runtime.dispose();
  });
});
