import { describe, expect, it, vi } from "vitest";
import { Box3, Matrix4, OrthographicCamera, Vector3 } from "three";
import { mesh } from "../../core/mesh-tile-test-fixtures";
import { getReadyMeshRegionCut } from "../../core/mesh-tile-coverage";
import { selectShadowCasterPlan } from "../../core/mesh-shadow-publication";
import type { ShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { createCasterVolumeDemand } from "./three-tiles-runtime-caster-demand";

describe("caster publication demand", () => {
  it("uses logical light-camera pixels after receiver-mask pruning", () => {
    const tile = mesh(null, 2);
    tile.geometricError = 2;
    const bounds = new Box3(new Vector3(-1, -1, -11), new Vector3(1, 1, -9));
    Object.assign(tile, {
      engineData: {
        boundingVolume: { getAABB: (out: Box3) => out.copy(bounds) },
      },
    });
    const match = vi.fn((_box, receiver) => {
      receiver.receiverGeometricError = 0;
      return true;
    });
    const mask = { sourceCount: 1, match } as unknown as ShadowReceiverMask;
    const camera = new OrthographicCamera(-10, 10, 10, -10, 1, 100);
    const view = { camera, shadowMapSize: { width: 200, height: 100 } };
    expect(createCasterVolumeDemand(mask, 6, view)(tile)).toEqual({
      intersects: true,
      errorPixels: 20,
    });
    // Receiver density and the acceptance target do not change physical SSE.
    match.mockImplementation((_box, receiver) => {
      receiver.receiverGeometricError = 100;
      return true;
    });
    expect(createCasterVolumeDemand(mask, 1, view)(tile).errorPixels).toBe(20);
    expect(
      createCasterVolumeDemand(mask, 6, {
        ...view,
        shadowMapSize: { width: 400, height: 200 },
      })(tile).errorPixels
    ).toBe(40);
    match.mockReturnValue(false);
    expect(createCasterVolumeDemand(mask, 6, view)(tile)).toEqual({
      intersects: false,
      errorPixels: 0,
    });
  });

  it("transforms native bounds and geometric error into the light camera world", () => {
    const tile = mesh(null, 2);
    tile.geometricError = 2;
    const bounds = new Box3(new Vector3(-1, -1, -11), new Vector3(1, 1, -9));
    Object.assign(tile, {
      engineData: {
        boundingVolume: { getAABB: (out: Box3) => out.copy(bounds) },
      },
    });
    const mask = { match: () => true } as unknown as ShadowReceiverMask;
    const camera = new OrthographicCamera(-10, 10, 10, -10, 1, 100);
    camera.position.x = 50;
    const view = { camera, shadowMapSize: { width: 200, height: 200 } };
    expect(createCasterVolumeDemand(mask, 6, view)(tile).intersects).toBe(
      false
    );
    const placement = new Matrix4().makeScale(2, 2, 2).setPosition(50, 0, 0);
    expect(createCasterVolumeDemand(mask, 6, view, placement)(tile)).toEqual({
      intersects: true,
      errorPixels: 40,
    });
  });

  it("keeps coarse drawable coverage while a zero-error receiver needs arbitrarily finer casters", () => {
    const parent = mesh(null, 1),
      child = mesh(parent, 0);
    parent.children = [child];
    child.internal.loadingState = 0;
    const bounds = new Box3();
    bounds.min.set(0, 0, 0);
    bounds.max.set(1, 1, 1);
    for (const tile of [parent, child])
      Object.assign(tile, {
        engineData: {
          boundingVolume: { getAABB: (out: Box3) => out.copy(bounds) },
        },
      });
    const mask = {
      sourceCount: 1,
      match: (_box, match) => {
        match.receiverGeometricError = 0;
        return true;
      },
    } as ShadowReceiverMask;
    const demand = createCasterVolumeDemand(mask, 6),
      published = new Set([parent]);
    expect(
      getReadyMeshRegionCut(parent, published, Number.MAX_VALUE, demand)
    ).toEqual([parent]);
    expect(
      selectShadowCasterPlan(
        published,
        published,
        new Set(),
        () => false,
        (t) => demand(t).intersects,
        (t) => demand(t).errorPixels,
        6
      )
    ).toEqual(published);
    child.internal.loadingState = 4;
    expect(
      selectShadowCasterPlan(
        new Set([parent, child]),
        published,
        new Set(),
        () => false,
        (t) => demand(t).intersects,
        (t) => demand(t).errorPixels,
        6
      )
    ).toEqual(new Set([child]));
  });
});
