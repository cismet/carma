import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyShadowReceiverMask,
  createShadowReceiverMask,
  maximumSweepDistanceWithinBox,
  receiverMatchedTileError,
  type ShadowReceiverMatch,
  type ShadowReceiverSource,
} from "./shadow-receiver-mask";

const box = (
  minimum: readonly [number, number, number],
  maximum: readonly [number, number, number]
) =>
  new THREE.Box3(new THREE.Vector3(...minimum), new THREE.Vector3(...maximum));

const source = (
  bounds: THREE.Box3,
  options: Partial<Omit<ShadowReceiverSource, "bounds">> = {}
): ShadowReceiverSource => ({
  bounds,
  maximumCasterDistance: options.maximumCasterDistance ?? 50,
  geometricError: options.geometricError ?? 4,
  centerness: options.centerness ?? 0.5,
});

const match = (): ShadowReceiverMatch => ({
  receiverGeometricError: Number.POSITIVE_INFINITY,
  receiverCenterness: 0,
  lightFacing: 0,
});

describe("createShadowReceiverMask", () => {
  it("reuses parent candidate sets with exact uncached parity, including boundary contacts", () => {
    const sources = Array.from({ length: 30 }, (_, i) =>
      source(box([i * 4, 0, 0], [i * 4 + 2, 2, 2]))
    );
    const mask = createShadowReceiverMask(sources, new THREE.Matrix4(), 0.005)!;
    const parent = {};
    const parentBox = box([-2, -2, -2], [18, 8, 55]);
    mask.match(parentBox, match(), undefined, { key: parent });
    for (let i = 0; i < 160; i++) {
      const candidate = box(
        [(i % 20) - 2, (i % 7) - 2, i % 54],
        [(i % 20) - 1, (i % 7) - 1, (i % 54) + 1]
      );
      const key = {};
      const expected = match();
      const included = mask.match(candidate, expected);
      for (let repeat = 0; repeat < 2; repeat++) {
        const actual = match();
        expect(mask.match(candidate, actual, undefined, { key, parent })).toBe(
          included
        );
        expect(actual).toEqual(expected);
      }
    }
  });

  it("invalidates changed boxes/transforms and does not inherit a non-enclosing parent's rejection", () => {
    const mask = createShadowReceiverMask(
      [source(box([0, 0, 0], [2, 2, 2]))],
      new THREE.Matrix4()
    )!;
    const parent = {},
      key = {};
    mask.match(box([20, 20, 0], [30, 30, 40]), match(), undefined, {
      key: parent,
    });
    const candidate = box([0, 0, 5], [1, 1, 6]);
    const transform = new THREE.Matrix4();
    expect(mask.match(candidate, match(), transform, { key, parent })).toBe(
      true
    );
    transform.makeTranslation(30, 0, 0);
    expect(mask.match(candidate, match(), transform, { key, parent })).toBe(
      false
    );
    transform.identity();
    expect(mask.match(candidate, match(), transform, { key, parent })).toBe(
      true
    );
    candidate.translate(new THREE.Vector3(40, 0, 0));
    expect(mask.match(candidate, match(), transform, { key, parent })).toBe(
      false
    );
  });

  it("does not give nearby casters the full far-end solar-disc guard", () => {
    const mask = createShadowReceiverMask(
      [source(box([-1, -1, 0], [1, 1, 2]), { maximumCasterDistance: 10_000 })],
      new THREE.Matrix4(),
      0.005
    )!;
    expect(mask.match(box([20, -0.5, 10], [21, 0.5, 11]), match())).toBe(false);
    expect(mask.match(box([40, -0.5, 9_000], [41, 0.5, 9_001]), match())).toBe(
      true
    );
    expect(mask.match(box([0, 0, -1], [0.5, 0.5, -0.01]), match())).toBe(false);
    expect(mask.match(box([0, 0, 10_003], [0.5, 0.5, 10_004]), match())).toBe(
      false
    );
  });

  it("keeps touching cone boundaries and every sampled finite-disc ray", () => {
    const radius = 0.005;
    const receiver = box([-2, -3, -4], [5, 6, 7]);
    const mask = createShadowReceiverMask(
      [source(receiver, { maximumCasterDistance: 1000 })],
      new THREE.Matrix4(),
      radius
    )!;
    const boundary = 5 + 1000 * Math.tan(radius);
    expect(
      mask.match(box([boundary, 6, 996], [boundary, 6, 996]), match())
    ).toBe(true);
    expect(
      mask.match(
        box([boundary + 0.001, 6, 996], [boundary + 0.001, 6, 996]),
        match()
      )
    ).toBe(false);
    for (const x of [-2, 5])
      for (const y of [-3, 6])
        for (const z of [-4, 7]) {
          for (const distance of [0, 1, 50, 500, 1000]) {
            for (const angle of [0, radius / 2, radius]) {
              for (let step = 0; step < 16; step++) {
                const azimuth = (step * Math.PI) / 8;
                const point = new THREE.Vector3(
                  x + distance * Math.sin(angle) * Math.cos(azimuth),
                  y + distance * Math.sin(angle) * Math.sin(azimuth),
                  z + distance * Math.cos(angle)
                );
                expect(
                  mask.match(
                    new THREE.Box3(point.clone(), point.clone()),
                    match()
                  )
                ).toBe(true);
              }
            }
          }
        }
  });

  it("applies distance-dependent leaf tests across a multi-node BVH", () => {
    const receivers = Array.from({ length: 24 }, (_, index) =>
      source(box([index * 200, 0, 0], [index * 200 + 1, 1, 1]), {
        maximumCasterDistance: 10_000,
      })
    );
    const mask = createShadowReceiverMask(
      receivers,
      new THREE.Matrix4(),
      0.005
    )!;
    expect(mask.match(box([20, 0, 10], [21, 1, 11]), match())).toBe(false);
    expect(mask.match(box([40, 0, 9000], [41, 1, 9001]), match())).toBe(true);
    expect(
      mask.match(box([-100, -100, -100], [5000, 100, 10100]), match())
    ).toBe(true);
  });

  it("projects source and candidate OBBs directly without intermediate AABB inflation", () => {
    const rotation = new THREE.Matrix4().makeRotationZ(Math.PI / 4);
    const lightProjection = rotation.clone().invert();
    const local = box([-10, -0.1, -0.1], [10, 0.1, 0.1]);
    const tight = createShadowReceiverMask(
      [{ ...source(local), boundsTransform: rotation }],
      lightProjection
    )!;
    const inflated = createShadowReceiverMask(
      [source(local.clone().applyMatrix4(rotation))],
      lightProjection
    )!;
    const outside = box([0, 5, 5], [0.1, 5.1, 6]);
    expect(tight.match(outside, match(), rotation)).toBe(false);
    expect(inflated.match(outside, match(), rotation)).toBe(true);
    expect(tight.match(box([0, 0, 5], [0.1, 0.1, 6]), match(), rotation)).toBe(
      true
    );
    const target = { inView: false, error: 0 };
    expect(
      applyShadowReceiverMask(tight, outside, target, match(), 4, 1, rotation)
    ).toBe(false);
    // Source transforms are captured when the mask is built, not borrowed.
    rotation.makeTranslation(1000, 1000, 1000);
    expect(
      tight.match(
        box([0, 0, 5], [0, 0, 5]),
        match(),
        lightProjection.clone().invert()
      )
    ).toBe(true);
  });

  it("admits a 13.15px caster for an 11.72px receiver in their common 16px stage", () => {
    const receiver = source(box([-1, -1, -100], [1, 1, -90]), {
      geometricError: 8,
    });
    const mask = createShadowReceiverMask(
      [
        {
          ...receiver,
          screenErrorPixels: 11.72,
          casterGeometricError: (8 * 16) / 11.72,
        },
      ],
      new THREE.Matrix4()
    );
    const result = match();
    const target = { inView: false, error: Infinity };
    const casterGeometricError = (8 * 13.15) / 11.72;
    applyShadowReceiverMask(
      mask!,
      box([-1, -1, -80], [1, 1, -70]),
      target,
      result,
      casterGeometricError,
      1
    );
    expect(target.inView).toBe(true);
    expect(target.error).toBeLessThanOrEqual(1);
    expect(
      receiverMatchedTileError(
        casterGeometricError,
        result.receiverGeometricError,
        1,
        result.receiverPixelsPerMeter
      )
    ).toBeCloseTo(13.15);
  });

  it("rejects diagonal corridor AABB corners outside the sunward prism", () => {
    const camera = new THREE.OrthographicCamera();
    camera.position.set(100, 100, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const receiver = box([-1, -1, -1], [1, 1, 1]);
    const broadPhase = box([-1, -1, -1], [31, 31, 1]);
    const corner = box([19, -1, -0.5], [21, 1, 0.5]);
    const caster = box([19, 19, -0.5], [21, 21, 0.5]);
    const mask = createShadowReceiverMask(
      [source(receiver, { maximumCasterDistance: 42 })],
      camera.matrixWorldInverse
    );
    expect(broadPhase.intersectsBox(corner)).toBe(true);
    expect(mask?.match(corner, match())).toBe(false);
    expect(mask?.match(caster, match())).toBe(true);
  });

  it("separates stage-relative caster admission from actual receiver pixel error", () => {
    const mask = createShadowReceiverMask(
      [
        {
          ...source(box([-1, -1, -100], [1, 1, -90]), { geometricError: 8 }),
          screenErrorPixels: 16,
        },
      ],
      new THREE.Matrix4()
    );
    const target = { inView: false, error: 0 };
    const receiverMatch = match();
    applyShadowReceiverMask(
      mask!,
      box([-1, -1, -80], [1, 1, -70]),
      target,
      receiverMatch,
      8,
      1
    );
    expect(target.error).toBe(1); // same geometric stage, not final-resolution demand
    expect(
      receiverMatchedTileError(
        8,
        receiverMatch.receiverGeometricError,
        1,
        receiverMatch.receiverPixelsPerMeter
      )
    ).toBe(16);
    applyShadowReceiverMask(
      mask!,
      box([-1, -1, -80], [1, 1, -70]),
      target,
      receiverMatch,
      0.5,
      1
    );
    expect(target.error).toBe(0.0625);
    expect(
      receiverMatchedTileError(
        0.5,
        receiverMatch.receiverGeometricError,
        1,
        receiverMatch.receiverPixelsPerMeter
      )
    ).toBe(1);
  });

  it("keeps its projection snapshot while the next corridor refits the shared matrix", () => {
    const projection = new THREE.Matrix4();
    const receiver = source(box([-10, -10, -110], [10, 10, -100]));
    const caster = box([-5, -5, -95], [5, 5, -85]);
    const previous = createShadowReceiverMask([receiver], projection);
    expect(previous?.match(caster, match())).toBe(true);

    projection.makeTranslation(100, 0, 0);
    const current = createShadowReceiverMask([receiver], projection);
    expect(previous?.match(caster, match())).toBe(true);
    expect(current?.match(caster, match())).toBe(true);
    expect(previous?.match(box([95, -5, -95], [105, 5, -85]), match())).toBe(
      false
    );
  });

  it("uses the same finite-disc guard for raster and native mesh volumes", () => {
    const receivers = [
      source(box([-10, -10, -110], [10, 10, -100]), {
        maximumCasterDistance: 100,
      }),
    ];
    const candidate = box([10.2, -1, -50], [10.3, 1, -49]);
    expect(
      createShadowReceiverMask(receivers, new THREE.Matrix4())?.match(
        candidate,
        match()
      )
    ).toBe(false);
    expect(
      createShadowReceiverMask(receivers, new THREE.Matrix4(), 0.005)?.match(
        candidate,
        match()
      )
    ).toBe(true);
    expect(
      createShadowReceiverMask(receivers, new THREE.Matrix4(), NaN)
    ).toBeNull();
  });
  it("keeps every partial caster between a receiver and the sunward limit", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, -10, -110], [10, 10, -100]))],
      new THREE.Matrix4()
    );

    expect(mask?.match(box([-5, -5, -95], [5, 5, -85]), match())).toBe(true);
    expect(mask?.match(box([-5, -5, -75], [5, 5, -65]), match())).toBe(true);
    expect(mask?.match(box([-5, -5, -140], [5, 5, -130]), match())).toBe(false);
    expect(mask?.match(box([-5, -5, -45], [5, 5, -35]), match())).toBe(false);
  });

  it("rejects hierarchy branches whose light-space footprint misses all receivers", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, -10, -110], [10, 10, -100]))],
      new THREE.Matrix4()
    );

    expect(mask?.match(box([20, 20, -95], [30, 30, -85]), match())).toBe(false);
  });

  it("tests the complete 3d cross-section including the receiver height", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, 20, -110], [10, 40, -100]))],
      new THREE.Matrix4()
    );

    expect(mask?.match(box([-5, 35, -90], [5, 45, -80]), match())).toBe(true);
    expect(mask?.match(box([-5, -5, -90], [5, 5, -80]), match())).toBe(false);
  });

  it("uses the finest intersected receiver error and strongest view priority", () => {
    const mask = createShadowReceiverMask(
      [
        source(box([-20, -10, -110], [5, 10, -100]), {
          geometricError: 8,
          centerness: 0.9,
        }),
        source(box([-5, -10, -110], [20, 10, -100]), {
          geometricError: 2,
          centerness: 0.3,
        }),
      ],
      new THREE.Matrix4()
    );
    const result = match();

    expect(mask?.match(box([-2, -5, -95], [2, 5, -85]), result)).toBe(true);
    expect(result.receiverGeometricError).toBe(2);
    expect(result.receiverCenterness).toBe(0.9);
  });

  it("applies the tiles-to-light transform before indexing", () => {
    const receiver = source(box([-10, -10, -110], [10, 10, -100]));
    const caster = box([-30, -5, -108], [-20, 5, -104]);
    const identityMask = createShadowReceiverMask(
      [receiver],
      new THREE.Matrix4()
    );
    const rotatedMask = createShadowReceiverMask(
      [receiver],
      new THREE.Matrix4().makeRotationY(Math.PI / 2)
    );

    expect(identityMask?.match(caster, match())).toBe(false);
    expect(rotatedMask?.match(caster, match())).toBe(true);
    expect(rotatedMask?.sourceCount).toBe(1);
  });

  it("selects casters only along the receiver-to-sun direction", () => {
    const lightCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 500);
    lightCamera.position.set(80, 60, -40);
    lightCamera.lookAt(0, 0, 0);
    lightCamera.updateMatrixWorld(true);
    const towardSun = lightCamera.position.clone().normalize();
    const receiver = box([-5, -5, -5], [5, 5, 5]);
    const boxAt = (center: THREE.Vector3) =>
      new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(6, 6, 6));
    const mask = createShadowReceiverMask(
      [source(receiver, { maximumCasterDistance: 70 })],
      lightCamera.matrixWorldInverse
    );

    expect(
      mask?.match(boxAt(towardSun.clone().multiplyScalar(40)), match())
    ).toBe(true);
    expect(
      mask?.match(boxAt(towardSun.clone().multiplyScalar(-40)), match())
    ).toBe(false);
  });

  it("keeps BVH queries conservative across many receiver leaves", () => {
    const receivers = Array.from({ length: 24 }, (_, index) =>
      source(box([index * 20, 0, -100], [index * 20 + 10, 10, -90]), {
        geometricError: index + 1,
      })
    );
    const mask = createShadowReceiverMask(receivers, new THREE.Matrix4());
    const result = match();

    expect(mask?.match(box([401, 1, -80], [409, 9, -70]), result)).toBe(true);
    expect(result.receiverGeometricError).toBe(21);
  });
});

describe("receiverMatchedTileError", () => {
  it("stops at the receiver geometric error and refines coarser casters", () => {
    expect(receiverMatchedTileError(4, 4, 1)).toBe(1);
    expect(receiverMatchedTileError(8, 4, 1)).toBe(2);
    expect(receiverMatchedTileError(2, 4, 1)).toBe(0.5);
  });

  it("requires a leaf when the receiver has zero geometric error", () => {
    expect(receiverMatchedTileError(1, 0, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(receiverMatchedTileError(0, 0, 1)).toBe(0);
  });
});

describe("applyShadowReceiverMask", () => {
  it("rescues a sunward hierarchy branch rejected by the camera frustum", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, -10, -110], [10, 10, -100]))],
      new THREE.Matrix4()
    );
    const target = { inView: false, error: 0 };
    const result = match();

    expect(
      applyShadowReceiverMask(
        mask!,
        box([-5, -5, -80], [5, 5, -70]),
        target,
        result,
        8,
        1
      )
    ).toBe(true);
    expect(target).toEqual({ inView: true, error: 2 });
  });

  it("removes a shadow-camera tile outside every receiver extrusion", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, -10, -110], [10, 10, -100]))],
      new THREE.Matrix4()
    );
    const target = { inView: true, error: 10 };

    expect(
      applyShadowReceiverMask(
        mask!,
        box([20, 20, -80], [30, 30, -70]),
        target,
        match(),
        8,
        1
      )
    ).toBe(false);
    expect(target).toEqual({ inView: false, error: 10 });
  });
});

describe("maximumSweepDistanceWithinBox", () => {
  it("stops a receiver sweep at the first tileset-bound exit", () => {
    const receiver = box([40, 0, 40], [50, 10, 50]);
    const tileset = box([0, -20, 0], [100, 80, 100]);
    const direction = new THREE.Vector3(1, 1, 0).normalize();

    expect(
      maximumSweepDistanceWithinBox(receiver, tileset, direction)
    ).toBeCloseTo(60 * Math.SQRT2);
  });
});
