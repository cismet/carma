import { describe, expect, it, vi } from "vitest";
import { Matrix4, Vector3 } from "three";

import type {
  AnnotationEngine,
  AnnotationGizmoAxisCandidate,
} from "@carma-mapping/annotations/core";

import type { ConeArrowGeometry } from "./engine-point-move-gizmo-cone";
import type { PointMoveGizmoFrame } from "./engine-point-move-gizmo-frame";
import {
  buildPointMoveGizmoSceneLines,
  buildPointMoveGizmoScenePrimitives,
  canDrawPointMoveGizmoInScene,
  type PointMoveGizmoSceneModelOptions,
} from "./engine-point-move-gizmo-scene-models";

const ORIGIN = new Vector3(4_000_000, 600_000, 4_900_000);
const AXES: AnnotationGizmoAxisCandidate[] = [
  { id: "vertical", direction: new Vector3(0, 0, 1), color: "blue" },
  { id: "east", direction: new Vector3(1, 0, 0), color: "red" },
];

const cone = (offset: number): ConeArrowGeometry => ({
  baseCenter: ORIGIN.clone().add(new Vector3(0, 0, offset)),
  apex: ORIGIN.clone().add(new Vector3(0, 0, offset + Math.sign(offset))),
  direction: new Vector3(0, 0, Math.sign(offset)),
  side: new Vector3(1, 0, 0),
  across: new Vector3(0, Math.sign(offset), 0),
  radius: 0.5,
  height: 1,
  baseFacesCamera: false,
});

const FRAME = {
  origin: ORIGIN,
  activeAxis: AXES[0],
  activeOutline: {
    supportRadius: 48,
    pathD: "",
    worldRadius: 2,
    planeBasisX: new Vector3(1, 0, 0),
    planeBasisY: new Vector3(0, 1, 0),
    segments: 8,
  },
  discPlaneNormal: new Vector3(0, 0, 1),
  discWorldRadius: 2,
  axes: [
    {
      candidate: AXES[0],
      arrows: { up: cone(3), down: cone(-3) },
    },
  ],
  rotationHandle: {
    centerECEF: ORIGIN.clone().add(new Vector3(2, 0, 0)),
    worldRadius: 0.25,
    normal: new Vector3(0, 0, 1),
  },
  cameraPositionECEF: ORIGIN.clone().add(new Vector3(0, -100, 0)),
} as unknown as PointMoveGizmoFrame;

const options = (
  overrides: Partial<PointMoveGizmoSceneModelOptions> = {}
): PointMoveGizmoSceneModelOptions => ({
  pointId: "p",
  originECEF: ORIGIN,
  axisCandidates: AXES,
  showAxes: true,
  showDisc: true,
  showRotationHandle: true,
  inScene: true,
  occludedLinesInScene: true,
  axisWidthPx: 1,
  discSegments: 16,
  rotationAxisDashCount: 3,
  readFrame: () => FRAME,
  ...overrides,
});

const engineWith = (overrides: Partial<AnnotationEngine>) =>
  ({
    capabilities: { occludedLinesInScene: true, occlusionPerFrame: true },
    ...overrides,
  } as AnnotationEngine);

describe("canDrawPointMoveGizmoInScene", () => {
  it("draws in the scene only with occluded lines and cones", () => {
    const createCone = vi.fn();
    expect(canDrawPointMoveGizmoInScene(null)).toBe(false);
    expect(canDrawPointMoveGizmoInScene(engineWith({ createCone }))).toBe(true);
    expect(canDrawPointMoveGizmoInScene(engineWith({}))).toBe(false);
    expect(
      canDrawPointMoveGizmoInScene(
        engineWith({
          createCone,
          capabilities: {
            occludedLinesInScene: false,
            occlusionPerFrame: false,
          },
        })
      )
    ).toBe(false);
  });
});

describe("buildPointMoveGizmoSceneLines", () => {
  it("keeps only the axis guide in the scene for the overlay fallback", () => {
    const lines = buildPointMoveGizmoSceneLines(
      options({ inScene: false, occludedLinesInScene: false })
    );
    expect(lines.map((line) => line.id)).toEqual([
      "point-move-p-guide-0",
      "point-move-p-guide-1",
      "point-move-p-guide-2",
    ]);
    expect(lines.every((line) => !line.occludedDashed)).toBe(true);
  });

  it("draws axes, disc outline and handle rim as occluded-dashed scene lines", () => {
    const lines = buildPointMoveGizmoSceneLines(options());
    const gizmoLines = lines.filter((line) => !line.id.includes("-guide-"));
    expect(gizmoLines.map((line) => line.id)).toEqual([
      "point-move-p-axis-vertical",
      "point-move-p-axis-east",
      "point-move-p-disc-outline",
      "point-move-p-rotation-handle-outline",
    ]);
    for (const line of lines) {
      expect(line.occludedDashed).toBe(true);
      expect(line.followsView).toBe(true);
    }
  });

  it("runs the axis between the arrow bases and closes the disc outline", () => {
    const byId = new Map(
      buildPointMoveGizmoSceneLines(options()).map((line) => [line.id, line])
    );
    const liveAnchors = undefined as never;
    const axis = byId.get("point-move-p-axis-vertical")!.recompute!(
      liveAnchors
    )!;
    expect(axis.map((point) => point.z - ORIGIN.z)).toEqual([-3, 3]);
    // an axis without cones this frame is hidden
    expect(byId.get("point-move-p-axis-east")!.recompute!(liveAnchors)).toEqual(
      []
    );
    const outline = byId.get("point-move-p-disc-outline")!.recompute!(
      liveAnchors
    )!;
    expect(outline).toHaveLength(9);
    expect(outline[0]!.distanceTo(outline[8]!)).toBe(0);
    for (const point of outline) {
      expect(point.distanceTo(ORIGIN)).toBeCloseTo(2, 9);
    }
  });

  it("hides every line while the frame is unavailable", () => {
    const lines = buildPointMoveGizmoSceneLines(
      options({ readFrame: () => null })
    );
    for (const line of lines) {
      expect(line.recompute!(undefined as never)).toEqual([]);
    }
  });
});

describe("buildPointMoveGizmoScenePrimitives", () => {
  it("keeps the disc fill on top for the overlay fallback", () => {
    const createRing = vi.fn(() => ({} as never));
    const primitives = buildPointMoveGizmoScenePrimitives(
      options({ inScene: false })
    );
    expect(primitives.map((primitive) => primitive.id)).toEqual([
      "point-move-p-disc",
    ]);
    primitives[0]!.create(engineWith({ createRing }), new Matrix4());
    expect(createRing).toHaveBeenCalledWith(
      expect.objectContaining({ occludable: false })
    );
  });

  it("adds occludable fills and the arrow cones in the scene", () => {
    const primitives = buildPointMoveGizmoScenePrimitives(options());
    expect(primitives.map((primitive) => primitive.id)).toEqual([
      "point-move-p-disc",
      "point-move-p-arrow-vertical-up",
      "point-move-p-arrow-vertical-down",
      "point-move-p-arrow-east-up",
      "point-move-p-arrow-east-down",
      "point-move-p-rotation-handle-vertical",
      "point-move-p-rotation-handle-east",
    ]);
    const createCone = vi.fn(() => ({} as never));
    primitives[1]!.create(engineWith({ createCone }), new Matrix4());
    expect(createCone).toHaveBeenCalledWith(
      expect.objectContaining({ color: "blue" })
    );
  });

  it("places the cones on the frame's arrows and only the active handle", () => {
    const byId = new Map(
      buildPointMoveGizmoScenePrimitives(options()).map((primitive) => [
        primitive.id,
        primitive,
      ])
    );
    const upCone = byId.get("point-move-p-arrow-vertical-up")!.place()!;
    expect(
      new Vector3(0, 0, 1).applyMatrix4(upCone).distanceTo(cone(3).apex)
    ).toBeCloseTo(0, 6);
    expect(byId.get("point-move-p-arrow-east-up")!.place()).toBeNull();
    expect(byId.get("point-move-p-rotation-handle-vertical")!.place()).not.toBe(
      null
    );
    expect(byId.get("point-move-p-rotation-handle-east")!.place()).toBeNull();
  });
});

describe("MapLibre guide batch parity", () => {
  it("batches the exact legacy guide endpoints and retains the legacy fallback", () => {
    const legacy = buildPointMoveGizmoSceneLines(options({ inScene: false }));
    const batch = buildPointMoveGizmoSceneLines(options()).find(
      (line) => line.segmentPairs
    )!;
    const anchors = undefined as never;
    const legacyPositions = legacy.flatMap((line) => [
      ...line.recompute!(anchors)!,
    ]);
    const batchPositions = batch.recompute!(anchors)!;
    expect(batchPositions.map((point) => point.toArray())).toEqual(
      legacyPositions.map((point) => point.toArray())
    );
    expect(legacy).toHaveLength(3);
    expect(legacy.every((line) => line.segmentPairs === undefined)).toBe(true);
    expect(batch.occludedDashed).toBe(legacy[0]!.occludedDashed);
    expect(batch.strokeWidth).toBe(legacy[0]!.strokeWidth);
  });
});
