import type { Map as MaplibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { acquireMapLibreTerrainDemBoundary } from "./maplibre-terrain-dem-boundary";

const EXTENT = 8192;
const fixture = () => {
  const matrix = new Float64Array(16);
  matrix[0] = matrix[5] = 1 / EXTENT;
  matrix[15] = 1;
  const dem = {
    dim: 512,
    get: vi.fn((x: number, y: number) => {
      if (x < -1 || x > 512 || y < -1 || y > 512)
        throw new RangeError(`DEM ${x},${y}`);
      return 50 + x * 0.37 + y * 0.123;
    }),
  };
  const tileID = {
    normalizeCoordinates(x: number, y: number, _extent: number) {
      return { tileID: this, x, y };
    },
  };
  type TileID = typeof tileID;
  class Terrain {
    getTerrainData = vi.fn(() => ({ tile: { dem }, u_terrain_matrix: matrix }));
    getDEMElevation(id: TileID, x: number, y: number, extent = EXTENT): number {
      const normalized = id.normalizeCoordinates(x, y, extent);
      const data = this.getTerrainData();
      const px = (normalized.x / extent) * EXTENT;
      const py = (normalized.y / extent) * EXTENT;
      const a =
        (data.u_terrain_matrix[0] * px +
          data.u_terrain_matrix[4] * py +
          data.u_terrain_matrix[12]) *
        dem.dim;
      const b =
        (data.u_terrain_matrix[1] * px +
          data.u_terrain_matrix[5] * py +
          data.u_terrain_matrix[13]) *
        dem.dim;
      const cx = Math.floor(a),
        cy = Math.floor(b),
        tx = a - cx,
        ty = b - cy;
      return (
        dem.get(cx, cy) * (1 - tx) * (1 - ty) +
        dem.get(cx + 1, cy) * tx * (1 - ty) +
        dem.get(cx, cy + 1) * (1 - tx) * ty +
        dem.get(cx + 1, cy + 1) * tx * ty
      );
    }
  }
  const terrain = new Terrain();
  const listeners = new Map<string, Set<() => void>>();
  const host = {
    terrain: terrain as Terrain | null,
    on: vi.fn((event: string, callback: () => void) => {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(callback);
    }),
    off: vi.fn((event: string, callback: () => void) =>
      listeners.get(event)?.delete(callback)
    ),
  };
  const fire = (event: string) =>
    [...(listeners.get(event) ?? [])].forEach((fn) => fn());
  return {
    map: host as unknown as MaplibreMap,
    host,
    terrain,
    Terrain,
    tileID,
    matrix,
    dem,
    fire,
    listeners,
  };
};

describe("MapLibre DEM bilinear boundary binding", () => {
  it("keeps a normalized parent endpoint whose UV rounds to 1 on the stored border", () => {
    const f = fixture();
    f.matrix[0] = f.matrix[5] = 1 / (EXTENT * 2);
    f.matrix[13] = 0.5;
    const y = 8191.999999999999;
    expect(y).toBeLessThan(EXTENT);
    expect(y * f.matrix[5] + f.matrix[13]).toBe(1);
    const original = f.terrain.getDEMElevation;
    expect(() => original.call(f.terrain, f.tileID, 512, y)).toThrow(
      "DEM 16,513"
    );
    const release = acquireMapLibreTerrainDemBoundary(f.map);
    f.dem.get.mockClear();
    expect(f.terrain.getDEMElevation(f.tileID, 512, y)).toBe(
      f.dem.get(16, 512)
    );
    expect(
      f.dem.get.mock.calls.every(([x, row]) => x <= 512 && row <= 512)
    ).toBe(true);
    release();
    expect(f.terrain.getDEMElevation).toBe(original);
    expect(
      Object.prototype.hasOwnProperty.call(f.terrain, "getDEMElevation")
    ).toBe(false);
  });

  it.each([
    [0, 0],
    [1.37, 300.19],
    [511.999, 511.999],
    [-0.5, 200.123],
    [-1, -1],
  ])("retains bit-identical interior interpolation at DEM %s,%s", (x, y) => {
    const f = fixture();
    const expected = f.terrain.getDEMElevation(f.tileID, x * 16, y * 16);
    const release = acquireMapLibreTerrainDemBoundary(f.map);
    expect(f.terrain.getDEMElevation(f.tileID, x * 16, y * 16)).toBe(expected);
    release();
  });

  it.each([
    [512, 17.5],
    [12.25, 512],
    [512, 512],
  ])("uses the inclusive border for valid upper endpoint %s,%s", (x, y) => {
    const f = fixture();
    const release = acquireMapLibreTerrainDemBoundary(f.map);
    expect(f.terrain.getDEMElevation(f.tileID, x * 16, y * 16)).toBeCloseTo(
      50 + x * 0.37 + y * 0.123,
      12
    );
    expect(
      f.dem.get.mock.calls.every(([col, row]) => col <= 512 && row <= 512)
    ).toBe(true);
    release();
  });

  it.each([
    [512.01, 1],
    [1, 512.01],
    [-1.01, 1],
    [1, -1.01],
  ])("does not clamp or swallow invalid coordinate %s,%s", (x, y) => {
    const f = fixture();
    const original = vi.fn(f.terrain.getDEMElevation);
    f.terrain.getDEMElevation = original;
    const release = acquireMapLibreTerrainDemBoundary(f.map);
    expect(() => f.terrain.getDEMElevation(f.tileID, x * 16, y * 16)).toThrow(
      RangeError
    );
    expect(original).toHaveBeenCalledOnce();
    release();
    expect(f.terrain.getDEMElevation).toBe(original);
  });

  it("restores each terrain and retains the binding until the last owner releases", () => {
    const f = fixture();
    const original = f.terrain.getDEMElevation;
    const a = acquireMapLibreTerrainDemBoundary(f.map);
    const firstWrapper = f.terrain.getDEMElevation;
    const b = acquireMapLibreTerrainDemBoundary(f.map);
    expect(f.terrain.getDEMElevation).toBe(firstWrapper);
    const replacement = new f.Terrain();
    f.host.terrain = replacement;
    f.fire("terrain");
    expect(f.terrain.getDEMElevation).toBe(original);
    expect(replacement.getDEMElevation).not.toBe(original);
    const secondWrapper = replacement.getDEMElevation;
    a();
    a();
    expect(replacement.getDEMElevation).toBe(secondWrapper);
    b();
    expect(replacement.getDEMElevation).toBe(original);
    expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("does not overwrite a subsequent plugin's method on style events or release", () => {
    const f = fixture();
    const release = acquireMapLibreTerrainDemBoundary(f.map);
    const plugin = vi.fn(() => 123);
    f.terrain.getDEMElevation = plugin;
    f.fire("styledata");
    expect(f.terrain.getDEMElevation).toBe(plugin);
    release();
    expect(f.terrain.getDEMElevation).toBe(plugin);
  });

  it("waits for terrain, binds synchronously on recreation, and restores on map removal", () => {
    const f = fixture();
    const original = f.terrain.getDEMElevation;
    f.host.terrain = null;
    const release = acquireMapLibreTerrainDemBoundary(f.map);
    f.host.terrain = f.terrain;
    f.fire("terrain");
    expect(f.terrain.getDEMElevation).not.toBe(original);
    f.fire("remove");
    expect(f.terrain.getDEMElevation).toBe(original);
    release();
    expect([...f.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("leaves unsupported or non-writable terrain capabilities alone", () => {
    const f = fixture();
    const original = f.terrain.getDEMElevation;
    Object.defineProperty(f.terrain, "getDEMElevation", {
      value: original,
      writable: false,
    });
    const release = acquireMapLibreTerrainDemBoundary(f.map);
    expect(f.terrain.getDEMElevation).toBe(original);
    f.host.terrain = { getDEMElevation: original } as InstanceType<
      typeof f.Terrain
    >;
    f.fire("style.load");
    expect(f.host.terrain.getDEMElevation).toBe(original);
    release();
  });
});
