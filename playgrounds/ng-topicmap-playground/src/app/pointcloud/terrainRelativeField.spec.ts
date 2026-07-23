import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({
  MercatorCoordinate: {
    fromLngLat: vi.fn(),
  },
}));

import {
  decodeTerrainHeight,
  TERRAIN_DEM_ENCODINGS,
} from "./terrainRelativeField";

describe("terrain-relative point field", () => {
  it("decodes Mapbox Terrain-RGB heights", () => {
    expect(decodeTerrainHeight(1, 134, 160, TERRAIN_DEM_ENCODINGS.MAPBOX)).toBe(
      0
    );
    expect(
      decodeTerrainHeight(1, 139, 114, TERRAIN_DEM_ENCODINGS.MAPBOX)
    ).toBeCloseTo(123.4, 10);
  });

  it("decodes Terrarium heights", () => {
    expect(
      decodeTerrainHeight(128, 0, 0, TERRAIN_DEM_ENCODINGS.TERRARIUM)
    ).toBe(0);
    expect(
      decodeTerrainHeight(128, 1, 128, TERRAIN_DEM_ENCODINGS.TERRARIUM)
    ).toBe(1.5);
  });
});
