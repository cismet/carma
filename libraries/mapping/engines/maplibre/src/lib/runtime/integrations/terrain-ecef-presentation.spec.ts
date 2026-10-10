import { MercatorCoordinate } from "maplibre-gl";
import { Box3, Group, Mesh, MeshLambertMaterial } from "three";
import { describe, expect, it, vi } from "vitest";

import { createProjectedTerrainTileGeometry } from "@carma-mapping/engines/three/primitives/core";

import type { TerrainTile } from "../../core/raster-dem-tile";
import { createTerrainEcefPresentation } from "./terrain-ecef-presentation";

import * as terrainWorkers from "./terrain-worker-client";

const fixture = (admitRetainedBytes?: (additionalBytes: number) => boolean) => {
  const origin = [7.1, 51.2] as const;
  const mercator = MercatorCoordinate.fromLngLat([...origin], 0);
  const scale = mercator.meterInMercatorCoordinateUnits();
  const edge = () => new Uint32Array();
  const tile: TerrainTile = {
    id: { level: 15, x: 17030, y: 10940 },
    bounds: { west: 7.1, east: 7.105, south: 51.2, north: 51.205 },
    u: new Float32Array([0, 1, 0, 1]),
    v: new Float32Array([0, 0, 1, 1]),
    heightMeters: new Float32Array([100, 105, 110, 115]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    westIndices: edge(),
    eastIndices: edge(),
    southIndices: edge(),
    northIndices: edge(),
    minimumHeightMeters: 100,
    maximumHeightMeters: 115,
    geometricErrorMeters: 1,
    byteLength: 0,
  };
  const geometry = createProjectedTerrainTileGeometry({
    tile,
    projectToWorld: (longitude, latitude, height, target) => {
      const point = MercatorCoordinate.fromLngLat(
        [longitude, latitude],
        height
      );
      return target.set(
        (point.x - mercator.x) / scale,
        point.z / scale,
        (point.y - mercator.y) / scale
      );
    },
  });
  const native = new Mesh(geometry, new MeshLambertMaterial());
  const parent = new Group();
  parent.add(native);
  const presentation = createTerrainEcefPresentation(
    origin,
    undefined,
    undefined,
    undefined,
    undefined,
    admitRetainedBytes
  );
  presentation.root.add(parent);
  return { native, parent, tile, presentation };
};

describe("terrain ECEF presentation ownership", () => {
  it("keeps old ECEF geometry on denial and retries only when capacity permits", async () => {
    let allowed = false;
    const admit = vi.fn(() => allowed);
    const { native, tile, presentation } = fixture(admit);
    const projected = presentation.mount(native, tile);
    const oldGeometry = projected.geometry;
    const disposed = vi.fn();
    oldGeometry.addEventListener("dispose", disposed);
    const worker = vi.spyOn(terrainWorkers, "runTerrainWorkerTask");
    try {
      const positions = native.geometry.getAttribute("position");
      positions.setY(0, positions.getY(0) + 2);
      positions.needsUpdate = true;
      await presentation.syncAsync(native);
      expect(projected.geometry).toBe(oldGeometry);
      expect(disposed).not.toHaveBeenCalled();
      expect(
        worker.mock.calls.filter(([task]) => task.kind === "project-ecef")
      ).toHaveLength(1);
      await presentation.syncAsync(native);
      await presentation.syncAsync(native);
      expect(
        worker.mock.calls.filter(([task]) => task.kind === "project-ecef")
      ).toHaveLength(1);
      allowed = true;
      await presentation.syncAsync(native);
      expect(projected.geometry).not.toBe(oldGeometry);
      expect(disposed).toHaveBeenCalledOnce();
      expect(
        worker.mock.calls.filter(([task]) => task.kind === "project-ecef")
      ).toHaveLength(2);
    } finally {
      worker.mockRestore();
      presentation.dispose();
      native.geometry.dispose();
    }
  });

  it("prepares worker buffers before publication with the same surface as synchronous mounting", async () => {
    const worker = fixture();
    const synchronous = fixture();
    const nativePositions = worker.native.geometry
      .getAttribute("position")
      .array.slice();
    const geometry = await worker.presentation.prepare(
      worker.native.geometry,
      worker.tile
    );
    expect(worker.native.parent).toBe(worker.parent);
    expect(worker.presentation.mesh(worker.native)).toBeUndefined();
    const derived = worker.presentation.mount(
      worker.native,
      worker.tile,
      geometry
    );
    const reference = synchronous.presentation.mount(
      synchronous.native,
      synchronous.tile
    );
    expect(derived.geometry).toBe(geometry);
    expect(geometry.getAttribute("position").array).toEqual(
      reference.geometry.getAttribute("position").array
    );
    expect(geometry.getAttribute("normal").array).toEqual(
      reference.geometry.getAttribute("normal").array
    );
    expect(geometry.index!.array).toEqual(reference.geometry.index!.array);
    expect(geometry.index!.array).toBe(worker.native.geometry.index!.array);
    expect(geometry.index).not.toBe(worker.native.geometry.index);
    expect(reference.geometry.index!.array).toBe(
      synchronous.native.geometry.index!.array
    );
    expect(worker.native.geometry.getAttribute("position").array).toEqual(
      nativePositions
    );
    worker.presentation.dispose();
    synchronous.presentation.dispose();
    worker.native.geometry.dispose();
    synchronous.native.geometry.dispose();
  });

  it("keeps corrected ECEF winding separate from reversed native topology", async () => {
    const { native, tile, presentation } = fixture();
    const index = native.geometry.index!;
    const b = index.getX(1);
    index.setX(1, index.getX(2));
    index.setX(2, b);
    index.needsUpdate = true;
    const before = index.array.slice();
    const geometry = await presentation.prepare(native.geometry, tile);
    expect(geometry.index!.array).not.toBe(index.array);
    expect(geometry.index!.array).not.toEqual(before);
    expect(index.array).toEqual(before);
    geometry.dispose();
    presentation.dispose();
    native.geometry.dispose();
  });

  it("rejects prepared geometry if the native surface changes before mounting", async () => {
    const { native, tile, parent, presentation } = fixture();
    const geometry = await presentation.prepare(native.geometry, tile);
    const position = native.geometry.getAttribute("position");
    position.setY(0, position.getY(0) + 1);
    position.needsUpdate = true;
    expect(() => presentation.mount(native, tile, geometry)).toThrow(
      /changed after/
    );
    expect(native.parent).toBe(parent);
    expect(presentation.mesh(native)).toBeUndefined();
    geometry.dispose();
    presentation.dispose();
    native.geometry.dispose();
  });

  it("keeps the displayed surface until the latest seam projection completes", async () => {
    const { native, tile, parent, presentation } = fixture();
    const original = native.geometry.getAttribute("position").array.slice();
    const projected = presentation.mount(native, tile);
    expect(native.parent).toBeNull();
    expect(projected.parent).toBe(parent);
    expect(native.geometry.getAttribute("position").array).toEqual(original);
    const oldGeometry = projected.geometry;
    const disposed = vi.fn();
    oldGeometry.addEventListener("dispose", disposed);
    const position = native.geometry.getAttribute("position");
    position.setY(0, position.getY(0) + 2);
    position.needsUpdate = true;
    const afterSeam = position.array.slice();
    presentation.sync(native);
    expect(projected.geometry).toBe(oldGeometry);
    expect(disposed).not.toHaveBeenCalled();
    await presentation.syncAsync(native);
    expect(projected.geometry).not.toBe(oldGeometry);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(position.array).toEqual(afterSeam);
    expect(presentation.ecefBounds(native, new Box3()).isEmpty()).toBe(false);
    presentation.detach(native);
    expect(native.parent).toBe(parent);
    expect(projected.parent).toBeNull();
    expect(presentation.mesh(native)).toBeUndefined();
    native.geometry.dispose();
  });

  it("counts retained CPU buffers and GPU attributes and disposes only owned geometry", () => {
    const { native, tile, presentation } = fixture();
    const projected = presentation.mount(native, tile);
    const attributes = [
      ...Object.values(projected.geometry.attributes),
      projected.geometry.index!,
    ];
    const buffers = new Set(
      attributes.map((attribute) => attribute.array.buffer)
    );
    const expected =
      tile.u.length * Float32Array.BYTES_PER_ELEMENT +
      [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) +
      attributes.reduce(
        (sum, attribute) => sum + attribute.array.byteLength,
        0
      );
    expect(presentation.bytes(native)).toBe(expected);
    expect(
      presentation.bytes(
        native,
        new Set([projected.geometry.index!.array.buffer])
      )
    ).toBe(expected - projected.geometry.index!.array.buffer.byteLength);
    expect(() => presentation.mount(native, tile)).toThrow(/already/);
    const nativeDisposed = vi.fn();
    const derivedDisposed = vi.fn();
    native.geometry.addEventListener("dispose", nativeDisposed);
    projected.geometry.addEventListener("dispose", derivedDisposed);
    presentation.dispose();
    presentation.dispose();
    expect(projected.parent).toBeNull();
    expect(derivedDisposed).toHaveBeenCalledTimes(1);
    expect(nativeDisposed).not.toHaveBeenCalled();
    expect(presentation.bytes(native)).toBe(0);
    native.geometry.dispose();
  });

  it("restores native ownership if projection rejects invalid geometry", () => {
    const { native, tile, parent, presentation } = fixture();
    native.geometry.getAttribute("position").setY(0, NaN);
    expect(() => presentation.mount(native, tile)).toThrow(/finite/);
    expect(native.parent).toBe(parent);
    expect(presentation.mesh(native)).toBeUndefined();
    expect(presentation.bytes(native)).toBe(0);
    native.geometry.dispose();
  });
});
