import { Matrix4, Vector3 } from "three";

import { buildCirclePoints } from "@carma-commons/math";
import { getEllipsoidalUpDirectionAtAnchor } from "@carma-geo/proj";
import {
  AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
  DISC_OUTLINE_COLOR,
  SECONDARY_AXIS_COLOR,
} from "@carma-mapping/gizmo/core";

import {
  createOrientedDiscMatrix,
  type AnnotationEngine,
  type AnnotationGizmoAxisCandidate,
} from "@carma-mapping/annotations/core";
import type { EdgeSceneLine } from "../../render/edges/edge-models";
import type { ScenePrimitiveModel } from "../../render/scene-primitives/scene-primitive-models";
import { createConeArrowMatrix } from "./engine-point-move-gizmo-cone";
import {
  ARROW_OUTLINE_STROKE,
  AXIS_LINE_COLOR,
  AXIS_LINE_FILL,
  DISC_FILL_COLOR,
  DISC_FILL_OPACITY,
} from "./engine-point-move-gizmo-constants";
import type { PointMoveGizmoFrame } from "./engine-point-move-gizmo-frame";
import { getRotationAxisDash } from "./engine-point-move-gizmo-rotation-axis";

const ARROW_SIDES = ["up", "down"] as const;
const HIDDEN: readonly Vector3[] = [];

/**
 * The engine draws the gizmo in its scene, occluded by meshes and terrain:
 * it draws the hidden part of a line dashed and offers solid cones. Without
 * both, the overlay keeps drawing the gizmo.
 */
export const canDrawPointMoveGizmoInScene = (
  engine: AnnotationEngine | null
): boolean =>
  engine?.capabilities.occludedLinesInScene === true &&
  typeof engine.createCone === "function";

export type PointMoveGizmoSceneModelOptions = {
  pointId: string;
  /** The live anchor when the models are built; lines recompute before every frame. */
  originECEF: Vector3;
  /** Ids and colours of the axes the overlay holds arrows for. */
  axisCandidates: readonly AnnotationGizmoAxisCandidate[];
  showAxes: boolean;
  showDisc: boolean;
  showRotationHandle: boolean;
  /** Axes, arrows, disc outline and handle in the scene, see `canDrawPointMoveGizmoInScene`. */
  inScene: boolean;
  occludedLinesInScene: boolean;
  axisWidthPx: number;
  discSegments: number;
  rotationAxisDashCount: number;
  readFrame: () => PointMoveGizmoFrame | null;
};

/** Closed polyline of a circle in the plane spanned by the two unit axes. */
const circlePositions = (
  center: Vector3,
  xAxis: Vector3,
  yAxis: Vector3,
  radius: number,
  segments: number
): Vector3[] => {
  const points = buildCirclePoints(radius, segments).map((point) =>
    center
      .clone()
      .addScaledVector(xAxis, point.x)
      .addScaledVector(yAxis, point.y)
  );
  return points.length > 0 ? [...points, points[0]!.clone()] : points;
};

const buildRotationAxisDashes = (
  options: PointMoveGizmoSceneModelOptions,
  prefix: string
): EdgeSceneLine[] =>
  Array.from({ length: options.rotationAxisDashCount }, (_, index) => ({
    id: `${prefix}-guide-${index}`,
    start: options.originECEF,
    end: options.originECEF,
    stroke: AXIS_LINE_COLOR,
    strokeWidth: options.axisWidthPx,
    occludedDashed: options.occludedLinesInScene,
    ruler: false,
    followsView: true,
    recompute: () => {
      const frame = options.readFrame();
      if (!frame?.cameraPositionECEF) return HIDDEN;
      return getRotationAxisDash(
        frame.origin,
        frame.activeAxis?.direction ??
          getEllipsoidalUpDirectionAtAnchor(frame.origin),
        frame.cameraPositionECEF.distanceTo(frame.origin),
        options.rotationAxisDashCount,
        index
      );
    },
  }));

/** Same dash endpoints, as one disjoint batch in engines drawing the gizmo in-scene. */
const buildRotationAxisDashBatch = (
  options: PointMoveGizmoSceneModelOptions,
  prefix: string
): EdgeSceneLine => ({
  id: `${prefix}-guide-batch`,
  start: options.originECEF,
  end: options.originECEF,
  stroke: AXIS_LINE_COLOR,
  strokeWidth: options.axisWidthPx,
  occludedDashed: options.occludedLinesInScene,
  ruler: false,
  segmentPairs: true,
  followsView: true,
  recompute: () => {
    const frame = options.readFrame();
    if (!frame?.cameraPositionECEF) return HIDDEN;
    const direction =
      frame.activeAxis?.direction ??
      getEllipsoidalUpDirectionAtAnchor(frame.origin);
    const distance = frame.cameraPositionECEF.distanceTo(frame.origin);
    return Array.from({ length: options.rotationAxisDashCount }, (_, index) =>
      getRotationAxisDash(
        frame.origin,
        direction,
        distance,
        options.rotationAxisDashCount,
        index
      )
    ).flat();
  },
});

/** A gizmo line in the scene: solid where visible, dashed where hidden. */
const gizmoLine = (
  options: PointMoveGizmoSceneModelOptions,
  id: string,
  stroke: string,
  strokeWidth: number,
  positions: (frame: PointMoveGizmoFrame) => readonly Vector3[]
): EdgeSceneLine => ({
  id,
  start: options.originECEF,
  end: options.originECEF,
  stroke,
  strokeWidth,
  occludedDashed: true,
  ruler: false,
  halo: false,
  followsView: true,
  recompute: () => {
    const frame = options.readFrame();
    return frame ? positions(frame) : HIDDEN;
  },
});

/** The scene lines of the gizmo: the axis guide, and in the scene the move axes, the disc outline and the handle rim. */
export const buildPointMoveGizmoSceneLines = (
  options: PointMoveGizmoSceneModelOptions
): EdgeSceneLine[] => {
  const prefix = `point-move-${options.pointId}`;
  const { inScene, showAxes, showDisc, showRotationHandle } = options;
  return [
    ...(showAxes
      ? inScene
        ? [buildRotationAxisDashBatch(options, prefix)]
        : buildRotationAxisDashes(options, prefix)
      : []),
    ...(inScene && showAxes
      ? options.axisCandidates.map((candidate) =>
          gizmoLine(
            options,
            `${prefix}-axis-${candidate.id}`,
            AXIS_LINE_FILL,
            options.axisWidthPx,
            (frame) => {
              const axis = frame.axes.find(
                (entry) => entry.candidate.id === candidate.id
              );
              const up = axis?.arrows.up?.baseCenter;
              const down = axis?.arrows.down?.baseCenter;
              return up && down ? [down, up] : HIDDEN;
            }
          )
        )
      : []),
    ...(inScene && showDisc
      ? [
          gizmoLine(
            options,
            `${prefix}-disc-outline`,
            DISC_OUTLINE_COLOR,
            AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
            ({ origin, activeOutline }) =>
              activeOutline?.worldRadius !== undefined &&
              activeOutline.planeBasisX &&
              activeOutline.planeBasisY
                ? circlePositions(
                    origin,
                    activeOutline.planeBasisX,
                    activeOutline.planeBasisY,
                    activeOutline.worldRadius,
                    activeOutline.segments ?? options.discSegments
                  )
                : HIDDEN
          ),
        ]
      : []),
    ...(inScene && showDisc && showRotationHandle
      ? [
          gizmoLine(
            options,
            `${prefix}-rotation-handle-outline`,
            DISC_OUTLINE_COLOR,
            AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
            ({ rotationHandle, activeOutline }) =>
              rotationHandle?.centerECEF &&
              rotationHandle.worldRadius !== null &&
              activeOutline?.planeBasisX &&
              activeOutline.planeBasisY
                ? circlePositions(
                    rotationHandle.centerECEF,
                    activeOutline.planeBasisX,
                    activeOutline.planeBasisY,
                    rotationHandle.worldRadius,
                    options.discSegments
                  )
                : HIDDEN
          ),
        ]
      : []),
  ];
};

/** The solid scene parts: the disc fill, and in the scene the arrow cones and the handle fill. */
export const buildPointMoveGizmoScenePrimitives = (
  options: PointMoveGizmoSceneModelOptions
): ScenePrimitiveModel[] => {
  const prefix = `point-move-${options.pointId}`;
  const { inScene, showAxes, showDisc, showRotationHandle, readFrame } =
    options;
  const discMatrix = new Matrix4();
  const disc: ScenePrimitiveModel = {
    id: `${prefix}-disc`,
    signature: `ring:${inScene}:${options.discSegments}`,
    create: (engine, modelMatrix) =>
      engine.createRing({
        id: `${prefix}-disc`,
        radius: 1,
        innerRadius: 0.5,
        color: DISC_FILL_COLOR,
        opacity: DISC_FILL_OPACITY,
        segments: options.discSegments,
        modelMatrix,
        occludable: inScene,
      }),
    place: () => {
      const frame = readFrame();
      return frame
        ? createOrientedDiscMatrix(
            frame.origin,
            frame.discPlaneNormal,
            frame.discWorldRadius,
            discMatrix
          )
        : null;
    },
  };
  const arrows = options.axisCandidates.flatMap((candidate) =>
    ARROW_SIDES.map((side): ScenePrimitiveModel => {
      const id = `${prefix}-arrow-${candidate.id}-${side}`;
      const color = candidate.color ?? SECONDARY_AXIS_COLOR;
      const matrix = new Matrix4();
      return {
        id,
        signature: `cone:${color}`,
        create: (engine, modelMatrix) =>
          engine.createCone?.({
            id,
            color,
            outlineColor: ARROW_OUTLINE_STROKE,
            outlineWidth: AXIS_AND_DISC_OUTLINE_STROKE_WIDTH_PX,
            modelMatrix,
          }) ?? null,
        place: () => {
          const geometry = readFrame()?.axes.find(
            (axis) => axis.candidate.id === candidate.id
          )?.arrows[side];
          return geometry ? createConeArrowMatrix(geometry, matrix) : null;
        },
      };
    })
  );
  // One fill per axis colour; the active axis shows its own.
  const handles = options.axisCandidates.map(
    (candidate): ScenePrimitiveModel => {
      const id = `${prefix}-rotation-handle-${candidate.id}`;
      const color = candidate.color ?? DISC_OUTLINE_COLOR;
      const matrix = new Matrix4();
      return {
        id,
        signature: `disc:${color}:${options.discSegments}`,
        create: (engine, modelMatrix) =>
          engine.createDisc({
            id,
            radius: 1,
            color,
            segments: options.discSegments,
            modelMatrix,
            occludable: true,
          }),
        place: () => {
          const frame = readFrame();
          const handle = frame?.rotationHandle;
          return frame?.activeAxis?.id === candidate.id &&
            handle?.centerECEF &&
            handle.worldRadius !== null
            ? createOrientedDiscMatrix(
                handle.centerECEF,
                handle.normal,
                handle.worldRadius,
                matrix
              )
            : null;
        },
      };
    }
  );
  return [
    ...(showDisc ? [disc] : []),
    ...(inScene && showAxes ? arrows : []),
    ...(inScene && showDisc && showRotationHandle ? handles : []),
  ];
};
