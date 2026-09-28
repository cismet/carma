// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  evaluateMeshCameraObjective,
  MESH_CAMERA_PHASE_PRIORITY,
  nextMeshCameraErrorTarget,
  type MeshCameraContribution,
} from "./mesh-camera-objective";
import { TILE_MAIN_OBSERVER_ID } from "./tile-camera-demand";

const camera = (
  patch: Partial<MeshCameraContribution> = {}
): MeshCameraContribution => ({
  id: TILE_MAIN_OBSERVER_ID,
  currentErrorPixels: 24,
  nextErrorPixels: 12,
  visibleAreaFraction: 0.25,
  targetErrorPixels: 6,
  ...patch,
});

describe("mesh camera objective", () => {
  it("scores only missing coverage during a fill phase, excluding other cameras' detail gains", () => {
    const refinement = camera({
      id: "detail",
      currentErrorPixels: 10000,
      nextErrorPixels: 0,
      visibleAreaFraction: 1,
    });
    const otherGap = camera({
      id: "preview",
      currentErrorPixels: null,
      visibleAreaFraction: 0.8,
    });
    expect(
      evaluateMeshCameraObjective([
        refinement,
        otherGap,
        camera({ currentErrorPixels: null, visibleAreaFraction: 0.02 }),
      ])
    ).toMatchObject({
      priority: MESH_CAMERA_PHASE_PRIORITY.PRIMARY_FILL,
      benefit: 0.02,
      errorBand: 0,
    });
    expect(evaluateMeshCameraObjective([refinement, otherGap])).toMatchObject({
      priority: MESH_CAMERA_PHASE_PRIORITY.OTHER_FILL,
      benefit: 0.8,
      errorBand: 0,
    });
  });

  it("sums paired error reduction and viewport area shares with equal camera weights", () => {
    const contributions = [
      camera(),
      camera({
        id: "shadow",
        currentErrorPixels: 12,
        nextErrorPixels: 6,
        visibleAreaFraction: 0.5,
      }),
    ];
    const objective = evaluateMeshCameraObjective(contributions);
    expect(objective).toEqual({
      priority: MESH_CAMERA_PHASE_PRIORITY.REFINEMENT,
      benefit: 6,
      currentErrorPixels: 24,
      nextErrorPixels: 12,
      visibleAreaFraction: 0.75,
      errorBand: 2,
    });
    expect(evaluateMeshCameraObjective([...contributions].reverse())).toEqual(
      objective
    );
    expect(evaluateMeshCameraObjective([camera({ id: "shadow" })])).toEqual(
      evaluateMeshCameraObjective([camera()])
    );
  });

  it("gives the same gain to equal viewport fractions regardless of pixel count", () => {
    const gain = (area: number, viewport: number) =>
      evaluateMeshCameraObjective([
        camera({ visibleAreaFraction: area / viewport }),
      ]).benefit;
    expect(gain(2500, 10000)).toBe(gain(250000, 1000000));
  });

  it("does not reward refinement beyond each camera's idle target", () => {
    expect(
      evaluateMeshCameraObjective([
        camera({
          currentErrorPixels: 12,
          nextErrorPixels: 0,
          targetErrorPixels: 10,
        }),
        camera({
          id: "settled",
          currentErrorPixels: 8,
          nextErrorPixels: 2,
          targetErrorPixels: 8,
        }),
      ]).benefit
    ).toBe(0.5);
    expect(
      evaluateMeshCameraObjective([
        camera({ currentErrorPixels: 6, nextErrorPixels: 0 }),
      ])
    ).toMatchObject({
      priority: MESH_CAMERA_PHASE_PRIORITY.NONE,
      benefit: 0,
      errorBand: 0,
    });
  });

  it("orders primary gaps before other gaps and represents their benefit finitely", () => {
    const gap = camera({ currentErrorPixels: null, nextErrorPixels: 64 });
    expect(evaluateMeshCameraObjective([gap])).toMatchObject({
      priority: MESH_CAMERA_PHASE_PRIORITY.PRIMARY_FILL,
      benefit: 0.25,
      currentErrorPixels: 0,
      errorBand: 0,
    });
    expect(
      evaluateMeshCameraObjective([{ ...gap, id: "shadow" }])
    ).toMatchObject({
      priority: MESH_CAMERA_PHASE_PRIORITY.OTHER_FILL,
      benefit: 0.25,
    });
    expect(
      evaluateMeshCameraObjective([camera(), { ...gap, id: "preview" }, gap])
        .priority
    ).toBe(MESH_CAMERA_PHASE_PRIORITY.PRIMARY_FILL);
  });

  it("takes the greatest relative band only among cameras that can improve", () => {
    expect(
      evaluateMeshCameraObjective([
        camera({
          currentErrorPixels: 40,
          nextErrorPixels: 41,
          targetErrorPixels: 1,
        }),
        camera({ id: "shadow", currentErrorPixels: 17, nextErrorPixels: 12 }),
        camera({
          id: "preview",
          currentErrorPixels: 24,
          nextErrorPixels: 12,
          targetErrorPixels: 12,
        }),
      ])
    ).toMatchObject({ benefit: 4.25, errorBand: 2 });
  });

  it.each([
    [5, 40, 3],
    [10, 20, 1],
    [6, 24, 2],
  ])(
    "keeps exact relative boundaries for target %s and error %s",
    (target, current, band) => {
      expect(
        evaluateMeshCameraObjective([
          camera({
            currentErrorPixels: current,
            nextErrorPixels: target,
            targetErrorPixels: target,
          }),
        ]).errorBand
      ).toBe(band);
    }
  );

  it("clamps each camera's area share and ignores invalid contributions", () => {
    expect(
      evaluateMeshCameraObjective([
        camera({ visibleAreaFraction: 2 }),
        camera({ visibleAreaFraction: -1 }),
        camera({ visibleAreaFraction: Number.NaN }),
        camera({ currentErrorPixels: Infinity }),
        camera({ nextErrorPixels: Infinity }),
        camera({ nextErrorPixels: -1 }),
        camera({ targetErrorPixels: 0 }),
      ])
    ).toMatchObject({ benefit: 12, visibleAreaFraction: 1, errorBand: 2 });
    expect(evaluateMeshCameraObjective([])).toMatchObject({
      priority: MESH_CAMERA_PHASE_PRIORITY.NONE,
      benefit: 0,
      errorBand: 0,
    });
  });

  it("keeps summed scores finite", () => {
    const large = camera({
      currentErrorPixels: Number.MAX_VALUE,
      nextErrorPixels: 0,
      visibleAreaFraction: 1,
    });
    expect(
      evaluateMeshCameraObjective([large, { ...large, id: "shadow" }]).benefit
    ).toBe(Number.MAX_VALUE);
  });

  it("prioritizes missing routing coverage even before its finite error bound is known", () => {
    for (const [id, priority] of [
      [TILE_MAIN_OBSERVER_ID, MESH_CAMERA_PHASE_PRIORITY.PRIMARY_FILL],
      ["shadow", MESH_CAMERA_PHASE_PRIORITY.OTHER_FILL],
    ] as const) {
      expect(
        evaluateMeshCameraObjective([
          camera({ id, currentErrorPixels: null, nextErrorPixels: Infinity }),
        ])
      ).toMatchObject({
        priority,
        benefit: 0.25,
        currentErrorPixels: 0,
        nextErrorPixels: 6,
      });
    }
    for (const nextErrorPixels of [Number.NaN, -Infinity, -1])
      expect(
        evaluateMeshCameraObjective([
          camera({ currentErrorPixels: null, nextErrorPixels }),
        ]).priority
      ).toBe(MESH_CAMERA_PHASE_PRIORITY.NONE);
  });
});

describe("camera-local target-relative refinement steps", () => {
  it.each([
    [6, 17, 12],
    [6, 24, 12],
    [6, 12, 6],
    [6, 6, 6],
    [6, 3, 6],
    [5, 41, 40],
    [5, 40, 20],
    [5, 20, 10],
    [5, 10, 5],
  ])("advances base %s from error %s to %s", (base, current, target) => {
    expect(nextMeshCameraErrorTarget(base, current)).toBe(target);
  });
});
