import { describe, expect, it, vi } from "vitest";
import { mesh } from "./mesh-tile-test-fixtures";
import {
  resolveTileRequestNeed,
  TILE_REQUEST_NEED,
  type TileRequestNeedContext,
} from "./tile-request-need";

const context = (
  changes: Partial<TileRequestNeedContext> = {}
): TileRequestNeedContext => ({
  coverageRecovery: false,
  extentFloorArmed: false,
  extentGeometricError: 40,
  motionPrefetch: false,
  zoomPrefetch: false,
  zooming: false,
  moving: false,
  providesTerrain: true,
  baseCoverageReady: true,
  mainViewConverged: true,
  effectiveErrorTarget: 6,
  requestedErrorTarget: 6,
  memoryErrorTarget: 6,
  idleRing: false,
  shadowSelection: false,
  shadowView: false,
  refinementSupport: new Set(),
  residentAncestors: new Set(),
  visibleTiles: new Set(),
  coverageNeeded: () => false,
  motionNeeded: () => false,
  inMainView: () => false,
  inPrefetchMargin: () => false,
  screenError: (tile) => tile.traversal.error,
  cameraDemand: () => ({ required: false, errorRatio: 0 }),
  shadowReceiverError: () => null,
  ...changes,
});

describe("resolveTileRequestNeed", () => {
  it.each([
    { requestedErrorTarget: 20, memoryErrorTarget: 4 },
    { requestedErrorTarget: 4, memoryErrorTarget: 20 },
    { requestedErrorTarget: 10, memoryErrorTarget: 10 },
  ])(
    "releases refinement when the parent meets the actual target %j",
    (targets) => {
      const parent = mesh(null, 10);
      const tile = mesh(parent, 1);
      const input = context({ ...targets, inMainView: () => true });
      expect(resolveTileRequestNeed(tile, input)).toBeNull();
      parent.refine = "ADD";
      expect(resolveTileRequestNeed(tile, input)).toBe(TILE_REQUEST_NEED.VIEW);
    }
  );

  it("keeps useful refinement based on final demand during a coarse admission stage", () => {
    const tile = mesh(mesh(null, 10), 2);
    expect(
      resolveTileRequestNeed(
        tile,
        context({ effectiveErrorTarget: 64, inMainView: () => true })
      )
    ).toBe(TILE_REQUEST_NEED.VIEW);
  });

  it.each([false, true])(
    "replacement support requires current viewport demand (%s)",
    (inView) => {
      const tile = mesh();
      expect(
        resolveTileRequestNeed(
          tile,
          context({
            refinementSupport: new Set([tile]),
            inMainView: () => inView,
          })
        )
      ).toBe(inView ? TILE_REQUEST_NEED.SUPPORT : null);
    }
  );

  it("retains the armed extent floor independently of old refinement support", () => {
    const floor = mesh();
    floor.geometricError = 40;
    const support = mesh();
    support.geometricError = 1;
    const input = context({
      extentFloorArmed: true,
      refinementSupport: new Set([support]),
    });
    expect(resolveTileRequestNeed(floor, input)).toBe(TILE_REQUEST_NEED.EXTENT);
    expect(resolveTileRequestNeed(support, input)).toBeNull();
  });

  it.each([false, true])(
    "admits idle reserve after convergence, ring=%s",
    (idleRing) => {
      const tile = mesh();
      const input = context({
        idleRing,
        residentAncestors: new Set(idleRing ? [] : [tile]),
      });
      expect(resolveTileRequestNeed(tile, input)).toBe(TILE_REQUEST_NEED.IDLE);
      for (const changes of [
        { moving: true },
        { baseCoverageReady: false },
        { mainViewConverged: false },
        { effectiveErrorTarget: 12 },
      ])
        expect(
          resolveTileRequestNeed(tile, { ...input, ...changes })
        ).toBeNull();
    }
  );

  it.each(["camera", "shadow"] as const)(
    "retains independent %s demand only above its parent's target",
    (kind) => {
      const parent = mesh();
      parent.geometricError = 10;
      const tile = mesh(parent);
      for (const needsRefinement of [false, true]) {
        const input =
          kind === "camera"
            ? context({
                cameraDemand: (candidate) => ({
                  required: candidate === tile,
                  errorRatio: needsRefinement ? 2 : 1,
                }),
              })
            : context({
                shadowSelection: true,
                shadowReceiverError: () => (needsRefinement ? 5 : 10),
              });
        expect(resolveTileRequestNeed(tile, input)).toBe(
          needsRefinement
            ? kind === "camera"
              ? TILE_REQUEST_NEED.CAMERA
              : TILE_REQUEST_NEED.SHADOW
            : null
        );
      }
    }
  );

  it("continues shadow demand during mask handover without treating a failed match as demand", () => {
    const tile = mesh();
    expect(resolveTileRequestNeed(tile, context({ shadowView: true }))).toBe(
      TILE_REQUEST_NEED.SHADOW
    );
    expect(
      resolveTileRequestNeed(
        tile,
        context({ shadowView: true, shadowSelection: true })
      )
    ).toBeNull();
  });

  it("resolves urgent coverage before querying expensive secondary demand", () => {
    const fail = () => {
      throw new Error("secondary query reached");
    };
    const tile = mesh();
    expect(
      resolveTileRequestNeed(
        tile,
        context({
          coverageRecovery: true,
          coverageNeeded: () => true,
          inMainView: fail,
          cameraDemand: fail,
          shadowReceiverError: fail,
        })
      )
    ).toBe(TILE_REQUEST_NEED.COVERAGE);
  });
});

it("does not let a shadow requester refine a tile already owned by the viewport", () => {
  const parent = mesh(),
    child = mesh(parent);
  parent.geometricError = 10;
  const shadow = vi.fn(() => 1);
  expect(
    resolveTileRequestNeed(
      child,
      context({
        inMainView: () => true,
        screenError: () => 0.5,
        shadowSelection: true,
        shadowReceiverError: shadow,
      })
    )
  ).toBeNull();
  expect(shadow).not.toHaveBeenCalled();
});
