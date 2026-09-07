import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
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
  acquireRasterDemTerrainTileSource,
  createProjectedTerrainTileGeometry,
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading,
} = vi.hoisted(() => ({
  acquireRasterDemTerrainTileSource: vi.fn(),
  createProjectedTerrainTileGeometry: vi.fn(),
  notifySharedThreeTerrainChanged: vi.fn(),
  registerSharedThreeTerrainSampler: vi.fn(() => vi.fn()),
  setSharedThreeTerrainLoading: vi.fn(),
}));

vi.mock(
  "@carma-mapping/engines/three/primitives/core",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@carma-mapping/engines/three/primitives/core")
    >()),
    createProjectedTerrainTileGeometry,
  })
);

vi.mock("./raster-dem-terrain-tile-source", () => ({
  acquireRasterDemTerrainTileSource,
  isConfirmedTerrainServerError: () => false,
  terrainTileKey: ({ level, x, y }: Record<string, number>) =>
    `${level}/${x}/${y}`,
}));

vi.mock("./shared-three-terrain-registry", () => ({
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading,
}));

import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

const terrainConfig = (url: string) => ({
  id: "test-terrain",
  url,
  tileSize: 512,
  minzoom: 0,
  maxzoom: 18,
  encoding: "terrarium" as const,
  bounds: [-180, -85, 180, 85] as const,
});

describe("buildRasterDemTerrainRuntime", () => {
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
              1, 2, 0, 1, 2, -0.5, 1, 2, -1, 2, 1, 0, 2, 1, -0.5, 2, 1, -1,
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

  it("caps an excessive configured request concurrency per terrain origin", async () => {
    const tileIds = Array.from({ length: 30 }, (_, x) => ({
      level: 10,
      x,
      y: 0,
    }));
    const requestTile = vi.fn(() => new Promise(() => undefined));
    const source = {
      requestTile,
      getTileGridIdsForBounds: vi.fn(() => tileIds),
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
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "bounded-terrain",
      terrainConfig("https://example.test/bounded-terrain"),
      [7.15, 51.256],
      {
        minimumLevel: 10,
        maximumLevel: 10,
        maxSelectionTiles: tileIds.length,
        requestConcurrency: 256,
      }
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

    await vi.waitFor(() => expect(requestTile).toHaveBeenCalledTimes(24));
    runtime.dispose();
  });

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

  it("interpolates coarse neighbor normals", async () => {
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
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "mixed-lod-terrain",
      terrainConfig("https://example.test/mixed-lod-terrain"),
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
    // ready means first visible terrain, not completion of the asynchronous
    // worker seam pass. Wait for the final geometry to be published.
    await vi.waitFor(() =>
      expect(fineMesh.geometry.getAttribute("position").getY(0)).toBe(0)
    );
    const smoothedNormal = fineMesh.geometry.getAttribute("normal");
    const stitchedPosition = fineMesh.geometry.getAttribute("position");

    expect(fineBoundaryNormalBeforeSmoothing).not.toBeNull();
    expect(stitchedPosition.getY(0)).toBe(0);
    expect(stitchedPosition.getY(1)).toBe(0);
    expect(stitchedPosition.getY(2)).toBe(0);
    expect(smoothedNormal.getY(1)).toBeGreaterThan(
      fineBoundaryNormalBeforeSmoothing!.y + 0.1
    );
    expect(fineMesh.parent!.visible).toBe(true);

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
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const onContentChanged = vi.fn();
    const runtime = buildRasterDemTerrainRuntime(
      "terrain",
      terrainConfig("https://example.test/terrain"),
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
    expect(runtime.root.children).toHaveLength(1);
    expect(
      runtime.root.children.some((child) =>
        child.name.endsWith("-viewport-coverage")
      )
    ).toBe(false);
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
    await vi.waitFor(() =>
      expect(notifySharedThreeTerrainChanged).toHaveBeenCalledWith(map)
    );
    expect(onContentChanged).not.toHaveBeenCalled();
    const frame = {
      map: map as never,
      renderCamera: new Camera(),
      lodCamera,
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    };
    runtime.update(frame);
    runtime.update(frame);
    expect(onContentChanged).toHaveBeenCalledOnce();
    const debugVolumes = runtime.getActiveTileVolumes();
    expect(debugVolumes).toHaveLength(1);
    expect(debugVolumes[0]).toMatchObject({
      id: "terrain:source:10/532/218",
      kind: "terrain-tile",
    });
    expect(debugVolumes[0]?.minimum.every(Number.isFinite)).toBe(true);
    expect(debugVolumes[0]?.maximum.every(Number.isFinite)).toBe(true);
    expect(debugVolumes[0]?.minimum[1]).toBeGreaterThan(99);
    expect(debugVolumes[0]?.maximum[1]).toBeLessThan(101);

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
    runtime.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 1_000, height: 1_000 },
    });
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
    runtime.update(frame);
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

  it("loads the viewport on the first update without an interaction gate", async () => {
    const tileId = { level: 10, x: 532, y: 218 };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [tileId]),
      getTileBounds: vi.fn(() => ({
        west: 7,
        south: 51,
        east: 7.2,
        north: 51.3,
      })),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "initial-viewport-terrain",
      terrainConfig("https://example.test/initial-viewport-terrain"),
      [7.15, 51.256],
      { minimumLevel: 10, maximumLevel: 10 }
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
    expect(setSharedThreeTerrainLoading).toHaveBeenCalledWith(
      map,
      "initial-viewport-terrain",
      true
    );
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });

    runtime.update({
      map: map as never,
      renderCamera: new Camera(),
      lodCamera: new PerspectiveCamera(60, 1, 1, 10_000),
      lookTarget: new Vector3(),
      viewport: new Vector2(1_000, 1_000),
    });

    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile).toHaveBeenCalledWith(tileId);
    await vi.waitFor(() =>
      expect(setSharedThreeTerrainLoading).toHaveBeenLastCalledWith(
        map,
        "initial-viewport-terrain",
        false,
        0
      )
    );
    expect(setSharedThreeTerrainLoading).toHaveBeenCalledWith(
      map,
      "initial-viewport-terrain",
      true,
      0.5
    );
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
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const originLngLat: [number, number] = [7.15, 51.256];
    const runtime = buildRasterDemTerrainRuntime(
      "orthographic-shadow-terrain",
      terrainConfig("https://example.test/orthographic-shadow-terrain"),
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
    runtime.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 1_000, height: 1_000 },
    });
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

  it.each([
    { sourceMaxzoom: 18, maximumLevel: 14, finalLevel: 14 },
    {
      sourceMaxzoom: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.maxzoom,
      maximumLevel: undefined,
      finalLevel: 16,
    },
    { sourceMaxzoom: 15, maximumLevel: undefined, finalLevel: 15 },
    { sourceMaxzoom: 16, maximumLevel: 20, finalLevel: 16 },
  ])(
    "loads only the first <=16px stage and final detail $finalLevel (source $sourceMaxzoom, limit $maximumLevel)",
    async ({ sourceMaxzoom, maximumLevel, finalLevel }) => {
      const source = {
        requestTile: vi.fn(async (id) => ({
          id,
          heightMeters: new Float32Array([100]),
          westIndices: new Uint32Array(),
          southIndices: new Uint32Array(),
          eastIndices: new Uint32Array(),
          northIndices: new Uint32Array(),
        })),
        getTileGridIdsForBounds: vi.fn(() => [{ level: 10, x: 0, y: 0 }]),
        getTileBounds: vi.fn((id) =>
          id.x === 0 && id.y === 0
            ? { west: 7.1, south: 51.24, east: 7.2, north: 51.27 }
            : { west: 40, south: 60, east: 40.1, north: 60.1 }
        ),
        getLevelMaximumGeometricError: vi.fn(
          (level) => 0.1 / 2 ** (level - 10)
        ),
        getTileDataAvailable: vi.fn(() => true),
        sampleHeight: vi.fn(),
        trimCache: vi.fn(),
      };
      acquireRasterDemTerrainTileSource.mockResolvedValue(source);
      const runtime = buildRasterDemTerrainRuntime(
        "skip-ancestors",
        {
          ...terrainConfig("https://example.test/skip-ancestors"),
          maxzoom: sourceMaxzoom,
        },
        [7.15, 51.256],
        { minimumLevel: 10, maximumLevel, errorTargetPixels: 0.5 }
      );
      const map = {
        getBounds: () => ({
          getWest: () => 7.1,
          getSouth: () => 51.24,
          getEast: () => 7.2,
          getNorth: () => 51.27,
        }),
        triggerRepaint: vi.fn(),
      };
      runtime.onAdd?.(map as never);
      await vi.waitFor(() =>
        expect(registerSharedThreeTerrainSampler).toHaveBeenCalled()
      );
      const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
      lodCamera.position.set(0, 1000, 0);
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1000, 1000),
      });
      await runtime.ready;
      await vi.waitFor(() =>
        expect(source.requestTile).toHaveBeenCalledTimes(2)
      );
      expect(source.requestTile.mock.calls.map(([id]) => id.level)).toEqual([
        13,
        finalLevel,
      ]);
      runtime.dispose();
    }
  );

  it.each([true, false])(
    "publishes a parent only within 16 px, retains detail on pan (within target: %s)",
    async (withinInitialTarget) => {
      const parentId = { level: 10, x: 532, y: 218 };
      let resolveNeighbor = () => undefined;
      const neighborReady = new Promise<void>((resolve) => {
        resolveNeighbor = resolve;
      });
      let resolveChildren = () => undefined;
      const childrenReady = new Promise<void>((resolve) => {
        resolveChildren = resolve;
      });
      const createTile = (id: typeof parentId) => ({
        id,
        bounds: { west: 7, south: 51, east: 7.4, north: 51.4 },
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      });
      const source = {
        requestTile: vi.fn(async (id: typeof parentId) => {
          if (id.level > parentId.level) await childrenReady;
          if (id.level > parentId.level && id.x >= 1066) await neighborReady;
          return createTile(id);
        }),
        getTileGridIdsForBounds: vi.fn(() => [parentId]),
        getTileBounds: vi.fn((id: typeof parentId) => {
          if (id.level === parentId.level) {
            return { west: 7, south: 51, east: 7.4, north: 51.4 };
          }
          const west = id.x % 2 === 0 ? 7 : 7.2;
          const north = id.y % 2 === 0 ? 51.4 : 51.2;
          return { west, south: north - 0.2, east: west + 0.2, north };
        }),
        getLevelMaximumGeometricError: vi.fn(() =>
          withinInitialTarget ? 1 : 1_000_000
        ),
        getTileDataAvailable: vi.fn(() => true),
        sampleHeight: vi.fn(),
        trimCache: vi.fn(),
      };
      acquireRasterDemTerrainTileSource.mockResolvedValue(source);
      const runtime = buildRasterDemTerrainRuntime(
        "progressive-terrain",
        terrainConfig("https://example.test/progressive-terrain"),
        [7.2, 51.2],
        {
          minimumLevel: 10,
          maximumLevel: 11,
          errorTargetPixels: 0.001,
          heightRangeMeters: [0, 200],
        }
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

      if (withinInitialTarget) await expect(runtime.ready).resolves.toBe(true);
      else
        await vi.waitFor(() => expect(source.requestTile).toHaveBeenCalled());
      const parentNode = runtime.root.children.find((child) =>
        child.name.includes("source:10/532/218")
      );
      if (withinInitialTarget) expect(parentNode?.visible).toBe(true);
      else expect(source.requestTile).not.toHaveBeenCalledWith(parentId);

      resolveChildren();
      await expect(runtime.ready).resolves.toBe(true);
      await vi.waitFor(() => {
        expect(parentNode?.visible ?? false).toBe(false);
        expect(
          runtime.root.children.filter(
            (child) => child.visible && child.name.includes("source:11/")
          )
        ).toHaveLength(4);
      });

      // A pan adds another root whose children are still loading. The cached
      // coarse stage must not replace the already displayed detailed children.
      source.getTileGridIdsForBounds.mockReturnValue([
        parentId,
        { level: 10, x: 533, y: 218 },
      ]);
      lodCamera.position.x += 100;
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1_000, 1_000),
      });
      await vi.waitFor(() => {
        expect(
          source.requestTile.mock.calls.some(
            ([id]) => id.level === 11 && id.x >= 1066
          )
        ).toBe(true);
      });
      expect(parentNode?.visible ?? false).toBe(false);
      expect(
        runtime.root.children.filter(
          (child) => child.visible && child.name.includes("source:11/")
        )
      ).toHaveLength(4);
      resolveNeighbor();
      await vi.waitFor(() => {
        expect(
          runtime.root.children.filter(
            (child) => child.visible && child.name.includes("source:11/")
          )
        ).toHaveLength(8);
      });

      runtime.dispose();
    }
  );

  it("publishes an independent viewport root without waiting for its neighbor", async () => {
    const westId = { level: 10, x: 532, y: 218 };
    const eastId = { level: 10, x: 533, y: 218 };
    let resolveEast = () => undefined;
    const eastReady = new Promise<void>((resolve) => {
      resolveEast = resolve;
    });
    const source = {
      requestTile: vi.fn(async (id: typeof westId) => {
        if (id.x === eastId.x) await eastReady;
        return {
          id,
          heightMeters: new Float32Array([100]),
          westIndices: new Uint32Array(),
          southIndices: new Uint32Array(),
          eastIndices: new Uint32Array(),
          northIndices: new Uint32Array(),
        };
      }),
      getTileGridIdsForBounds: vi.fn(() => [westId, eastId]),
      getTileBounds: vi.fn((id: typeof westId) => ({
        west: id.x === westId.x ? 7 : 7.2,
        south: 51,
        east: id.x === westId.x ? 7.2 : 7.4,
        north: 51.4,
      })),
      getLevelMaximumGeometricError: vi.fn(() => 0.01),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "partial-root-terrain",
      terrainConfig("https://example.test/partial-root-terrain"),
      [7.2, 51.2],
      { minimumLevel: 10, maximumLevel: 10 }
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
    expect(
      runtime.root.children.find((child) =>
        child.name.includes("source:10/532/218")
      )?.visible
    ).toBe(true);
    expect(
      runtime.root.children.find((child) =>
        child.name.includes("source:10/533/218")
      )
    ).toBeUndefined();

    resolveEast();
    await vi.waitFor(() => {
      expect(
        runtime.root.children.find((child) =>
          child.name.includes("source:10/533/218")
        )?.visible
      ).toBe(true);
    });
    runtime.dispose();
  });

  it("leaves unavailable and no-data terrain transparent", async () => {
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
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "terrain-with-flat-coverage",
      terrainConfig("https://example.test/terrain-with-flat-coverage"),
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
    expect(runtime.root.children).toHaveLength(2);
    expect(
      runtime.root.children.some((child) => child.name.includes("flat:"))
    ).toBe(false);
    const zeroSourceNode = runtime.root.children.find((child) =>
      child.name.includes("source:10/531/218")
    ) as Group;
    expect(zeroSourceNode.children).toHaveLength(0);
    const mixedSourceNode = runtime.root.children.find((child) =>
      child.name.includes("source:10/532/218")
    ) as Group;
    expect(mixedSourceNode.children).toHaveLength(1);
    expect(
      mixedSourceNode.children.some((child) => child.name.endsWith("-base"))
    ).toBe(false);
    const reliefSourceMesh = mixedSourceNode.children.find((child) =>
      child.name.endsWith("-relief")
    ) as Mesh;
    expect(reliefSourceMesh.castShadow).toBe(true);
    expect(reliefSourceMesh.receiveShadow).toBe(true);
    expect(reliefSourceMesh.customDepthMaterial).toBeUndefined();
    expect(reliefSourceMesh.geometry.getAttribute("position").count).toBe(4);
    expect(Array.from(reliefSourceMesh.geometry.getIndex()!.array)).toEqual([
      0, 2, 1,
    ]);
    expect(
      createProjectedTerrainTileGeometry.mock.calls.some(
        ([{ tile }]) => tile.id?.x === flatId.x
      )
    ).toBe(false);

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
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "terrain-mixed-children",
      terrainConfig("https://example.test/terrain-mixed-children"),
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
    runtime.setShadowView({
      camera: lowResolutionShadowCamera,
      shadowMapSize: { width: 1_000, height: 1_000 },
    });
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
    ) =>
      a.west < b.east &&
      a.east > b.west &&
      a.south < b.north &&
      a.north > b.south;
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn((bounds) =>
        [...westIds, viewportId].filter((id) =>
          intersects(boundsOf(id), bounds)
        )
      ),
      getTileBounds: vi.fn(boundsOf),
      getLevelMaximumGeometricError: vi.fn((level) => 200 / 2 ** (level - 10)),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const originLngLat: [number, number] = [7.15, 51.25];
    const runtime = buildRasterDemTerrainRuntime(
      "viewport-priority-terrain",
      terrainConfig("https://example.test/viewport-priority-terrain"),
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
    runtime.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 1_000, height: 1_000 },
    });
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
    expect(
      requestedIds.filter((id) => id.level === 11 && id.x >> 1 !== 532)
    ).toHaveLength(0);
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

  it("refines elevated neighbor tiles whose 3D bounds enter the camera frustum", async () => {
    const centerId = { level: 10, x: 532, y: 218 };
    const foregroundId = { level: 10, x: 532, y: 219 };
    const boundsOf = (id: { level: number; x: number; y: number }) => {
      const scale = 2 ** (id.level - 10);
      const width = 0.02 / scale;
      const west = 7.14 + (id.x - 532 * scale) * width;
      const north = 51.26 - (id.y - 218 * scale) * width;
      return { west, south: north - width, east: west + width, north };
    };
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: new Float32Array([200, 220]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [centerId, foregroundId]),
      getTileBounds: vi.fn(boundsOf),
      getLevelMaximumGeometricError: vi.fn(
        (level) => 1_000 / 2 ** (level - 10)
      ),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "frustum-volume-terrain",
      terrainConfig("https://example.test/frustum-volume-terrain"),
      [7.15, 51.25],
      {
        minimumLevel: 10,
        maximumLevel: 11,
        errorTargetPixels: 50,
        maxSelectionTiles: 10,
      }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7.145,
        getSouth: () => 51.245,
        getEast: () => 7.155,
        getNorth: () => 51.255,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const viewport = new Vector2(1_200, 600);
    const renderAt = (z: number) => {
      const camera = new PerspectiveCamera(80, 2, 1, 100_000);
      camera.position.set(0, 210, z);
      camera.lookAt(0, 210, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      runtime.update({
        map: map as never,
        renderCamera: camera,
        lodCamera: camera,
        lookTarget: new Vector3(0, 210, 0),
        viewport,
      });
    };

    // Load both roots from a distant view. The foreground tile is outside the
    // planar map bounds, but its height volume is visible in the real frustum.
    renderAt(20_000);
    await expect(runtime.ready).resolves.toBe(true);
    expect(source.requestTile).toHaveBeenCalledWith(centerId);
    expect(source.requestTile).toHaveBeenCalledWith(foregroundId);

    source.requestTile.mockClear();
    renderAt(5_000);
    await vi.waitFor(() => {
      const requestedIds = source.requestTile.mock.calls.map(([id]) => id);
      expect(
        requestedIds.filter(
          (id) => id.level === 11 && id.y >> 1 === foregroundId.y
        )
      ).toHaveLength(4);
      expect(
        requestedIds.filter((id) => id.level === 11 && id.y >> 1 === centerId.y)
      ).toHaveLength(4);
    });

    runtime.dispose();
  });

  it("keeps visible ground untouched when a superseded batch lands", async () => {
    const boundsOf = (id: { level: number; x: number; y: number }) => {
      const width = 0.125;
      const west = 7.125 + (id.x - 532) * width;
      return { west, south: 51.2, east: west + width, north: 51.3 };
    };
    const intersects = (
      a: { west: number; south: number; east: number; north: number },
      b: { west: number; south: number; east: number; north: number }
    ) =>
      a.west < b.east &&
      a.east > b.west &&
      a.south < b.north &&
      a.north > b.south;
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
      getTileGridIdsForBounds: vi.fn((bounds) =>
        allIds.filter((id) => intersects(boundsOf(id), bounds))
      ),
      getTileBounds: vi.fn(boundsOf),
      getLevelMaximumGeometricError: vi.fn(() => 0.0001),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "superseded-batch-terrain",
      terrainConfig("https://example.test/superseded-batch-terrain"),
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

    renderAt(0);
    await vi.waitFor(() => expect(pendingResolvers).toHaveLength(1));
    pendingResolvers.splice(0).forEach((resolve) => resolve());
    await flush();
    const visibleNode = () =>
      runtime.root.children.find((child) =>
        child.name.includes("source:10/532/")
      );
    await vi.waitFor(() => expect(visibleNode()?.visible).toBe(true));

    viewEast = 7.3;
    renderAt(100);
    await flush();
    expect(pendingResolvers).toHaveLength(1);
    viewEast = 7.45;
    renderAt(200);
    await flush();
    // The overlapping second tile keeps its existing preparation job instead
    // of being fetched/projected again for the superseding camera selection.
    expect(pendingResolvers).toHaveLength(2);
    pendingResolvers.splice(1).forEach((resolve) => resolve());
    await flush();
    expect(visibleNode()?.visible).toBe(true);
    pendingResolvers.splice(0).forEach((resolve) => resolve());
    await flush();
    expect(visibleNode()?.visible).toBe(true);

    for (const id of allIds) {
      expect(
        source.requestTile.mock.calls.filter(([requested]) => requested === id)
      ).toHaveLength(1);
    }
    expect(createProjectedTerrainTileGeometry).toHaveBeenCalledTimes(
      allIds.length
    );
    runtime.dispose();
  });
});
