import { describe, expect, it } from "vitest";

import { TILES_LOAD_POLICY } from "./tile-load-config";
import {
  idleRingAllowedError,
  initialMeshLoadError,
  isExtentFloorTile,
  meshShadowStageError,
  resolveExtentGeometricError,
  tilesetMinResolutionGeometricError,
} from "./mesh-error-policy";

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

describe("meshShadowStageError", () => {
  it.each([
    [11.72, 1, 16],
    [13.15, 1, 16],
    [16, 1, 16],
    [1, 1, 1],
    [0.63, 0.5, 1],
    [0.49, 0.5, 0.5],
    [0, 1, 1],
    [33, 1, 64],
    [2.8, 3, 3],
  ])(
    "quantizes actual %s at target %s to shared stage %s",
    (actual, target, expected) => {
      expect(meshShadowStageError(actual, target)).toBe(expected);
    }
  );
  it("does not certify invalid error metrics", () => {
    expect(meshShadowStageError(Number.NaN, 1)).toBe(Infinity);
    expect(meshShadowStageError(Infinity, 1)).toBe(Infinity);
    expect(meshShadowStageError(1, 0)).toBe(Infinity);
  });
});

describe("initialMeshLoadError", () => {
  it("bootstraps coverage at 16 pixels without exceeding requested quality", () => {
    expect(initialMeshLoadError(0.25)).toBe(16);
    expect(initialMeshLoadError(32)).toBe(32);
  });
  it("admits the first complete image at the existing publication ceiling without changing later targets", () => {
    expect(initialMeshLoadError(6, 16, true)).toBe(64);
    expect(initialMeshLoadError(6, 16, false)).toBe(16);
    expect(initialMeshLoadError(96, 16, true)).toBe(96);
  });
  it("keeps configurable cold image errors separate from motion and idle", () => {
    expect(initialMeshLoadError(4, 24, true, 96)).toBe(96);
    expect(initialMeshLoadError(4, 24, false, 96)).toBe(24);
    expect(initialMeshLoadError(2, 12, true, 48)).toBe(48);
  });
});

describe("idleRingAllowedError", () => {
  it("keeps each outward band one level coarser than the visible target", () => {
    expect(idleRingAllowedError(20, 1, 0, 6)).toBe(40);
    expect(idleRingAllowedError(20, 2, 0, 6)).toBe(80);
    expect(idleRingAllowedError(20, 4, 0, 6)).toBe(320);
  });

  it("refines the anchor without collapsing the ring gradient", () => {
    expect(idleRingAllowedError(20, 3, 1, 6)).toBe(80);
    expect(idleRingAllowedError(20, 3, 2, 6)).toBe(48);
    expect(idleRingAllowedError(20, 3, 5, 6)).toBe(48);
    expect(idleRingAllowedError(20, 1, 5, 6)).toBe(12);
    expect(idleRingAllowedError(20, 2, 5, 6)).toBe(24);
  });
});

describe("extent floor", () => {
  const levels = [
    { level: 0, geometricError: 900, bytes: 1e6 },
    { level: 3, geometricError: 100, bytes: 16e6 },
    { level: 4, geometricError: 42, bytes: 21e6 },
    { level: 5, geometricError: 20, bytes: 52e6 },
    { level: 6, geometricError: 10, bytes: 220e6 },
  ];

  it("picks the deepest level whose resident bytes fit the memory share", () => {
    const share = TILES_LOAD_POLICY.extentMemoryShare;
    const resident = TILES_LOAD_POLICY.extentResidentBytesPerTransferByte;
    const throughLevel4 = (1e6 + 16e6 + 21e6) * resident;
    expect(resolveExtentGeometricError(levels, throughLevel4 / share)).toBe(42);
    expect(resolveExtentGeometricError(levels, 1e12)).toBe(10);
  });

  it("falls back above the entry hint when its resident floor cannot fit", () => {
    expect(resolveExtentGeometricError(levels, 1)).toBe(900);
    // 2024 mesh: the hinted L3 floor consumes more than this entire story cache.
    const meshLevels = [
      { level: 0, geometricError: 908.2, bytes: 17541680 },
      { level: 1, geometricError: 453.9, bytes: 7572336 },
      { level: 2, geometricError: 204.5, bytes: 12552584 },
      { level: 3, geometricError: 97.3, bytes: 15919395 },
    ];
    expect(resolveExtentGeometricError(meshLevels, 384 * MIB)).toBe(908.2);
    expect(resolveExtentGeometricError(meshLevels, 6 * GIB)).toBe(97.3);
  });

  it("classifies tiles at or above the floor level", () => {
    expect(isExtentFloorTile({ geometricError: 42 }, 42)).toBe(true);
    expect(isExtentFloorTile({ geometricError: 100 }, 42)).toBe(true);
    expect(isExtentFloorTile({ geometricError: 20 }, 42)).toBe(false);
    expect(isExtentFloorTile({ geometricError: 20 }, Infinity)).toBe(false);
  });
});

describe("residual resolution floor", () => {
  it("is the base error scaled by the extent's longest axis over the resolution", () => {
    // 12 km across 1024 px at 20 px base error: 234 m of geometric error.
    expect(tilesetMinResolutionGeometricError(20, 12_000, 1024)).toBeCloseTo(
      234.4,
      1
    );
    expect(tilesetMinResolutionGeometricError(20, Number.NaN, 1024)).toBe(0);
    expect(tilesetMinResolutionGeometricError(20, 12_000, 0)).toBe(0);
  });

  it("stops the floor at the first level finer than the residual error", () => {
    const levels = [
      { level: 3, geometricError: 100, bytes: 16e6 },
      { level: 4, geometricError: 42, bytes: 21e6 },
      { level: 5, geometricError: 20, bytes: 52e6 },
    ];
    expect(resolveExtentGeometricError(levels, 1e12, 30)).toBe(42);
    expect(resolveExtentGeometricError(levels, 1e12, 0)).toBe(20);
    expect(resolveExtentGeometricError([], 1e12, 30)).toBe(30);
  });
});
