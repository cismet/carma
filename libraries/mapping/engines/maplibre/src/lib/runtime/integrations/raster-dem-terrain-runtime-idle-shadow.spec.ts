import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Group,
  Mesh,
  OrthographicCamera,
  MeshLambertMaterial,
  Vector2,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { TERRAIN_IDLE_SHADOW_REASON } from "../../core/terrain-idle-prefetch";
import {
  createProjectedTerrainTileGeometry,
  notifySharedThreeTerrainChanged,
  setSharedThreeTerrainLoading,
  createIdlePrefetchFixture,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

describe("buildRasterDemTerrainRuntime idle shadow work", () => {
  installRasterDemTerrainRuntimeFixture();

  it("does not prefetch before the complete foreground cut is published", async () => {
    const { runtime, source, makeTile, start } =
      createIdlePrefetchFixture("coverage-first");
    let finishTile: (() => void) | undefined;
    source.requestTile.mockImplementationOnce(
      (id) =>
        new Promise((resolve) => {
          finishTile = () => resolve(makeTile(id));
        })
    );
    expect(runtime.getIdlePrefetchAvailability()).toEqual({
      ready: false,
      remaining: 0,
    });
    await start();
    await vi.waitFor(() => expect(finishTile).toBeDefined());
    expect(await runtime.prefetchIdleTerrain()).toMatchObject({
      prepared: 0,
      remaining: 0,
    });
    expect(source.requestTile).toHaveBeenCalledTimes(1);
    finishTile!();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability()).toEqual({
        ready: true,
        remaining: 8,
      })
    );
    runtime.dispose();
  });

  it("warms one bounded neighbour ring without retaining or publishing meshes", async () => {
    const { runtime, source, map, frame, start, onContentChanged } =
      createIdlePrefetchFixture("warm-ring");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    runtime.update(frame);
    const nodes = [...runtime.root.children];
    const volumes = runtime.getActiveTileVolumes();
    const projectionVersion = runtime.mapStyleProjectionVersion?.();
    onContentChanged.mockClear();
    map.triggerRepaint.mockClear();
    setSharedThreeTerrainLoading.mockClear();
    notifySharedThreeTerrainChanged.mockClear();

    expect(await runtime.prefetchIdleTerrain()).toEqual({
      prepared: 8,
      failed: 0,
      remaining: 0,
      aborted: false,
    });
    runtime.update(frame);
    expect(runtime.root.children).toEqual(nodes);
    expect(runtime.root.children.every((node) => node.visible)).toBe(true);
    expect(runtime.getActiveTileVolumes()).toEqual(volumes);
    expect(runtime.mapStyleProjectionVersion?.()).toBe(projectionVersion);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(map.triggerRepaint).not.toHaveBeenCalled();
    expect(setSharedThreeTerrainLoading).not.toHaveBeenCalled();
    expect(notifySharedThreeTerrainChanged).not.toHaveBeenCalled();
    expect(source.requestTile).toHaveBeenCalledTimes(9);
    expect(
      source.requestTile.mock.calls.slice(1).every(([id]) => id.level === 9)
    ).toBe(true);
    expect(await runtime.prefetchIdleTerrain()).toEqual({
      prepared: 0,
      failed: 0,
      remaining: 0,
      aborted: false,
    });
    expect(source.requestTile).toHaveBeenCalledTimes(9);
    runtime.dispose();
  });

  it.each(["signal", "movement", "view", "shadow", "dispose"] as const)(
    "cancels its idle source waiter on %s and ignores late replies",
    async (reason) => {
      const { runtime, source, makeTile, start, frame, listeners } =
        createIdlePrefetchFixture(`abort-${reason}`);
      await start();
      await vi.waitFor(() =>
        expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
      );
      let finishTile: (() => void) | undefined;
      source.requestTile.mockImplementationOnce(
        (id) =>
          new Promise((resolve) => {
            finishTile = () => resolve(makeTile(id));
          })
      );
      const controller = new AbortController();
      const work = runtime.prefetchIdleTerrain(controller.signal);
      await vi.waitFor(() => expect(finishTile).toBeDefined());
      expect(source.requestTile).toHaveBeenCalledTimes(2);
      if (reason === "signal") controller.abort();
      else if (reason === "movement") listeners.get("movestart")!();
      else if (reason === "view")
        runtime.update({ ...frame, viewport: new Vector2(900, 900) });
      else if (reason === "shadow")
        runtime.setShadowView({
          camera: new OrthographicCamera(-10, 10, 10, -10, 1, 100),
          shadowMapSize: { width: 64, height: 64 },
        });
      else runtime.dispose();
      finishTile!();
      expect(await work).toMatchObject({
        prepared: 0,
        failed: 0,
        aborted: true,
      });
      expect(source.requestTile).toHaveBeenCalledTimes(2);
      expect(source.requestTile.mock.calls[1][1]).toBeInstanceOf(AbortSignal);
      expect(source.requestTile.mock.calls[1][1]?.aborted).toBe(true);
      runtime.dispose();
    }
  );

  it("keeps speculative failures out of foreground loading and error UI", async () => {
    const { runtime, source, start, onError } =
      createIdlePrefetchFixture("warm-failure");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    source.requestTile.mockRejectedValueOnce(new Error("prefetch unavailable"));
    setSharedThreeTerrainLoading.mockClear();
    expect(await runtime.prefetchIdleTerrain()).toMatchObject({
      prepared: 0,
      failed: 1,
      aborted: false,
    });
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(setSharedThreeTerrainLoading).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("offers stable shadow regions after cache warming without publishing a coarse cut", async () => {
    const { runtime, start } = createIdlePrefetchFixture("shadow-regions");
    expect(runtime.getIdleShadowRegions()).toEqual([]);
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const before = runtime.getIdleShadowRegions();
    expect(before).toHaveLength(8);
    expect(before.every(({ terrainLevel }) => terrainLevel === 9)).toBe(true);
    await runtime.prefetchIdleTerrain();
    const after = runtime.getIdleShadowRegions();
    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
    expect(
      after.every(
        ({ receiverBounds }, index) =>
          receiverBounds.getSize(new Vector3()).y <
          before[index].receiverBounds.getSize(new Vector3()).y
      )
    ).toBe(true);
    after[0].receiverBounds.makeEmpty();
    expect(runtime.getIdleShadowRegions()[0].receiverBounds.isEmpty()).toBe(
      false
    );
    runtime.dispose();
    expect(runtime.getIdleShadowRegions()).toEqual([]);
  });

  it("leases detached depth-only geometry and owns its disposal, never the live material", async () => {
    const { runtime, source, start, frame, map, onContentChanged } =
      createIdlePrefetchFixture("shadow-lease");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    runtime.update(frame);
    const candidate = runtime.getIdleShadowRegions()[0];
    const nodes = [...runtime.root.children];
    const volumes = runtime.getActiveTileVolumes();
    const projectionVersion = runtime.mapStyleProjectionVersion?.();
    onContentChanged.mockClear();
    setSharedThreeTerrainLoading.mockClear();
    notifySharedThreeTerrainChanged.mockClear();
    map.triggerRepaint.mockClear();
    const casterBounds = candidate.receiverBounds.clone();
    const lease = await runtime.prepareIdleShadowRegion({
      ...candidate,
      casterBounds,
    });
    expect(lease.covered).toBe(true);
    expect(lease.isCurrent()).toBe(true);
    expect(lease.group?.parent).toBeNull();
    expect(lease.group?.children).toHaveLength(1);
    const mesh = lease.group!.children[0] as Mesh;
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(false);
    expect(lease.dependencyBounds).toEqual([casterBounds]);
    casterBounds.makeEmpty();
    expect(lease.dependencyBounds[0].isEmpty()).toBe(false);
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(false);
    const second = await runtime.prepareIdleShadowRegion({
      ...candidate,
      casterBounds: candidate.receiverBounds.clone(),
    });
    expect(second.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.unavailable);
    expect(source.requestTile).toHaveBeenCalledTimes(2);
    expect(runtime.root.children).toEqual(nodes);
    expect(runtime.getActiveTileVolumes()).toEqual(volumes);
    expect(runtime.mapStyleProjectionVersion?.()).toBe(projectionVersion);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(setSharedThreeTerrainLoading).not.toHaveBeenCalled();
    expect(notifySharedThreeTerrainChanged).not.toHaveBeenCalled();
    expect(map.triggerRepaint).not.toHaveBeenCalled();
    const disposeGeometry = vi.spyOn(mesh.geometry, "dispose");
    const disposeMaterial = vi.spyOn(
      mesh.material as MeshLambertMaterial,
      "dispose"
    );
    const temporaryHost = new Group();
    temporaryHost.add(lease.group!);
    lease.dispose();
    lease.dispose();
    expect(temporaryHost.children).toHaveLength(0);
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    expect(disposeMaterial).not.toHaveBeenCalled();
    expect(lease.covered).toBe(false);
    expect(lease.group).toBeNull();
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(true);
    runtime.dispose();
  });

  it("keeps resident neighbour tiles eligible for shadows when revisiting a settled view", async () => {
    const { runtime, source, start, frame } =
      createIdlePrefetchFixture("shadow-revisit");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const originalRegions = runtime.getIdleShadowRegions().map(({ id }) => id);
    const [level, x, y] = originalRegions[0].split("/").map(Number);
    // A real camera and negligible error keep the visited neighbour at its
    // intended coarse LOD; the generic fixture's fov-less Camera refines it.
    const revisitFrame = { ...frame, renderCamera: frame.lodCamera };
    source.getLevelMaximumGeometricError.mockReturnValue(0.000001);
    source.getTileGridIdsForBounds.mockReturnValue([{ level, x, y }]);
    runtime.update({ ...revisitFrame, viewport: new Vector2(900, 900) });
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    source.getTileGridIdsForBounds.mockReturnValue([
      { level: 10, x: 532, y: 218 },
    ]);
    expect(source.requestTile.mock.calls.map(([id]) => id)).toContainEqual({
      level,
      x,
      y,
    });
    runtime.update({ ...revisitFrame, viewport: new Vector2(800, 800) });
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    expect(runtime.getIdleShadowRegions().map(({ id }) => id)).toEqual(
      originalRegions
    );
    // Cache warming skips the resident neighbour; shadow-region planning does not.
    expect(runtime.getIdlePrefetchAvailability().remaining).toBe(7);
    runtime.dispose();
  });

  it.each(["signal", "movement", "view", "shadow", "dispose"] as const)(
    "cancels a shadow lease source waiter on %s and ignores late replies",
    async (reason) => {
      const { runtime, source, makeTile, start, listeners, frame } =
        createIdlePrefetchFixture(`shadow-lease-abort-${reason}`);
      await start();
      await vi.waitFor(() =>
        expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
      );
      const candidate = runtime.getIdleShadowRegions()[0];
      const region = {
        ...candidate,
        casterBounds: candidate.receiverBounds.clone(),
      };
      let finishTile: (() => void) | undefined;
      source.requestTile.mockImplementationOnce(
        (id) =>
          new Promise((resolve) => {
            finishTile = () => resolve(makeTile(id));
          })
      );
      const controller = new AbortController();
      const work = runtime.prepareIdleShadowRegion(region, controller.signal);
      await vi.waitFor(() => expect(finishTile).toBeDefined());
      if (reason === "signal") controller.abort();
      else if (reason === "movement") listeners.get("movestart")!();
      else if (reason === "view")
        runtime.update({ ...frame, viewport: new Vector2(900, 900) });
      else if (reason === "shadow")
        runtime.setShadowView({
          camera: new OrthographicCamera(-10, 10, 10, -10, 1, 100),
          shadowMapSize: { width: 64, height: 64 },
        });
      else runtime.dispose();
      expect((await runtime.prepareIdleShadowRegion(region)).covered).toBe(
        false
      );
      expect(source.requestTile).toHaveBeenCalledTimes(2);
      finishTile!();
      const lease = await work;
      expect(lease.covered).toBe(false);
      expect(lease.group).toBeNull();
      expect(lease.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.aborted);
      expect(source.requestTile.mock.calls[1][1]).toBeInstanceOf(AbortSignal);
      expect(source.requestTile.mock.calls[1][1]?.aborted).toBe(true);
      runtime.dispose();
    }
  );

  it("invalidates and disposes an already prepared lease on movement", async () => {
    const { runtime, start, listeners } =
      createIdlePrefetchFixture("ready-shadow-abort");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const candidate = runtime.getIdleShadowRegions()[0];
    const lease = await runtime.prepareIdleShadowRegion({
      ...candidate,
      casterBounds: candidate.receiverBounds.clone(),
    });
    expect(lease.covered).toBe(true);
    const disposeGeometry = vi.spyOn(
      (lease.group!.children[0] as Mesh).geometry,
      "dispose"
    );
    listeners.get("movestart")!();
    expect(lease.covered).toBe(false);
    expect(lease.isCurrent()).toBe(false);
    expect(lease.group).toBeNull();
    expect(disposeGeometry).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("refuses missing or invalid terrain without changing foreground UI", async () => {
    const { runtime, source, start, makeTile, onError } =
      createIdlePrefetchFixture("shadow-missing");
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const candidate = runtime.getIdleShadowRegions()[0];
    const region = {
      ...candidate,
      casterBounds: candidate.receiverBounds.clone(),
    };
    source.getTileDataAvailable.mockReturnValueOnce(false);
    expect((await runtime.prepareIdleShadowRegion(region)).reason).toBe(
      TERRAIN_IDLE_SHADOW_REASON.missing
    );
    expect(source.requestTile).toHaveBeenCalledTimes(1);
    source.requestTile.mockImplementationOnce(async (id) => {
      const tile = makeTile(id);
      tile.heightMeters[0] = NaN;
      return tile;
    });
    setSharedThreeTerrainLoading.mockClear();
    const lease = await runtime.prepareIdleShadowRegion(region);
    expect(lease.covered).toBe(false);
    expect(lease.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.missing);
    expect(lease.group).toBeNull();
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(true);
    expect(setSharedThreeTerrainLoading).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("counts a retained backing buffer, not only a small attribute view, against 32 MiB", async () => {
    const { runtime, start } = createIdlePrefetchFixture(
      "shadow-memory-budget"
    );
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const candidate = runtime.getIdleShadowRegions()[0];
    createProjectedTerrainTileGeometry.mockImplementationOnce(() => {
      const geometry = new BufferGeometry();
      const backing = new ArrayBuffer(33 * 1024 * 1024);
      const positions = new Float32Array(backing, 0, 12);
      positions.set([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1]);
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setIndex([0, 2, 1, 1, 2, 3]);
      geometry.computeVertexNormals();
      return geometry;
    });
    const lease = await runtime.prepareIdleShadowRegion({
      ...candidate,
      casterBounds: candidate.receiverBounds.clone(),
    });
    expect(lease.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.budget);
    expect(lease.covered).toBe(false);
    expect(lease.group).toBeNull();
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(true);
    runtime.dispose();
  });

  it("yields and observes cancellation while validating a restored-size height grid", async () => {
    const { runtime, source, start, makeTile } = createIdlePrefetchFixture(
      "shadow-validation-yield"
    );
    await start();
    await vi.waitFor(() =>
      expect(runtime.getIdlePrefetchAvailability().ready).toBe(true)
    );
    const candidate = runtime.getIdleShadowRegions()[0];
    const controller = new AbortController();
    const count = 129 * 129;
    source.requestTile.mockImplementationOnce(async (id) => ({
      ...makeTile(id),
      heightMeters: new Float32Array(count).fill(100),
    }));
    createProjectedTerrainTileGeometry.mockImplementationOnce(({ tile }) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array(count * 3), 3)
      );
      geometry.setAttribute(
        "normal",
        new BufferAttribute(new Float32Array(count * 3), 3)
      );
      geometry.setIndex(new BufferAttribute(tile.indices, 1));
      setTimeout(() => controller.abort(), 0);
      return geometry;
    });
    const lease = await runtime.prepareIdleShadowRegion(
      {
        ...candidate,
        casterBounds: candidate.receiverBounds.clone(),
      },
      controller.signal
    );
    expect(lease.reason).toBe(TERRAIN_IDLE_SHADOW_REASON.aborted);
    expect(lease.covered).toBe(false);
    expect(lease.group).toBeNull();
    expect(runtime.getIdlePrefetchAvailability().ready).toBe(true);
    runtime.dispose();
  });
});
