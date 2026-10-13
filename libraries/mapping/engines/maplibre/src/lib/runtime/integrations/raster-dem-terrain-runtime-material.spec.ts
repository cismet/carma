import {
  Box3,
  Camera,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  FrontSide,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Vector2,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import { createSharedThreeMapStyleProjection } from "./shared-three-map-style-projection";
import {
  acquireRasterDemTerrainTileSource,
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  terrainConfig,
  installRasterDemTerrainRuntimeFixture,
  createIdlePrefetchFixture,
} from "./raster-dem-terrain-runtime.test-support";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

describe("buildRasterDemTerrainRuntime material and local frame", () => {
  installRasterDemTerrainRuntimeFixture();

  it("reports renderable terrain only after publishing visible relief geometry", async () => {
    const fixture = createIdlePrefetchFixture("ground-readiness", 10);
    const runtime = fixture.runtime;
    expect(runtime.hasRenderableContent?.()).toBe(false);
    try {
      await fixture.start();
      await runtime.ready;
      expect(runtime.hasRenderableContent?.()).toBe(true);
      runtime.root.visible = false;
      expect(runtime.hasRenderableContent?.()).toBe(false);
      runtime.root.visible = true;
      expect(runtime.hasRenderableContent?.()).toBe(true);
      runtime.setGroundVisible(false);
      expect(runtime.hasRenderableContent?.()).toBe(false);
      runtime.setGroundVisible(true);
      expect(runtime.hasRenderableContent?.()).toBe(true);
      runtime.root.traverse((object) => {
        if (object instanceof Mesh) object.visible = false;
      });
      expect(runtime.hasRenderableContent?.()).toBe(false);
    } finally {
      runtime.dispose();
    }
    expect(runtime.hasRenderableContent?.()).toBe(false);
  });

  it("keeps trusted native height bounds while the coarse display cut contains only an intermediate height", async () => {
    const fixture = createIdlePrefetchFixture("trusted-native-range", 10);
    fixture.source.requestTile.mockImplementation(async (id) => ({
      ...fixture.makeTile(id),
      minimumHeightMeters: 25,
      maximumHeightMeters: 650,
    }));
    await fixture.start();
    await expect(fixture.runtime.ready).resolves.toBe(true);
    const camera = new OrthographicCamera(
      -100000000,
      100000000,
      100000000,
      -100000000,
      -100000000,
      100000000
    );
    expect(fixture.runtime.getViewSourceHeightRange(camera)).toEqual([25, 650]);
    expect(fixture.runtime.getElevation(7.1, 51.2)).toBe(100);
    fixture.runtime.dispose();
  });

  it("keeps the oblique raster unlit while preserving terrain queries and ground visibility", async () => {
    const fixture = createIdlePrefetchFixture("unlit-raster", 10, {
      material: { unlit: true },
      receivesMapStyleTexture: true,
    });
    await fixture.start();
    await expect(fixture.runtime.ready).resolves.toBe(true);
    const materials: unknown[] = [];
    fixture.runtime.root.traverse((object) => {
      if (object instanceof Mesh) materials.push(object.material);
    });
    expect(
      materials.some((material) => material instanceof MeshBasicMaterial)
    ).toBe(true);
    expect(
      materials.some((material) => material instanceof MeshLambertMaterial)
    ).toBe(false);
    fixture.runtime.setGroundVisible(false);
    expect(fixture.runtime.providesTerrain).toBe(false);
    fixture.runtime.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      expect(object.visible).toBe(false);
      expect(object.castShadow).toBe(false);
      expect(object.receiveShadow).toBe(false);
      const receivesStyle = fixture.runtime.receivesMapStyleTexture;
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const objectMaterial of objectMaterials)
        expect(
          typeof receivesStyle === "function" && receivesStyle(objectMaterial)
        ).toBe(false);
    });
    expect(fixture.runtime.getElevation(7.1, 51.2)).toBe(100);
    expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    fixture.runtime.setGroundVisible(true);
    expect(fixture.runtime.providesTerrain).toBe(true);
    fixture.runtime.root.traverse((object) => {
      if (object instanceof Mesh) expect(object.visible).toBe(true);
    });
    expect(fixture.runtime.mapStyleProjectionBlend).toBe("replace");
    fixture.runtime.dispose();
  });

  it("dispatches registered height batches to the source and retains no-data masking and persistent fallback", async () => {
    const fixture = createIdlePrefetchFixture("registered-height-batch", 10, {
      noDataHeightMeters: -999,
      groundVisible: false,
    });
    const scalar = vi.fn(
      (_longitude: number, _latitude: number): number | undefined => undefined
    );
    Object.defineProperty(fixture.source, "sampleHeight", {
      value: scalar,
      configurable: true,
    });
    const sourceBatch = vi.fn(
      (_coordinates: Float64Array, output: Float64Array) => {
        output.set([123, -999, NaN, NaN]);
        return output;
      }
    );
    Object.defineProperty(fixture.source, "sampleHeights", {
      value: sourceBatch,
      configurable: true,
    });
    await fixture.start();
    await expect(fixture.runtime.ready).resolves.toBe(true);
    const registered = registerSharedThreeTerrainSampler.mock.calls.find(
      ([, id]) => id === fixture.runtime.id
    )?.[2] as ((longitude: number, latitude: number) => number | undefined) & {
      sampleHeights(
        coordinates: Float64Array,
        output?: Float64Array
      ): Float64Array;
    };
    expect(typeof registered.sampleHeights).toBe("function");
    const coordinates = new Float64Array([
      7.1,
      51.2,
      7.1,
      51.2,
      NaN,
      51.2,
      7.1,
      51.2,
    ]);
    const output = new Float64Array(4);
    expect(registered.sampleHeights(coordinates, output)).toBe(output);
    expect(sourceBatch).toHaveBeenCalledOnce();
    expect(sourceBatch).toHaveBeenCalledWith(coordinates, output);
    expect(output[0]).toBe(123);
    expect(Number.isNaN(output[1])).toBe(true);
    expect(Number.isNaN(output[2])).toBe(true);
    expect(output[3]).toBe(100);
    expect(scalar).toHaveBeenCalledOnce();
    expect(scalar).toHaveBeenCalledWith(7.1, 51.2);
    // A cached rendered cut remains a height source even without raster pixels.
    Reflect.deleteProperty(fixture.source, "sampleHeights");
    expect(registered.sampleHeights(coordinates, output)).toBe(output);
    expect([...output]).toEqual([100, 100, NaN, 100]);
    expect(sourceBatch).toHaveBeenCalledOnce();
    expect(fixture.runtime.providesTerrain).toBe(false);
    fixture.runtime.dispose();
  });

  it.each([true, false])(
    "retains the terrain mesh and height source with initial ground visibility %s",
    async (groundVisible) => {
      const tileId = { level: 10, x: 532, y: 218 };
      const sunTileId = { level: 10, x: 533, y: 218 };
      const source = {
        requestTile: vi.fn(async (id) => ({
          id,
          bounds:
            id.x === sunTileId.x
              ? { west: 7.4, south: 51, east: 7.5, north: 51.3 }
              : { west: 7, south: 51, east: 7.2, north: 51.3 },
          u: new Float32Array([0, 0, 1, 1]),
          v: new Float32Array([0, 1, 0, 1]),
          heightMeters: new Float32Array([100, 100, 100, 100]),
          indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
          minimumHeightMeters: 100,
          maximumHeightMeters: 100,
          geometricErrorMeters: 0.01,
          byteLength: 256,
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
        release: vi.fn(),
      };
      acquireRasterDemTerrainTileSource.mockResolvedValue(source);
      const onContentChanged = vi.fn();
      const onError = vi.fn();
      const runtime = buildRasterDemTerrainRuntime(
        "terrain",
        terrainConfig("https://example.test/terrain"),
        [7.15, 51.256],
        {
          minimumLevel: 10,
          maximumLevel: 10,
          shadowLevelOffset: 0,
          onContentChanged,
          onError,
          receivesMapStyleTexture: true,
          groundVisible,
          boundsPaddingMeters: [5_000, 0, 0],
        }
      );
      const map = {
        getCanvas: () => ({ clientWidth: 1_000, clientHeight: 1_000 }),
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
      });

      const ready = await runtime.ready;
      expect(
        onError.mock.calls.map(([error]) => error?.stack ?? String(error))
      ).toEqual([]);
      expect(ready).toBe(true);
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
      // Hidden DEM stays available for height queries without affecting mesh shadows.
      expect(mesh.castShadow).toBe(groundVisible);
      expect(mesh.receiveShadow).toBe(groundVisible);
      expect(mesh.material).toBeInstanceOf(MeshLambertMaterial);
      expect(mesh.material.side).toBe(FrontSide);
      expect(mesh.material.shadowSide).toBe(FrontSide);
      // Standard depth pass: acne control lives in the light's texel-scaled
      // normal bias, not in a per-mesh depth material.
      expect(mesh.customDepthMaterial).toBeUndefined();
      expect(mesh.geometry.getAttribute("position").count).toBe(4);
      expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
        tileId
      );
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
      const publishedBounds = onContentChanged.mock.calls[0][0];
      expect(publishedBounds).toHaveLength(1);
      expect(publishedBounds[0].min.toArray()).toEqual(debugVolumes[0].minimum);
      expect(publishedBounds[0].max.toArray()).toEqual(debugVolumes[0].maximum);

      const receiverCamera = new OrthographicCamera(
        -20_000,
        20_000,
        20_000,
        -20_000,
        1,
        50_000
      );
      receiverCamera.position.set(0, 20_000, 0);
      receiverCamera.lookAt(0, 0, 0);
      receiverCamera.updateMatrixWorld(true);
      runtime.update({ ...frame, renderCamera: receiverCamera });
      const receiverMaterial = mesh.material as MeshLambertMaterial;
      expect(receiverMaterial).toMatchObject({
        colorWrite: groundVisible,
        depthTest: true,
        depthWrite: groundVisible,
        transparent: !groundVisible,
        opacity: groundVisible ? 1 : 0,
      });
      expect(runtime.mapStyleProjectionBlend).toBe("replace");
      expect(mesh.visible).toBe(groundVisible);
      expect(mesh.castShadow).toBe(groundVisible);
      expect(runtime.providesTerrain).toBe(groundVisible);
      const geometryBeforeStyleChange = mesh.geometry;
      const requestsBeforeStyleChange = source.requestTile.mock.calls.length;
      const changesBeforeStyleChange = onContentChanged.mock.calls.length;
      const originalProjectionVersion = runtime.mapStyleProjectionVersion!();
      runtime.setGroundVisible(!groundVisible);
      expect(runtime.mapStyleProjectionVersion!()).toBe(
        originalProjectionVersion + 1
      );
      runtime.setGroundVisible(!groundVisible);
      expect(runtime.mapStyleProjectionVersion!()).toBe(
        originalProjectionVersion + 1
      );
      runtime.setGroundVisible(false);
      expect(receiverMaterial).toMatchObject({
        colorWrite: false,
        depthTest: true,
        depthWrite: false,
        transparent: true,
        opacity: 0,
      });
      expect(mesh.visible).toBe(false);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(runtime.providesTerrain).toBe(false);
      expect(runtime.getElevation(7.1, 51.2)).toBe(150);
      expect(runtime.getPublishedTerrainTiles()[0].mesh).toBe(mesh);
      expect(mesh.geometry).toBe(geometryBeforeStyleChange);
      expect(source.requestTile).toHaveBeenCalledTimes(
        requestsBeforeStyleChange
      );
      expect(acquireRasterDemTerrainTileSource).toHaveBeenCalledOnce();
      expect(onContentChanged).toHaveBeenCalledTimes(changesBeforeStyleChange);
      runtime.setGroundVisible(true);
      expect(receiverMaterial).toMatchObject({
        colorWrite: true,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        opacity: 1,
      });
      expect(runtime.mapStyleProjectionBlend).toBe("replace");
      expect(mesh.visible).toBe(true);
      expect(mesh.castShadow).toBe(true);
      expect(runtime.providesTerrain).toBe(true);

      expect(mesh.receiveShadow).toBe(true);
      const receivesStyle = runtime.receivesMapStyleTexture;
      expect(
        typeof receivesStyle === "function" && receivesStyle(receiverMaterial)
      ).toBe(true);
      expect(runtime.getActiveTileVolumes()[0].loadReason).toBe("viewport");

      const offscreenCamera = receiverCamera.clone();
      offscreenCamera.position.x += 4_000;
      offscreenCamera.updateMatrixWorld(true);
      runtime.update({ ...frame, renderCamera: offscreenCamera });
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.material).toBe(receiverMaterial);
      expect(runtime.getActiveTileVolumes()[0].loadReason).toBe("viewport");

      offscreenCamera.position.x += 200_000;
      offscreenCamera.updateMatrixWorld(true);
      runtime.update({ ...frame, renderCamera: offscreenCamera });
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.castShadow).toBe(true);
      expect(tileNode.visible).toBe(true);
      expect(mesh.material).not.toBe(receiverMaterial);
      expect(
        typeof receivesStyle === "function" && receivesStyle(mesh.material)
      ).toBe(false);
      expect(mesh.material).toMatchObject({
        colorWrite: false,
        depthWrite: false,
        isMeshBasicMaterial: true,
      });
      expect(runtime.getActiveTileVolumes()[0].loadReason).toBe("shadow");

      const copyFramebufferToTexture = vi.fn();
      const projection = createSharedThreeMapStyleProjection(
        "terrain-style",
        new Map([[runtime.id, runtime]]),
        frame.viewport
      );
      projection.attach(
        { ...map, on: vi.fn(), off: vi.fn() } as never,
        { copyFramebufferToTexture } as never
      );
      const clipMatrix = new Matrix4();
      projection.capture(clipMatrix, false);
      expect(projection.getState(0).enabled).toBe(false);
      expect(copyFramebufferToTexture).not.toHaveBeenCalled();

      // A sliver of the bounds is enough: neither the tile center nor its old
      // asynchronous selection reason may keep a visible tile caster-only.
      const edgeCamera = receiverCamera.clone();
      edgeCamera.position.x = publishedBounds[0].max.x + edgeCamera.right - 1;
      edgeCamera.updateMatrixWorld(true);
      clipMatrix.multiplyMatrices(
        edgeCamera.projectionMatrix,
        edgeCamera.matrixWorldInverse
      );
      const edgeFrustum = new Frustum().setFromProjectionMatrix(clipMatrix);
      expect(edgeFrustum.intersectsBox(publishedBounds[0])).toBe(true);
      expect(
        edgeFrustum.containsPoint(publishedBounds[0].getCenter(new Vector3()))
      ).toBe(false);
      const casterVersion = runtime.mapStyleProjectionVersion?.();
      runtime.update({ ...frame, renderCamera: edgeCamera });
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.material).toBe(receiverMaterial);
      expect(runtime.mapStyleProjectionVersion?.()).toBeGreaterThan(
        casterVersion!
      );
      expect(runtime.getActiveTileVolumes()[0].loadReason).toBe("viewport");
      projection.capture(clipMatrix, false);
      expect(projection.getState(1).enabled).toBe(true);
      expect(copyFramebufferToTexture).toHaveBeenCalledOnce();
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <project_vertex>",
        fragmentShader: "#include <common>\n#include <map_fragment>",
      };
      receiverMaterial.onBeforeCompile(shader as never, {} as never);
      expect(shader.uniforms).toMatchObject({
        carmaMapStyleTexture: {
          value: copyFramebufferToTexture.mock.calls[0][0],
        },
        carmaMapStyleEnabled: { value: 1 },
      });
      projection.dispose();

      runtime.update({ ...frame, renderCamera: receiverCamera });
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.material).toBe(receiverMaterial);

      const shadowCamera = new OrthographicCamera(
        -1_000,
        1_000,
        1_000,
        -1_000,
        1,
        40_000
      );
      shadowCamera.position.set(20_000, 1_000, 0);
      // The eastern tile must lie sunward of the visible receiver, not merely
      // inside a disconnected, vertically illuminated shadow-camera frustum.
      shadowCamera.lookAt(0, 0, 0);
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
      });
      await vi.waitFor(() => {
        expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual(
          sunTileId
        );
        expect(runtime.root.children).toHaveLength(2);
      });
      runtime.update(frame);
      expect(onContentChanged).toHaveBeenCalledTimes(2);
      const nextPublishedBounds = onContentChanged.mock.calls[1][0];
      expect(nextPublishedBounds.length).toBeGreaterThan(0);
      expect(
        nextPublishedBounds.every((bounds: Box3) => !bounds.isEmpty())
      ).toBe(true);
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
      // The shared vertex includes two flat faces and one sloped face.
      expect(viewportNormal.getX(2)).toBeCloseTo(-1 / Math.sqrt(10));
      expect(viewportNormal.getY(2)).toBeCloseTo(3 / Math.sqrt(10));
      expect(occluderNormal.getX(0)).toBe(viewportNormal.getX(2));
      expect(occluderNormal.getY(0)).toBe(viewportNormal.getY(2));

      runtime.dispose();
      expect(runtime.root.children).toHaveLength(0);
    }
  );
});
