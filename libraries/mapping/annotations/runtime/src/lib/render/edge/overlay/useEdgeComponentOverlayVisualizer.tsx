/* @refresh reset */
import { createElement, useCallback, useEffect, useMemo, useRef } from "react";

import {
  BoundingSphere,
  Cartesian3,
  SceneTransforms,
  defined,
  getArcPointsInSpannedPlane,
  type Scene,
} from "@carma/cesium";
import { createSvgLineVisualizers } from "@carma-commons/svg";
import {
  buildDistanceTriangleInsidePoint2D,
  buildOutsideReferencePoint2D,
  buildDistanceRelationEdgeLabelOverlays,
  buildVerticalDistanceLineScreenData,
  buildVerticalLabelReferencePoint2D,
  type DistanceScreenTriangle,
  type PointAnnotationEntry,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
  getCustomPointAnnotationName,
  hasVisibleDistanceRelationComponentLines,
  isDistanceRelationHorizontalLineVisible,
  isDistanceRelationVerticalLineVisible,
  REFERENCE_LINE_EPSILON_METERS,
  resolveDistanceRelation,
  type ResolvedDistanceRelation,
  type DistanceRelationRenderContext,
} from "@carma-mapping/annotations/core";
import type { AnnotationPointMarkerBadge } from "../../../render/useRender";
import type { CssPixelPosition } from "@carma/units/types";
import {
  useLabelOverlay,
  useLineVisualizers,
  type LineVisualizerData,
} from "@carma-providers/label-overlay";
import { useCesiumOverlayView } from "@carma-mapping/engines/cesium/react/interactions";

import {
  applyMidpointMarkerOverlayLayout,
  applyRightAngleCornerOverlayLayout,
  MidpointMarkerOverlay,
  RightAngleCornerOverlay,
} from "./edgeOverlayDom";
import { useDistanceLabelVisualizer } from "../../labels/useDistanceLabelVisualizer";
import type { EdgeSceneLineRenderModel } from "../../scene/visualization.types";

export type EdgeComponentOverlayVisualizerOptions = {
  distanceRelations?: PointDistanceRelation[];
  onDistanceLineLabelToggle?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceLineClick?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceRelationMidpointClick?: (relationId: string) => void;
  lineLabelMinDistancePx?: number;
  onDistanceRelationCornerClick?: (relationId: string) => void;
  cumulativeDistanceByRelationId?: Readonly<Record<string, number>>;
  pointMarkerBadgeByPointId?: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
  previewEdges?: readonly EdgeSceneLineRenderModel[];
  distanceRelationRenderContext: DistanceRelationRenderContext;
  enabled?: boolean;
};

// EN component color: light mix of the standard East (red) and North (green) axis colors.
const REFERENCE_COMPONENT_HORIZONTAL_COLOR = "rgba(188, 194, 102, 0.95)";
// U component color: lighter blue for better readability and a softer look.
const REFERENCE_COMPONENT_VERTICAL_COLOR = "rgba(111, 168, 255, 0.96)";
const REFERENCE_COMPONENT_ARC_COLOR = "rgba(246, 248, 255, 0.95)";
const REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX = 1.25;
const CORNER_OVERLAY_ID_PREFIX = "distance-right-angle-corner";
const MIDPOINT_OVERLAY_ID_PREFIX = "distance-edge-midpoint";
const CORNER_OVERLAY_MIN_BOX_PX = 20;
const CORNER_OVERLAY_PADDING_PX = 6;
const CORNER_OVERLAY_TARGET_RADIUS_PX = 20;
const CORNER_OVERLAY_DOT_RADIUS_PX =
  REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX / 2;
const CORNER_OVERLAY_SEGMENTS = 20;
const MIDPOINT_MARKER_HIT_TARGET_PX = 14;
const MIDPOINT_MARKER_TICK_LENGTH_PX = 8;
const MIDPOINT_MARKER_TICK_WIDTH_PX = 1.25;
const LABEL_REFERENCE_MIN_DISTANCE_PX = 24;
const LABEL_REFERENCE_MAX_DISTANCE_PX = 48;
const LABEL_INSIDE_BLEND_FACTOR = 0.35;
const VERTICAL_LABEL_SIDE_SWITCH_THRESHOLD_PX = 4;

export const useEdgeComponentOverlayVisualizer = (
  scene: Scene | null,
  points: readonly PointAnnotationEntry[],
  {
    distanceRelations = [],
    onDistanceLineLabelToggle,
    onDistanceLineClick,
    onDistanceRelationMidpointClick,
    lineLabelMinDistancePx = 50,
    onDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    previewEdges = [],
    distanceRelationRenderContext,
    enabled = true,
  }: EdgeComponentOverlayVisualizerOptions
) => {
  const cornerOverlayIdsRef = useRef<string[]>([]);
  const midpointOverlayIdsRef = useRef<string[]>([]);
  const verticalLabelSideByRelationIdRef = useRef<Record<string, -1 | 1>>({});
  const overlayView = useCesiumOverlayView(scene);
  const cameraPitch = overlayView.derivedView?.pitch ?? 0;

  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const pointsById = useMemo(() => {
    const map = new Map<string, PointAnnotationEntry>();
    points.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [points]);
  const enclosedPointLabelById = useMemo(() => {
    const labelById: Record<string, string> = {};
    points.forEach((point, index) => {
      labelById[point.id] =
        getCustomPointAnnotationName(point.name) ??
        pointMarkerBadgeByPointId?.[point.id]?.text ??
        `${index + 1}`;
    });
    return labelById;
  }, [pointMarkerBadgeByPointId, points]);
  const defaultPointLabelById = useMemo(() => {
    const labelById: Record<string, string> = {};
    points.forEach((point, index) => {
      labelById[point.id] =
        pointMarkerBadgeByPointId?.[point.id]?.text ?? `${index + 1}`;
    });
    return labelById;
  }, [pointMarkerBadgeByPointId, points]);

  const splitMarkerRelationIdSet =
    distanceRelationRenderContext.polygonEdgeRelationIds;
  const planarPolygonSharedEdgeRelationIdSet =
    distanceRelationRenderContext.planarPolygonSharedEdgeRelationIds;
  const midpointTickRelationIdSet =
    distanceRelationRenderContext.midpointTickRelationIds;

  const edgeRelationOwnerGroupIdSet =
    distanceRelationRenderContext.focusedRelationIds;
  const selectedOrActiveOpenPolylineEdgeRelationIdSet =
    distanceRelationRenderContext.selectedOrActiveOpenPolylineRelationIds;
  const duplicateVerticalOpposingEdgeRelationIdSet =
    distanceRelationRenderContext.duplicateVerticalOpposingRelationIds;

  const resolvedRelations = useMemo(
    () =>
      distanceRelations
        .map((relation) => resolveDistanceRelation(relation, pointsById))
        .filter((relation): relation is ResolvedDistanceRelation =>
          Boolean(relation)
        ),
    [distanceRelations, pointsById]
  );

  useEffect(() => {
    const activeRelationIdSet = new Set(
      resolvedRelations.map(({ relation }) => relation.id)
    );
    Object.keys(verticalLabelSideByRelationIdRef.current).forEach(
      (relationId) => {
        if (!activeRelationIdSet.has(relationId)) {
          delete verticalLabelSideByRelationIdRef.current[relationId];
        }
      }
    );
  }, [resolvedRelations]);

  const distancePairLabelEntries = useMemo(
    () =>
      resolvedRelations
        .filter(
          ({ relation }) =>
            relation.showDirectLine &&
            !splitMarkerRelationIdSet.has(relation.id)
        )
        .map(({ relation, pointA, pointB }) => {
          const higherPoint =
            pointA.geometryWGS84.altitude >= pointB.geometryWGS84.altitude
              ? pointA
              : pointB;
          const lowerPoint = higherPoint.id === pointA.id ? pointB : pointA;
          const higherLabel = defaultPointLabelById[higherPoint.id];
          const lowerLabel = defaultPointLabelById[lowerPoint.id];
          if (!higherLabel || !lowerLabel) return null;
          if (higherLabel === lowerLabel) {
            // Avoid duplicate compact badges like "C" + "C" for the same
            // standalone distance component.
            return null;
          }

          return {
            relationId: relation.id,
            anchorPointId: higherPoint.id,
            text: `${higherLabel} ↔ ${lowerLabel}`,
            hasCompanionPointLabel: true,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            relationId: string;
            anchorPointId: string;
            text: string;
            hasCompanionPointLabel: boolean;
          } => Boolean(entry)
        ),
    [defaultPointLabelById, resolvedRelations, splitMarkerRelationIdSet]
  );

  const distancePairLabelObstacles = useMemo(
    () =>
      points.map((point) => ({
        id: `point-label-obstacle-${point.id}`,
        anchorPointId: point.id,
        text: enclosedPointLabelById[point.id] ?? "",
      })),
    [enclosedPointLabelById, points]
  );

  const resolvePointCanvasPositionById = useCallback(
    (pointId: string) => {
      if (!scene || scene.isDestroyed()) return null;
      const point = pointsById.get(pointId);
      if (!point) return null;
      const anchor = SceneTransforms.worldToWindowCoordinates(
        scene,
        point.geometryECEF
      );
      if (!defined(anchor)) return null;
      return { x: anchor.x, y: anchor.y } as CssPixelPosition;
    },
    [pointsById, scene]
  );

  const viewportWidth = Math.max(
    1,
    scene?.canvas.clientWidth || scene?.canvas.width || 1
  );
  const viewportHeight = Math.max(
    1,
    scene?.canvas.clientHeight || scene?.canvas.height || 1
  );

  useDistanceLabelVisualizer(enabled ? distancePairLabelEntries : [], {
    obstacles: enabled ? distancePairLabelObstacles : [],
    cameraPitch,
    viewportWidth,
    viewportHeight,
    resolveAnchorCanvasPosition: resolvePointCanvasPositionById,
    addLabelOverlayElement,
    removeLabelOverlayElement,
  });

  const overlayLines = useMemo(() => {
    if (!enabled) {
      return [];
    }
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
        const getWorldToScreen = (
          position: Cartesian3
        ): CssPixelPosition | null => {
          if (!scene || scene.isDestroyed()) return null;
          const p = SceneTransforms.worldToWindowCoordinates(scene, position);
          return defined(p) ? ({ x: p.x, y: p.y } as CssPixelPosition) : null;
        };
        const highestPoint =
          pointA.geometryWGS84.altitude >= pointB.geometryWGS84.altitude
            ? pointA
            : pointB;

        let cachedTriangleFrameNumber: number | null = null;
        let cachedTriangle: DistanceScreenTriangle | null = null;

        const getSceneFrameNumber = (): number | null => {
          const frameNumber = (
            scene as unknown as { frameState?: { frameNumber?: number } }
          ).frameState?.frameNumber;
          return typeof frameNumber === "number" ? frameNumber : null;
        };

        const computeScreenTriangle = (): DistanceScreenTriangle | null => {
          const anchor = getWorldToScreen(anchorPoint.geometryECEF);
          const target = getWorldToScreen(targetPoint.geometryECEF);
          const aux = getWorldToScreen(auxiliaryPoint);
          const highest = getWorldToScreen(highestPoint.geometryECEF);
          if (!anchor || !target || !aux || !highest) return null;
          return {
            anchor,
            target,
            aux,
            highest,
            centroid: {
              x: (anchor.x + target.x + aux.x) / 3,
              y: (anchor.y + target.y + aux.y) / 3,
            } as CssPixelPosition,
          };
        };

        const getScreenTriangle = (): DistanceScreenTriangle | null => {
          const frameNumber = getSceneFrameNumber();
          if (
            frameNumber !== null &&
            frameNumber === cachedTriangleFrameNumber
          ) {
            return cachedTriangle;
          }

          const triangle = computeScreenTriangle();
          if (frameNumber !== null) {
            cachedTriangleFrameNumber = frameNumber;
            cachedTriangle = triangle;
          }
          return triangle;
        };

        const getScreenAnchor = (): CssPixelPosition | null =>
          getScreenTriangle()?.anchor ?? null;
        const getScreenTarget = (): CssPixelPosition | null =>
          getScreenTriangle()?.target ?? null;
        const getScreenAux = (): CssPixelPosition | null =>
          getScreenTriangle()?.aux ?? null;

        const getStableInsidePointForDirectAndHorizontal =
          (): CssPixelPosition | null => {
            const triangle = getScreenTriangle();
            if (!triangle) return null;
            return buildDistanceTriangleInsidePoint2D({
              triangle,
              auxiliaryAltitudeMeters: targetPoint.geometryWGS84.altitude,
              highestAltitudeMeters: highestPoint.geometryWGS84.altitude,
              insideBlendFactor: LABEL_INSIDE_BLEND_FACTOR,
              elevationEpsilonMeters: REFERENCE_LINE_EPSILON_METERS,
            });
          };

        const getDirectLabelOutsideReferencePoint =
          (): CssPixelPosition | null => {
            const triangle = getScreenTriangle();
            const insidePoint = getStableInsidePointForDirectAndHorizontal();
            if (!triangle || !insidePoint) return null;
            return buildOutsideReferencePoint2D(
              triangle.anchor,
              triangle.target,
              insidePoint,
              LABEL_REFERENCE_MIN_DISTANCE_PX,
              LABEL_REFERENCE_MAX_DISTANCE_PX
            );
          };

        const getHorizontalLabelOutsideReferencePoint =
          (): CssPixelPosition | null => {
            const triangle = getScreenTriangle();
            const insidePoint = getStableInsidePointForDirectAndHorizontal();
            if (!triangle || !insidePoint) return null;
            return buildOutsideReferencePoint2D(
              triangle.aux,
              triangle.target,
              insidePoint,
              LABEL_REFERENCE_MIN_DISTANCE_PX,
              LABEL_REFERENCE_MAX_DISTANCE_PX
            );
          };

        const getVerticalLineScreenData = (): {
          start: CssPixelPosition;
          end: CssPixelPosition;
          insideSign: -1 | 1;
          midX: number;
          midY: number;
          normalX: number;
          normalY: number;
          lineLength: number;
        } | null => {
          const triangle = getScreenTriangle();
          if (!triangle) return null;
          const edgeData = buildVerticalDistanceLineScreenData({
            triangle,
            previousInsideSign:
              verticalLabelSideByRelationIdRef.current[relation.id],
            flipThresholdPx: VERTICAL_LABEL_SIDE_SWITCH_THRESHOLD_PX,
          });
          if (!edgeData) return null;
          verticalLabelSideByRelationIdRef.current[relation.id] =
            edgeData.insideSign;
          return edgeData;
        };

        const getVerticalLabelOutsideReferencePoint =
          (): CssPixelPosition | null => {
            const edge = getVerticalLineScreenData();
            if (!edge) return null;
            return buildVerticalLabelReferencePoint2D(
              edge,
              LABEL_REFERENCE_MIN_DISTANCE_PX,
              LABEL_REFERENCE_MAX_DISTANCE_PX
            );
          };

        const verticalDistanceMeters = Cartesian3.distance(
          anchorPoint.geometryECEF,
          auxiliaryPoint
        );
        const horizontalDistanceMeters = Cartesian3.distance(
          auxiliaryPoint,
          targetPoint.geometryECEF
        );
        const isPolygonEdgeRelation = splitMarkerRelationIdSet.has(relation.id);
        const isSelectedOrActiveEdgeRelation =
          edgeRelationOwnerGroupIdSet.has(relation.id) ||
          selectedOrActiveOpenPolylineEdgeRelationIdSet.has(relation.id);
        const segmentDistanceMeters = Cartesian3.distance(
          pointA.geometryECEF,
          pointB.geometryECEF
        );
        const edgeLabelOverlays = buildDistanceRelationEdgeLabelOverlays({
          relation,
          segmentDistanceMeters,
          cumulativeDistanceMeters:
            cumulativeDistanceByRelationId?.[relation.id] ??
            segmentDistanceMeters,
          verticalDistanceMeters,
          horizontalDistanceMeters,
          lineLabelMinDistancePx,
          isPolygonEdgeRelation,
          isSelectedOrActiveEdgeRelation,
          isSharedPlanarPolygonEdge: planarPolygonSharedEdgeRelationIdSet.has(
            relation.id
          ),
          isDuplicateVerticalOpposingEdgeRelation:
            duplicateVerticalOpposingEdgeRelationIdSet.has(relation.id),
        });

        if (relation.showDirectLine) {
          const onDirectLineClick = onDistanceLineClick
            ? () => onDistanceLineClick(relation.id, "direct")
            : undefined;
          const onDirectLabelClick = onDistanceLineLabelToggle
            ? () => onDistanceLineLabelToggle(relation.id, "direct")
            : undefined;
          lines.push(
            ...createSvgLineVisualizers({
              id: `reference-direct-${relation.id}`,
              getSvgLine: () => {
                const start = getScreenAnchor();
                const end = getScreenTarget();
                if (!start || !end) return null;
                return { start, end };
              },
              getLabelOutsideReferencePoint:
                getDirectLabelOutsideReferencePoint,
              stroke: "rgba(255, 255, 255, 0.9)",
              strokeWidth: 1.5,
              dashed: true,
              hitTargetStrokeWidth: 10,
              ...edgeLabelOverlays.direct,
              onLineClick: onDirectLineClick,
              onLabelClick: onDirectLabelClick,
            })
          );
        }

        if (isDistanceRelationVerticalLineVisible(relation)) {
          const onVerticalLineClick = onDistanceLineLabelToggle
            ? () => onDistanceLineLabelToggle(relation.id, "vertical")
            : undefined;
          lines.push(
            ...createSvgLineVisualizers({
              id: `reference-vertical-${relation.id}`,
              getSvgLine: () => {
                const edge = getVerticalLineScreenData();
                if (!edge) return null;
                return { start: edge.start, end: edge.end };
              },
              getLabelOutsideReferencePoint:
                getVerticalLabelOutsideReferencePoint,
              stroke: REFERENCE_COMPONENT_VERTICAL_COLOR,
              strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
              dashed: true,
              hitTargetStrokeWidth: 10,
              ...edgeLabelOverlays.vertical,
              onLineClick: onVerticalLineClick,
            })
          );
        }

        if (isDistanceRelationHorizontalLineVisible(relation)) {
          const onHorizontalLineClick = onDistanceLineLabelToggle
            ? () => onDistanceLineLabelToggle(relation.id, "horizontal")
            : undefined;
          lines.push(
            ...createSvgLineVisualizers({
              id: `reference-horizontal-${relation.id}`,
              getSvgLine: () => {
                const start = getScreenAux();
                const end = getScreenTarget();
                if (!start || !end) return null;
                return { start, end };
              },
              getLabelOutsideReferencePoint:
                getHorizontalLabelOutsideReferencePoint,
              stroke: REFERENCE_COMPONENT_HORIZONTAL_COLOR,
              strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
              dashed: true,
              hitTargetStrokeWidth: 10,
              ...edgeLabelOverlays.horizontal,
              onLineClick: onHorizontalLineClick,
            })
          );
        }
      }
    );

    previewEdges.forEach((edge) => {
      lines.push(
        ...createSvgLineVisualizers({
          id: `preview-edge-${edge.id}`,
          getSvgLine: () => {
            if (!scene || scene.isDestroyed()) return null;
            const start = SceneTransforms.worldToWindowCoordinates(
              scene,
              edge.start
            );
            const end = SceneTransforms.worldToWindowCoordinates(
              scene,
              edge.end
            );
            if (!defined(start) || !defined(end)) return null;
            return {
              start: { x: start.x, y: start.y } as CssPixelPosition,
              end: { x: end.x, y: end.y } as CssPixelPosition,
            };
          },
          stroke: edge.stroke,
          strokeWidth: edge.strokeWidth,
          dashed: edge.dashed ?? false,
          hitTargetStrokeWidth: 10,
        })
      );
    });

    return lines;
  }, [
    lineLabelMinDistancePx,
    onDistanceLineLabelToggle,
    onDistanceLineClick,
    cumulativeDistanceByRelationId,
    planarPolygonSharedEdgeRelationIdSet,
    duplicateVerticalOpposingEdgeRelationIdSet,
    previewEdges,
    resolvedRelations,
    scene,
    edgeRelationOwnerGroupIdSet,
    selectedOrActiveOpenPolylineEdgeRelationIdSet,
    splitMarkerRelationIdSet,
    enabled,
  ]);

  useLineVisualizers(overlayLines, enabled && overlayLines.length > 0);

  const rightAngleCornerContent = useMemo(
    () =>
      createElement(RightAngleCornerOverlay, {
        strokeColor: REFERENCE_COMPONENT_ARC_COLOR,
        strokeWidthPx: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
        dotRadiusPx: CORNER_OVERLAY_DOT_RADIUS_PX,
      }),
    []
  );

  useEffect(() => {
    cornerOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    cornerOverlayIdsRef.current = [];

    if (!enabled) {
      return;
    }

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
            const isCornerClickable = Boolean(onDistanceRelationCornerClick);

            applyRightAngleCornerOverlayLayout({
              elementDiv,
              pathData,
              dotScreen: {
                x: dotScreen.x,
                y: dotScreen.y,
              } as CssPixelPosition,
              minX,
              minY,
              width,
              height,
              paddingPx: CORNER_OVERLAY_PADDING_PX,
              clickable: isCornerClickable,
            });

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
    enabled,
    scene,
  ]);

  const midpointMarkerContent = useMemo(
    () =>
      createElement(MidpointMarkerOverlay, {
        tickLengthPx: MIDPOINT_MARKER_TICK_LENGTH_PX,
        tickWidthPx: MIDPOINT_MARKER_TICK_WIDTH_PX,
        tickColor: "rgba(255, 255, 255, 0.95)",
      }),
    []
  );

  useEffect(() => {
    midpointOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    midpointOverlayIdsRef.current = [];

    if (!enabled) {
      return;
    }

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextMidpointOverlayIds: string[] = [];

    resolvedRelations
      .filter(({ relation }) => {
        if (midpointTickRelationIdSet.size === 0) {
          return false;
        }
        if (!relation.showDirectLine) return false;
        return midpointTickRelationIdSet.has(relation.id);
      })
      .forEach(({ relation, pointA, pointB }) => {
        const overlayId = `${MIDPOINT_OVERLAY_ID_PREFIX}-${relation.id}`;
        addLabelOverlayElement({
          id: overlayId,
          zIndex: 11,
          content: midpointMarkerContent,
          onClick: onDistanceRelationMidpointClick
            ? () => onDistanceRelationMidpointClick(relation.id)
            : undefined,
          updatePosition: (elementDiv) => {
            if (!scene || scene.isDestroyed()) return false;
            const start = SceneTransforms.worldToWindowCoordinates(
              scene,
              pointA.geometryECEF
            );
            const end = SceneTransforms.worldToWindowCoordinates(
              scene,
              pointB.geometryECEF
            );
            if (!defined(start) || !defined(end)) return false;

            const midpointWorld = Cartesian3.midpoint(
              pointA.geometryECEF,
              pointB.geometryECEF,
              new Cartesian3()
            );
            const center = SceneTransforms.worldToWindowCoordinates(
              scene,
              midpointWorld
            );
            if (!defined(center)) return false;
            const angleDeg =
              (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI +
              90;
            applyMidpointMarkerOverlayLayout({
              elementDiv,
              center: { x: center.x, y: center.y } as CssPixelPosition,
              angleDeg,
              hitTargetPx: MIDPOINT_MARKER_HIT_TARGET_PX,
              clickable: Boolean(onDistanceRelationMidpointClick),
            });
            return true;
          },
        });
        nextMidpointOverlayIds.push(overlayId);
      });

    midpointOverlayIdsRef.current = nextMidpointOverlayIds;

    return () => {
      nextMidpointOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      midpointOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    midpointMarkerContent,
    onDistanceRelationMidpointClick,
    removeLabelOverlayElement,
    resolvedRelations,
    enabled,
    scene,
    midpointTickRelationIdSet,
  ]);

  useEffect(() => {
    return () => {
      cornerOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      cornerOverlayIdsRef.current = [];
      midpointOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      midpointOverlayIdsRef.current = [];
    };
  }, [removeLabelOverlayElement]);
};

export default useEdgeComponentOverlayVisualizer;
