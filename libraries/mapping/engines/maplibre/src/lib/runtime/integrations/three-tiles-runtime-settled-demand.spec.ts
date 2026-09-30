// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrthographicCamera } from "three";
import { mesh } from "../../core/mesh-tile-test-fixtures";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_SHADOW_CAMERA_ID,
} from "../../core/tile-camera-demand";
import { fixture } from "./three-tiles-runtime-loading.test-support";
import type { RuntimeTile } from "./three-tiles-runtime-types";

vi.hoisted(() =>
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:settled-camera-test",
  })
);

afterEach(() => vi.useRealTimers());

describe("settled demand across active cameras", () => {
  it("does not retain geometry rejected by the active shadow camera through a legacy mask", () => {
    const { state, loading } = fixture();
    const camera = new OrthographicCamera();
    state.viewFrustumsReady = true;
    state.shadowView = { camera, shadowMapSize: { width: 256, height: 256 } };
    state.tileCameraDemand = createTileCameraDemand(
      snapshotTileCameraViews([
        {
          id: TILE_SHADOW_CAMERA_ID,
          camera,
          viewport: [256, 256],
          errorTargetPixels: 6,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        },
      ])
    );
    const match = vi.fn(() => true);
    state.shadowReceiverMask = { match } as unknown as NonNullable<
      typeof state.shadowReceiverMask
    >;
    const tile = mesh() as RuntimeTile;
    tile.traversal.inFrustum = false;
    tile.engineData = {
      boundingVolume: { getAABB: (box) => box },
    } as RuntimeTile["engineData"];
    try {
      expect(loading.isRequiredMeshTile(tile)).toBe(false);
      expect(match).not.toHaveBeenCalled();
    } finally {
      state.tiles!.dispose();
    }
  });

  it.each([false, true])(
    "keeps the audit alive until secondary views converge (%s)",
    (converged) => {
      vi.useFakeTimers();
      const { state, loading } = fixture();
      state.lastMainViewConverged = true;
      state.lastActiveViewsConverged = converged;
      try {
        loading.scheduleSettledMeshAudit();
        expect(state.meshAuditTimer !== null).toBe(!converged);
        vi.advanceTimersByTime(10000);
        expect(state.meshDemandSweepPending).toBe(!converged);
      } finally {
        state.tiles!.dispose();
      }
    }
  );
});
