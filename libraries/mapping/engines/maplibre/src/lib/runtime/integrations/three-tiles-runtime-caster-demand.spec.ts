import { describe, expect, it } from "vitest";
import { Box3 } from "three";
import { mesh } from "../../core/mesh-tile-test-fixtures";
import { getReadyMeshRegionCut } from "../../core/mesh-tile-coverage";
import { selectShadowCasterPlan } from "../../core/mesh-shadow-publication";
import type { ShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { createCasterVolumeDemand } from "./three-tiles-runtime-caster-demand";

describe("caster publication demand", () => {
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
