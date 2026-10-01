import { MercatorCoordinate } from "maplibre-gl";
import { Box3, Group, Mesh, MeshLambertMaterial } from "three";
import { describe, expect, it, vi } from "vitest";

import { createProjectedTerrainTileGeometry } from "@carma-mapping/engines/three/primitives/core";

import type { TerrainTile } from "../../core/raster-dem-tile";
import { createTerrainEcefPresentation } from "./terrain-ecef-presentation";

const fixture = () => {
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
  const presentation = createTerrainEcefPresentation(origin);
  presentation.root.add(parent);
  return { native, parent, tile, presentation };
};

describe("terrain ECEF presentation ownership", () => {
  it("updates derived geometry after a seam change without modifying the borrowed source", () => {
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
      native.geometry.getAttribute("position").array.byteLength +
      [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) +
      attributes.reduce(
        (sum, attribute) => sum + attribute.array.byteLength,
        0
      );
    expect(presentation.bytes(native)).toBe(expected);
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
