import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  meshReceiverBiasLimitMeters,
  shadowReceiverStageError,
  shadowSceneWorldBasis,
  getPresentedShadowReceiverIds,
  getChangedShadowVolumeBounds,
  shadowRegionQueryKey,
} from "./shadow-corridor-host-state";

describe("source-anchored corridor host state", () => {
  it("keys readiness by exact region, receiver and stage, not object identity", () => {
    const box = new THREE.Box3(
      new THREE.Vector3(),
      new THREE.Vector3(10, 20, 30)
    );
    const receiver = new THREE.Box3(
      new THREE.Vector3(),
      new THREE.Vector3(2, 3, 4)
    );
    const key = shadowRegionQueryKey(box, 4, receiver);
    expect(shadowRegionQueryKey(box.clone(), 4, receiver.clone())).toBe(key);
    expect(shadowRegionQueryKey(box, undefined, receiver)).not.toBe(key);
    expect(shadowRegionQueryKey(box, 1, receiver)).not.toBe(key);
    expect(shadowRegionQueryKey(box, 4)).not.toBe(key);
    receiver.max.y += 0.01;
    expect(shadowRegionQueryKey(box, 4, receiver)).not.toBe(key);
    box.max.x += 0.01;
    expect(shadowRegionQueryKey(box, 4, receiver)).not.toBe(key);
  });
  it("invalidates changed published geometry, not view error or speculative tiles", () => {
    const a = { id: "a", minimum: [0, 0, 0], maximum: [10, 10, 10] } as const;
    const b = { id: "b", minimum: [10, 0, 0], maximum: [20, 10, 10] } as const;
    const moved = { ...a, minimum: [1, 0, 0] as const };
    expect(getChangedShadowVolumeBounds([a, b], [{ ...a }, { ...b }])).toEqual(
      []
    );
    const withError = { ...a, errorPixels: 12, loadReason: "shadow" as const };
    expect(getChangedShadowVolumeBounds([a], [withError])).toEqual([]);
    expect(
      getChangedShadowVolumeBounds([a], [a, b]).map((box) => box.min.toArray())
    ).toEqual([[10, 0, 0]]);
    expect(
      getChangedShadowVolumeBounds([a, b], [b]).map((box) => box.min.toArray())
    ).toEqual([[0, 0, 0]]);
    expect(
      getChangedShadowVolumeBounds([a], [moved]).map((box) => box.min.toArray())
    ).toEqual([
      [0, 0, 0],
      [1, 0, 0],
    ]);
  });
  it("waits for all visible fragments of each receiver, independently of neighbors", () => {
    const volumes = [
      {
        id: "a",
        minimum: [0, 0, 0],
        maximum: [10, 10, 10],
        loadReason: "viewport",
      },
      {
        id: "b",
        minimum: [10, 0, 0],
        maximum: [20, 10, 10],
        loadReason: "viewport",
      },
      {
        id: "caster",
        minimum: [0, 10, 0],
        maximum: [10, 30, 10],
        loadReason: "shadow",
      },
    ] as const;
    const pages = [
      {
        id: "a-left",
        bounds: new THREE.Box3(
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(5, 10, 10)
        ),
      },
      {
        id: "a-right",
        bounds: new THREE.Box3(
          new THREE.Vector3(5, 0, 0),
          new THREE.Vector3(10, 10, 10)
        ),
      },
      {
        id: "b",
        bounds: new THREE.Box3(
          new THREE.Vector3(10, 0, 0),
          new THREE.Vector3(20, 10, 10)
        ),
      },
    ];
    expect(
      getPresentedShadowReceiverIds(volumes, pages, [pages[0], pages[2]])
    ).toEqual(["b"]);
    expect(
      getPresentedShadowReceiverIds(volumes, pages, [pages[0], pages[1]])
    ).toEqual(["a"]);
    expect(getPresentedShadowReceiverIds(volumes, pages, [])).toEqual([]);
    expect(getPresentedShadowReceiverIds(volumes, [], [])).toEqual([]);
    expect(
      getPresentedShadowReceiverIds(volumes, [pages[0]], [pages[0]])
    ).toEqual(["a"]);
  });
  it("maps east/up/south metres to stable Mercator east/south/up", () => {
    const basis = shadowSceneWorldBasis(0.51, 0.33, 1e-7);
    const point = new THREE.Vector3(12, 250, -30).applyMatrix4(basis);
    expect(point.x).toBeCloseTo(0.5100012, 10);
    expect(point.y).toBeCloseTo(0.329997, 10);
    expect(point.z).toBeCloseTo(0.000025, 10);
    expect(
      point
        .clone()
        .applyMatrix4(basis.clone().invert())
        .distanceTo(new THREE.Vector3(12, 250, -30))
    ).toBeLessThan(1e-8);
  });
  it("uses the committed receiver stage and ignores unrelated coarse neighbors", () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 10, 10)
    );
    expect(
      shadowReceiverStageError(
        bounds,
        [
          { minimum: [0, 0, 0], maximum: [10, 10, 10], errorPixels: 8 },
          { minimum: [10, 0, 0], maximum: [20, 10, 10], errorPixels: 16 },
        ],
        1
      )
    ).toBe(8);
    expect(shadowReceiverStageError(bounds, [], 0.25)).toBe(0.25);
    expect(
      shadowReceiverStageError(
        bounds,
        [{ minimum: [0, 0, 0], maximum: [10, 10, 10], errorPixels: 11.72 }],
        1
      )
    ).toBe(16);
    expect(
      shadowReceiverStageError(
        bounds,
        [{ minimum: [0, 0, 0], maximum: [10, 10, 10], errorPixels: 0.8 }],
        1
      )
    ).toBe(1);
  });
  it("does not relax a receiver stage because an offscreen caster overlaps it", () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 10, 10)
    );
    expect(
      shadowReceiverStageError(
        bounds,
        [
          {
            minimum: [0, 0, 0],
            maximum: [10, 10, 10],
            errorPixels: 3.1,
            loadReason: "viewport",
          },
          {
            minimum: [0, 10, 0],
            maximum: [10, 30, 10],
            errorPixels: 31,
            loadReason: "shadow",
          },
        ],
        1
      )
    ).toBe(4);
  });

  it("relaxes only coarse mesh shadow bias and converges to final contact bias", () => {
    const limit = (stageErrorPixels: number, groundTexelTargetMeters: number) =>
      meshReceiverBiasLimitMeters({
        stageErrorPixels,
        targetErrorPixels: 0.25,
        groundTexelTargetMeters,
        finalBiasMeters: 0.01,
        maximumCoarseBiasMeters: 0.25,
      });

    expect(limit(16, 0.5)).toBe(0.25);
    expect(limit(1, 0.5)).toBe(0.04);
    expect(limit(0.25, 0.5)).toBe(0.01);
    expect(limit(16, 0.01)).toBe(0.02);
  });
});
