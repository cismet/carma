/* @refresh reset */
import { createElement, useEffect, useMemo, useRef } from "react";

import {
  BoundingSphere,
  Cartesian3,
  Color,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma/cesium";
import {
  createLineVisualizer,
  type LineVisualizer,
} from "@carma-mapping/engines/cesium/legacy";
import {
  useLabelOverlay,
  useLineVisualizers,
  type LineVisualizerData,
} from "@carma-providers/label-overlay";

import {
  type PointDistanceRelation,
  type PointMeasurementEntry,
  type ReferenceLineLabelKind,
} from "../types/MeasurementTypes";
import { formatNumber } from "../utils/formatting";

export type CesiumDistanceVisualizerOptions = {
  distanceRelations?: PointDistanceRelation[];
  onDistanceLineLabelToggle?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  lineLabelMinDistancePx?: number;
  onDistanceRelationCornerClick?: (relationId: string) => void;
};

const REFERENCE_LINE_EPSILON_METERS = 0.001;
// EN component color: light mix of the standard East (red) and North (green) axis colors.
const REFERENCE_COMPONENT_HORIZONTAL_COLOR = "rgba(188, 194, 102, 0.95)";
// U component color: lighter blue for better readability and a softer look.
const REFERENCE_COMPONENT_VERTICAL_COLOR = "rgba(111, 168, 255, 0.96)";
const REFERENCE_COMPONENT_ARC_COLOR = "rgba(246, 248, 255, 0.95)";
const REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX = 1.25;
const CORNER_OVERLAY_ID_PREFIX = "distance-right-angle-corner";
const CORNER_OVERLAY_MIN_BOX_PX = 20;
const CORNER_OVERLAY_PADDING_PX = 6;
const CORNER_OVERLAY_TARGET_RADIUS_PX = 20;
const CORNER_OVERLAY_DOT_RADIUS_PX =
  REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX / 2;
const CORNER_OVERLAY_SEGMENTS = 20;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const isDistanceRelationVerticalLineVisible = (
  relation: PointDistanceRelation
) => relation.showVerticalLine ?? relation.showComponentLines ?? false;

const isDistanceRelationHorizontalLineVisible = (
  relation: PointDistanceRelation
) => relation.showHorizontalLine ?? relation.showComponentLines ?? false;

const hasVisibleDistanceRelationComponentLines = (
  relation: PointDistanceRelation
) =>
  isDistanceRelationVerticalLineVisible(relation) &&
  isDistanceRelationHorizontalLineVisible(relation);

const destroyLineVisualizerMap = (lineRefs: {
  current: Record<string, LineVisualizer>;
}) => {
  Object.values(lineRefs.current).forEach((lineVisualizer) => {
    lineVisualizer.destroy();
  });
  lineRefs.current = {};
};

const getArcPointsInSpannedPlane = (
  auxiliaryPoint: Cartesian3,
  verticalTargetPoint: Cartesian3,
  horizontalTargetPoint: Cartesian3,
  arcRadiusMeters: number,
  segmentCount: number
): Cartesian3[] | null => {
  if (!Number.isFinite(arcRadiusMeters) || arcRadiusMeters <= 0) return null;

  const verticalVector = Cartesian3.subtract(
    verticalTargetPoint,
    auxiliaryPoint,
    new Cartesian3()
  );
  const horizontalVector = Cartesian3.subtract(
    horizontalTargetPoint,
    auxiliaryPoint,
    new Cartesian3()
  );
  const verticalLength = Cartesian3.magnitude(verticalVector);
  const horizontalLength = Cartesian3.magnitude(horizontalVector);

  if (verticalLength <= REFERENCE_LINE_EPSILON_METERS) return null;
  if (horizontalLength <= REFERENCE_LINE_EPSILON_METERS) return null;

  const verticalDirection = Cartesian3.normalize(
    verticalVector,
    new Cartesian3()
  );
  const horizontalDirectionRaw = Cartesian3.normalize(
    horizontalVector,
    new Cartesian3()
  );
  const dot = clamp(
    Cartesian3.dot(verticalDirection, horizontalDirectionRaw),
    -1,
    1
  );
  const angleRad = Math.acos(dot);
  if (!Number.isFinite(angleRad) || angleRad <= 1e-3) return null;

  const horizontalOrthogonal = Cartesian3.subtract(
    horizontalDirectionRaw,
    Cartesian3.multiplyByScalar(verticalDirection, dot, new Cartesian3()),
    new Cartesian3()
  );
  if (Cartesian3.magnitude(horizontalOrthogonal) <= 1e-5) return null;

  const horizontalDirection = Cartesian3.normalize(
    horizontalOrthogonal,
    new Cartesian3()
  );
  const safeRadius = Math.min(
    arcRadiusMeters,
    verticalLength * 0.999,
    horizontalLength * 0.999
  );
  if (safeRadius <= REFERENCE_LINE_EPSILON_METERS) return null;

  const points: Cartesian3[] = [];
  const segments = Math.max(8, segmentCount);
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const theta = angleRad * t;
    const direction = Cartesian3.add(
      Cartesian3.multiplyByScalar(
        verticalDirection,
        Math.cos(theta),
        new Cartesian3()
      ),
      Cartesian3.multiplyByScalar(
        horizontalDirection,
        Math.sin(theta),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    const normalizedDirection = Cartesian3.normalize(
      direction,
      new Cartesian3()
    );
    points.push(
      Cartesian3.add(
        auxiliaryPoint,
        Cartesian3.multiplyByScalar(
          normalizedDirection,
          safeRadius,
          new Cartesian3()
        ),
        new Cartesian3()
      )
    );
  }

  return points.length >= 2 ? points : null;
};

type ResolvedDistanceRelation = {
  relation: PointDistanceRelation;
  pointA: PointMeasurementEntry;
  pointB: PointMeasurementEntry;
  anchorPoint: PointMeasurementEntry;
  targetPoint: PointMeasurementEntry;
  auxiliaryPoint: Cartesian3;
};

const resolveDistanceRelation = (
  relation: PointDistanceRelation,
  pointsById: Map<string, PointMeasurementEntry>
): ResolvedDistanceRelation | null => {
  const pointA = pointsById.get(relation.pointAId);
  const pointB = pointsById.get(relation.pointBId);
  if (!pointA || !pointB) return null;
  if (
    Cartesian3.distance(pointA.geometryECEF, pointB.geometryECEF) <=
    REFERENCE_LINE_EPSILON_METERS
  ) {
    return null;
  }

  const anchorPoint =
    relation.anchorPointId === pointB.id || relation.anchorPointId === pointA.id
      ? relation.anchorPointId === pointB.id
        ? pointB
        : pointA
      : pointA;
  const targetPoint = anchorPoint.id === pointA.id ? pointB : pointA;
  const auxiliaryPoint = Cartesian3.fromDegrees(
    anchorPoint.geometryWGS84.longitude,
    anchorPoint.geometryWGS84.latitude,
    targetPoint.geometryWGS84.height
  );

  return {
    relation,
    pointA,
    pointB,
    anchorPoint,
    targetPoint,
    auxiliaryPoint,
  };
};

export const useCesiumDistanceVisualizer = (
  scene: Scene | null,
  points: PointMeasurementEntry[],
  {
    distanceRelations = [],
    onDistanceLineLabelToggle,
    lineLabelMinDistancePx = 50,
    onDistanceRelationCornerClick,
  }: CesiumDistanceVisualizerOptions
) => {
  const directLineRefs = useRef<Record<string, LineVisualizer>>({});
  const verticalLineRefs = useRef<Record<string, LineVisualizer>>({});
  const horizontalLineRefs = useRef<Record<string, LineVisualizer>>({});
  const cornerOverlayIdsRef = useRef<string[]>([]);

  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const pointsById = useMemo(() => {
    const map = new Map<string, PointMeasurementEntry>();
    points.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [points]);

  const resolvedRelations = useMemo(
    () =>
      distanceRelations
        .map((relation) => resolveDistanceRelation(relation, pointsById))
        .filter((relation): relation is ResolvedDistanceRelation =>
          Boolean(relation)
        ),
    [distanceRelations, pointsById]
  );

  const overlayLines = useMemo(() => {
    if (!scene || scene.isDestroyed()) {
      return [];
    }

    const lines: LineVisualizerData[] = [];

    resolvedRelations.forEach(
      ({
        relation,
        pointA,
        pointB,
        anchorPoint,
        targetPoint,
        auxiliaryPoint,
      }) => {
        if (relation.showDirectLine) {
          lines.push({
            id: `reference-direct-${relation.id}`,
            getCanvasLine: () => {
              if (!scene || scene.isDestroyed()) return null;

              const start = SceneTransforms.worldToWindowCoordinates(
                scene,
                pointA.geometryECEF
              );
              const end = SceneTransforms.worldToWindowCoordinates(
                scene,
                pointB.geometryECEF
              );

              if (!defined(start) || !defined(end)) return null;
              return {
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
              };
            },
            stroke: "rgba(255, 255, 255, 0.9)",
            strokeWidth: 1.5,
            strokeDasharray: "6 4",
            hitTargetStrokeWidth: 10,
            labelText:
              relation.labelVisibilityByKind?.direct ?? true
                ? `${formatNumber(
                    Cartesian3.distance(
                      pointA.geometryECEF,
                      pointB.geometryECEF
                    )
                  )} m`
                : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: lineLabelMinDistancePx,
            onLineClick: () =>
              onDistanceLineLabelToggle?.(relation.id, "direct"),
          });
        }

        if (isDistanceRelationVerticalLineVisible(relation)) {
          lines.push({
            id: `reference-vertical-${relation.id}`,
            getCanvasLine: () => {
              if (!scene || scene.isDestroyed()) return null;

              const start = SceneTransforms.worldToWindowCoordinates(
                scene,
                anchorPoint.geometryECEF
              );
              const end = SceneTransforms.worldToWindowCoordinates(
                scene,
                auxiliaryPoint
              );

              if (!defined(start) || !defined(end)) return null;
              return {
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
              };
            },
            stroke: REFERENCE_COMPONENT_VERTICAL_COLOR,
            strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
            strokeDasharray: "6 4",
            hitTargetStrokeWidth: 10,
            labelText:
              relation.labelVisibilityByKind?.vertical ?? true
                ? `${formatNumber(
                    Cartesian3.distance(
                      anchorPoint.geometryECEF,
                      auxiliaryPoint
                    )
                  )} m`
                : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: lineLabelMinDistancePx,
            onLineClick: () =>
              onDistanceLineLabelToggle?.(relation.id, "vertical"),
          });
        }

        if (isDistanceRelationHorizontalLineVisible(relation)) {
          lines.push({
            id: `reference-horizontal-${relation.id}`,
            getCanvasLine: () => {
              if (!scene || scene.isDestroyed()) return null;

              const start = SceneTransforms.worldToWindowCoordinates(
                scene,
                auxiliaryPoint
              );
              const end = SceneTransforms.worldToWindowCoordinates(
                scene,
                targetPoint.geometryECEF
              );

              if (!defined(start) || !defined(end)) return null;
              return {
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
              };
            },
            stroke: REFERENCE_COMPONENT_HORIZONTAL_COLOR,
            strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
            strokeDasharray: "6 4",
            hitTargetStrokeWidth: 10,
            labelText:
              relation.labelVisibilityByKind?.horizontal ?? true
                ? `${formatNumber(
                    Cartesian3.distance(
                      auxiliaryPoint,
                      targetPoint.geometryECEF
                    )
                  )} m`
                : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: lineLabelMinDistancePx,
            onLineClick: () =>
              onDistanceLineLabelToggle?.(relation.id, "horizontal"),
          });
        }
      }
    );

    return lines;
  }, [
    lineLabelMinDistancePx,
    onDistanceLineLabelToggle,
    resolvedRelations,
    scene,
  ]);

  useLineVisualizers(overlayLines, overlayLines.length > 0);

  const rightAngleCornerContent = useMemo(
    () =>
      createElement(
        "svg",
        {
          width: "100%",
          height: "100%",
          style: {
            overflow: "visible",
            pointerEvents: "none",
          },
        },
        createElement("path", {
          "data-right-angle-corner-path": "true",
          fill: "none",
          stroke: REFERENCE_COMPONENT_ARC_COLOR,
          strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
        createElement("circle", {
          "data-right-angle-corner-dot": "true",
          r: CORNER_OVERLAY_DOT_RADIUS_PX,
          fill: REFERENCE_COMPONENT_ARC_COLOR,
        })
      ),
    []
  );

  useEffect(() => {
    cornerOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    cornerOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextCornerOverlayIds: string[] = [];

    resolvedRelations
      .filter(({ relation }) =>
        hasVisibleDistanceRelationComponentLines(relation)
      )
      .forEach(({ relation, anchorPoint, targetPoint, auxiliaryPoint }) => {
        const overlayId = `${CORNER_OVERLAY_ID_PREFIX}-${relation.id}`;

        addLabelOverlayElement({
          id: overlayId,
          content: rightAngleCornerContent,
          onClick: onDistanceRelationCornerClick
            ? () => onDistanceRelationCornerClick(relation.id)
            : undefined,
          updatePosition: (elementDiv) => {
            if (!scene || scene.isDestroyed()) return false;

            const auxiliaryPointScreen =
              SceneTransforms.worldToWindowCoordinates(scene, auxiliaryPoint);
            const verticalPointScreen =
              SceneTransforms.worldToWindowCoordinates(
                scene,
                anchorPoint.geometryECEF
              );
            const horizontalPointScreen =
              SceneTransforms.worldToWindowCoordinates(
                scene,
                targetPoint.geometryECEF
              );

            if (
              !defined(auxiliaryPointScreen) ||
              !defined(verticalPointScreen) ||
              !defined(horizontalPointScreen)
            ) {
              return false;
            }

            const verticalLengthMeters = Cartesian3.distance(
              anchorPoint.geometryECEF,
              auxiliaryPoint
            );
            const horizontalLengthMeters = Cartesian3.distance(
              auxiliaryPoint,
              targetPoint.geometryECEF
            );
            if (
              verticalLengthMeters <= REFERENCE_LINE_EPSILON_METERS ||
              horizontalLengthMeters <= REFERENCE_LINE_EPSILON_METERS
            ) {
              return false;
            }

            const drawingBufferWidth = scene.drawingBufferWidth;
            const drawingBufferHeight = scene.drawingBufferHeight;
            if (drawingBufferWidth <= 0 || drawingBufferHeight <= 0) {
              return false;
            }

            let metersPerPixel = Number.NaN;
            try {
              metersPerPixel = scene.camera.getPixelSize(
                new BoundingSphere(auxiliaryPoint, 1),
                drawingBufferWidth,
                drawingBufferHeight
              );
            } catch {
              metersPerPixel = Number.NaN;
            }

            if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
              const cameraDistanceMeters = Math.max(
                Cartesian3.distance(scene.camera.position, auxiliaryPoint),
                1
              );
              const fovRad =
                (scene.camera.frustum as { fov?: number }).fov ?? Math.PI / 3;
              metersPerPixel = Math.max(
                (cameraDistanceMeters * Math.tan(fovRad / 2) * 2) /
                  Math.max(drawingBufferHeight, 1),
                1e-6
              );
            }

            const arcRadiusPx = CORNER_OVERLAY_TARGET_RADIUS_PX;
            const arcRadiusMeters = arcRadiusPx * metersPerPixel;

            const arcPointsWorld = getArcPointsInSpannedPlane(
              auxiliaryPoint,
              anchorPoint.geometryECEF,
              targetPoint.geometryECEF,
              arcRadiusMeters,
              CORNER_OVERLAY_SEGMENTS
            );
            if (!arcPointsWorld || arcPointsWorld.length < 2) {
              return false;
            }

            const arcMidpointWorld =
              arcPointsWorld[Math.floor(arcPointsWorld.length / 2)];
            if (!arcMidpointWorld) return false;
            const dotWorld = Cartesian3.midpoint(
              auxiliaryPoint,
              arcMidpointWorld,
              new Cartesian3()
            );
            const dotScreen = SceneTransforms.worldToWindowCoordinates(
              scene,
              dotWorld
            );
            if (!defined(dotScreen)) return false;

            const arcPointsScreen = arcPointsWorld
              .map((worldPoint) =>
                SceneTransforms.worldToWindowCoordinates(scene, worldPoint)
              )
              .filter(defined);
            if (arcPointsScreen.length < 2) {
              return false;
            }

            const minX = Math.min(...arcPointsScreen.map((point) => point.x));
            const maxX = Math.max(...arcPointsScreen.map((point) => point.x));
            const minY = Math.min(...arcPointsScreen.map((point) => point.y));
            const maxY = Math.max(...arcPointsScreen.map((point) => point.y));
            const width = Math.max(
              CORNER_OVERLAY_MIN_BOX_PX,
              maxX - minX + CORNER_OVERLAY_PADDING_PX * 2
            );
            const height = Math.max(
              CORNER_OVERLAY_MIN_BOX_PX,
              maxY - minY + CORNER_OVERLAY_PADDING_PX * 2
            );

            const pathData = arcPointsScreen
              .map((point, index) => {
                const x = point.x - minX + CORNER_OVERLAY_PADDING_PX;
                const y = point.y - minY + CORNER_OVERLAY_PADDING_PX;
                return `${index === 0 ? "M" : "L"} ${x} ${y}`;
              })
              .join(" ");

            const pathEl = elementDiv.querySelector(
              '[data-right-angle-corner-path="true"]'
            ) as SVGPathElement | null;
            if (pathEl) {
              pathEl.setAttribute("d", pathData);
            }
            const dotEl = elementDiv.querySelector(
              '[data-right-angle-corner-dot="true"]'
            ) as SVGCircleElement | null;
            if (dotEl) {
              dotEl.setAttribute(
                "cx",
                `${dotScreen.x - minX + CORNER_OVERLAY_PADDING_PX}`
              );
              dotEl.setAttribute(
                "cy",
                `${dotScreen.y - minY + CORNER_OVERLAY_PADDING_PX}`
              );
            }

            elementDiv.style.position = "absolute";
            elementDiv.style.left = `${minX - CORNER_OVERLAY_PADDING_PX}px`;
            elementDiv.style.top = `${minY - CORNER_OVERLAY_PADDING_PX}px`;
            elementDiv.style.width = `${width}px`;
            elementDiv.style.height = `${height}px`;
            elementDiv.style.transform = "none";
            elementDiv.style.zIndex = "10";
            const isCornerClickable = Boolean(onDistanceRelationCornerClick);
            elementDiv.style.pointerEvents = isCornerClickable
              ? "auto"
              : "none";
            elementDiv.style.cursor = isCornerClickable ? "pointer" : "default";

            return true;
          },
        });

        nextCornerOverlayIds.push(overlayId);
      });

    cornerOverlayIdsRef.current = nextCornerOverlayIds;

    return () => {
      nextCornerOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      cornerOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    onDistanceRelationCornerClick,
    removeLabelOverlayElement,
    resolvedRelations,
    rightAngleCornerContent,
    scene,
  ]);

  const relationsWithDirectLine = useMemo(
    () => resolvedRelations.filter(({ relation }) => relation.showDirectLine),
    [resolvedRelations]
  );

  const relationsWithVerticalLine = useMemo(
    () =>
      resolvedRelations.filter(({ relation }) =>
        isDistanceRelationVerticalLineVisible(relation)
      ),
    [resolvedRelations]
  );

  const relationsWithHorizontalLine = useMemo(
    () =>
      resolvedRelations.filter(({ relation }) =>
        isDistanceRelationHorizontalLineVisible(relation)
      ),
    [resolvedRelations]
  );

  useEffect(() => {
    if (!scene) return;

    destroyLineVisualizerMap(directLineRefs);

    if (relationsWithDirectLine.length === 0) {
      scene.requestRender();
      return;
    }

    relationsWithDirectLine.forEach(({ relation, pointA, pointB }) => {
      const lineVisualizer = createLineVisualizer(
        `reference-line-${relation.id}`,
        {
          start: pointA.geometryECEF,
          end: pointB.geometryECEF,
          color: Color.WHITE,
          width: 1,
          dashed: false,
        }
      );
      directLineRefs.current[relation.id] = lineVisualizer;
      lineVisualizer.attach(scene, () => scene.requestRender());
    });
    scene.requestRender();

    return () => {
      destroyLineVisualizerMap(directLineRefs);
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [relationsWithDirectLine, scene]);

  useEffect(() => {
    if (!scene) return;

    destroyLineVisualizerMap(verticalLineRefs);
    destroyLineVisualizerMap(horizontalLineRefs);

    if (
      relationsWithVerticalLine.length === 0 &&
      relationsWithHorizontalLine.length === 0
    ) {
      scene.requestRender();
      return;
    }

    relationsWithVerticalLine.forEach(
      ({ relation, anchorPoint, auxiliaryPoint }) => {
        const verticalLineVisualizer = createLineVisualizer(
          `reference-vertical-line-${relation.id}`,
          {
            start: anchorPoint.geometryECEF,
            end: auxiliaryPoint,
            color: Color.fromCssColorString(REFERENCE_COMPONENT_VERTICAL_COLOR),
            width: 1,
            dashed: false,
          }
        );
        verticalLineRefs.current[relation.id] = verticalLineVisualizer;
        verticalLineVisualizer.attach(scene, () => scene.requestRender());
      }
    );

    relationsWithHorizontalLine.forEach(
      ({ relation, targetPoint, auxiliaryPoint }) => {
        const horizontalLineVisualizer = createLineVisualizer(
          `reference-horizontal-line-${relation.id}`,
          {
            start: auxiliaryPoint,
            end: targetPoint.geometryECEF,
            color: Color.fromCssColorString(
              REFERENCE_COMPONENT_HORIZONTAL_COLOR
            ),
            width: 1,
            dashed: false,
          }
        );
        horizontalLineRefs.current[relation.id] = horizontalLineVisualizer;
        horizontalLineVisualizer.attach(scene, () => scene.requestRender());
      }
    );
    scene.requestRender();

    return () => {
      destroyLineVisualizerMap(verticalLineRefs);
      destroyLineVisualizerMap(horizontalLineRefs);
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [relationsWithHorizontalLine, relationsWithVerticalLine, scene]);

  useEffect(() => {
    return () => {
      cornerOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      cornerOverlayIdsRef.current = [];
      destroyLineVisualizerMap(directLineRefs);
      destroyLineVisualizerMap(verticalLineRefs);
      destroyLineVisualizerMap(horizontalLineRefs);
    };
  }, [removeLabelOverlayElement]);
};

export default useCesiumDistanceVisualizer;
