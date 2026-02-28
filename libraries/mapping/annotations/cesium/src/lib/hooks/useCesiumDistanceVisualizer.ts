/* @refresh reset */
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BoundingSphere,
  Cartesian3,
  Color,
  SceneTransforms,
  defined,
  getDegreesFromCartesian,
  type Scene,
} from "@carma/cesium";
import {
  applyMidpointMarkerOverlayLayout,
  hasVisibleDistanceRelationComponentLines,
  isDistanceRelationHorizontalLineVisible,
  isDistanceRelationVerticalLineVisible,
  applyRightAngleCornerOverlayLayout,
  MidpointMarkerOverlay,
  RightAngleCornerOverlay,
  type ScreenPoint2D,
  useDistancePairLabelOverlays,
} from "@carma-mapping/annotations/core";
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
  type DirectLineLabelMode,
  type PointDistanceRelation,
  type PointAnnotationEntry,
  type ReferenceLineLabelKind,
} from "../types/AnnotationTypes";
import {
  REFERENCE_LINE_EPSILON_METERS,
  getArcPointsInSpannedPlane,
  resolveDistanceRelation,
  type ResolvedDistanceRelation,
} from "../utils/distanceVisualization";
import { formatNumber } from "../utils/formatting";
import { getCustomPointAnnotationName } from "../utils/annotationNaming";
import { type DistanceRelationRenderContext } from "./annotationVisualizationContext";

export type CesiumDistanceVisualizerOptions = {
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
    Record<
      string,
      {
        text: string;
        backgroundColor?: string;
        textColor?: string;
      }
    >
  >;
  livePreviewDistanceLine?: {
    anchorPointECEF: Cartesian3;
    targetPointECEF: Cartesian3;
    showDirectLine: boolean;
    showVerticalLine: boolean;
    showHorizontalLine: boolean;
  } | null;
  distanceRelationRenderContext: DistanceRelationRenderContext;
  renderDomVisuals?: boolean;
  renderCesiumCoreVisuals?: boolean;
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
const VERTICAL_COMPONENT_LABEL_OFFSET_PX = 8;
const VERTICAL_LABEL_SIDE_SWITCH_THRESHOLD_PX = 4;

const clampToRange = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const resolveStableSideSign = (
  signedDistance: number,
  previousSign: -1 | 1 | undefined,
  flipThresholdPx = VERTICAL_LABEL_SIDE_SWITCH_THRESHOLD_PX
): -1 | 1 => {
  if (!Number.isFinite(signedDistance)) return previousSign ?? 1;
  const nextSign: -1 | 1 = signedDistance >= 0 ? 1 : -1;
  if (!previousSign || previousSign === nextSign) return nextSign;
  if (Math.abs(signedDistance) < flipThresholdPx) return previousSign;
  return nextSign;
};

const destroyLineVisualizerMap = (lineRefs: {
  current: Record<string, LineVisualizer>;
}) => {
  Object.values(lineRefs.current).forEach((lineVisualizer) => {
    lineVisualizer.destroy();
  });
  lineRefs.current = {};
};

const destroyLineVisualizerRef = (lineRef: {
  current: LineVisualizer | null;
}) => {
  if (!lineRef.current) return;
  lineRef.current.destroy();
  lineRef.current = null;
};

export const useCesiumDistanceVisualizer = (
  scene: Scene | null,
  points: PointAnnotationEntry[],
  {
    distanceRelations = [],
    onDistanceLineLabelToggle,
    onDistanceLineClick,
    onDistanceRelationMidpointClick,
    lineLabelMinDistancePx = 50,
    onDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    livePreviewDistanceLine = null,
    distanceRelationRenderContext,
    renderDomVisuals = false,
    renderCesiumCoreVisuals = true,
  }: CesiumDistanceVisualizerOptions
) => {
  const directLineRefs = useRef<Record<string, LineVisualizer>>({});
  const verticalLineRefs = useRef<Record<string, LineVisualizer>>({});
  const horizontalLineRefs = useRef<Record<string, LineVisualizer>>({});
  const previewDirectLineRef = useRef<LineVisualizer | null>(null);
  const previewVerticalLineRef = useRef<LineVisualizer | null>(null);
  const previewHorizontalLineRef = useRef<LineVisualizer | null>(null);
  const cornerOverlayIdsRef = useRef<string[]>([]);
  const midpointOverlayIdsRef = useRef<string[]>([]);
  const verticalLabelSideByRelationIdRef = useRef<Record<string, -1 | 1>>({});
  const previewVerticalLabelSideRef = useRef<-1 | 1>(1);
  const [cameraPitch, setCameraPitch] = useState(-Math.PI / 4);

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

  useEffect(() => {
    if (livePreviewDistanceLine) return;
    previewVerticalLabelSideRef.current = 1;
  }, [livePreviewDistanceLine]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    const camera = scene.camera;

    const updatePitch = () => {
      const nextPitch = camera.pitch;
      setCameraPitch((prev) =>
        Math.abs(nextPitch - prev) > 0.001 ? nextPitch : prev
      );
    };

    updatePitch();
    const removeChangedListener = camera.changed.addEventListener(updatePitch);
    const removeMoveEndListener = camera.moveEnd.addEventListener(updatePitch);

    return () => {
      removeChangedListener?.();
      removeMoveEndListener?.();
    };
  }, [scene]);

  const edgeRelationOwnerGroupIdSet =
    distanceRelationRenderContext.focusedRelationIds;
  const selectedOrActiveOpenPolylineEdgeRelationIdSet =
    distanceRelationRenderContext.selectedOrActiveOpenPolylineRelationIds;
  const duplicateFacadeOpposingEdgeRelationIdSet =
    distanceRelationRenderContext.duplicateFacadeOpposingRelationIds;

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
            pointA.geometryWGS84.height >= pointB.geometryWGS84.height
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
            hasCompanionPointLabel: !higherPoint.distanceAdhocNode,
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
      return { x: anchor.x, y: anchor.y };
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

  useDistancePairLabelOverlays({
    entries: renderDomVisuals ? distancePairLabelEntries : [],
    obstacles: renderDomVisuals ? distancePairLabelObstacles : [],
    cameraPitch,
    viewportWidth,
    viewportHeight,
    resolveAnchorCanvasPosition: resolvePointCanvasPositionById,
    addLabelOverlayElement,
    removeLabelOverlayElement,
  });

  const overlayLines = useMemo(() => {
    if (!renderDomVisuals) {
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
        ): ScreenPoint2D | null => {
          if (!scene || scene.isDestroyed()) return null;
          const p = SceneTransforms.worldToWindowCoordinates(scene, position);
          return defined(p) ? { x: p.x, y: p.y } : null;
        };
        const highestPoint =
          pointA.geometryWGS84.height >= pointB.geometryWGS84.height
            ? pointA
            : pointB;

        type ScreenTriangleData = {
          anchor: ScreenPoint2D;
          target: ScreenPoint2D;
          aux: ScreenPoint2D;
          centroid: ScreenPoint2D;
          highest: ScreenPoint2D;
        };

        let cachedTriangleFrameNumber: number | null = null;
        let cachedTriangle: ScreenTriangleData | null = null;

        const getSceneFrameNumber = (): number | null => {
          const frameNumber = (
            scene as unknown as { frameState?: { frameNumber?: number } }
          ).frameState?.frameNumber;
          return typeof frameNumber === "number" ? frameNumber : null;
        };

        const computeScreenTriangle = (): ScreenTriangleData | null => {
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
            },
          };
        };

        const getScreenTriangle = (): ScreenTriangleData | null => {
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

        const getScreenAnchor = (): ScreenPoint2D | null =>
          getScreenTriangle()?.anchor ?? null;
        const getScreenTarget = (): ScreenPoint2D | null =>
          getScreenTriangle()?.target ?? null;
        const getScreenAux = (): ScreenPoint2D | null =>
          getScreenTriangle()?.aux ?? null;

        const buildStableOutsideReferencePoint = (
          start: ScreenPoint2D,
          end: ScreenPoint2D,
          insidePoint: ScreenPoint2D
        ): ScreenPoint2D | null => {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const lineLength = Math.hypot(dx, dy);
          if (lineLength <= 1e-3) return null;
          const midX = (start.x + end.x) * 0.5;
          const midY = (start.y + end.y) * 0.5;
          const normalX = -dy / lineLength;
          const normalY = dx / lineLength;
          const dot =
            (insidePoint.x - midX) * normalX + (insidePoint.y - midY) * normalY;
          const insideSign = dot >= 0 ? 1 : -1;
          const refDistancePx = clampToRange(
            lineLength * 0.2,
            LABEL_REFERENCE_MIN_DISTANCE_PX,
            LABEL_REFERENCE_MAX_DISTANCE_PX
          );
          return {
            x: midX + normalX * insideSign * refDistancePx,
            y: midY + normalY * insideSign * refDistancePx,
          };
        };

        const getStableInsidePointForDirectAndHorizontal =
          (): ScreenPoint2D | null => {
            const triangle = getScreenTriangle();
            if (!triangle) return null;
            const auxHeight = targetPoint.geometryWGS84.height;
            const highestHeight = highestPoint.geometryWGS84.height;
            const elevationDriverPoint =
              auxHeight < highestHeight - REFERENCE_LINE_EPSILON_METERS
                ? triangle.highest
                : triangle.aux;
            return {
              x:
                elevationDriverPoint.x +
                (triangle.centroid.x - elevationDriverPoint.x) *
                  LABEL_INSIDE_BLEND_FACTOR,
              y:
                elevationDriverPoint.y +
                (triangle.centroid.y - elevationDriverPoint.y) *
                  LABEL_INSIDE_BLEND_FACTOR,
            };
          };

        const getDirectLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const triangle = getScreenTriangle();
            const insidePoint = getStableInsidePointForDirectAndHorizontal();
            if (!triangle || !insidePoint) return null;
            return buildStableOutsideReferencePoint(
              triangle.anchor,
              triangle.target,
              insidePoint
            );
          };

        const getHorizontalLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const triangle = getScreenTriangle();
            const insidePoint = getStableInsidePointForDirectAndHorizontal();
            if (!triangle || !insidePoint) return null;
            return buildStableOutsideReferencePoint(
              triangle.aux,
              triangle.target,
              insidePoint
            );
          };

        const getVerticalLineScreenData = (): {
          start: ScreenPoint2D;
          end: ScreenPoint2D;
          inside: ScreenPoint2D;
          insideSign: -1 | 1;
          midX: number;
          midY: number;
          normalX: number;
          normalY: number;
          lineLength: number;
        } | null => {
          const triangle = getScreenTriangle();
          if (!triangle) return null;

          let start = triangle.anchor;
          let end = triangle.aux;
          const inside = triangle.target;

          const recompute = (
            s: ScreenPoint2D,
            e: ScreenPoint2D
          ): {
            midX: number;
            midY: number;
            normalX: number;
            normalY: number;
            lineLength: number;
            insideDot: number;
          } | null => {
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const lineLength = Math.hypot(dx, dy);
            if (lineLength <= 1e-3) return null;
            const midX = (s.x + e.x) * 0.5;
            const midY = (s.y + e.y) * 0.5;
            const normalX = -dy / lineLength;
            const normalY = dx / lineLength;
            const insideDot =
              (inside.x - midX) * normalX + (inside.y - midY) * normalY;
            return {
              midX,
              midY,
              normalX,
              normalY,
              lineLength,
              insideDot,
            };
          };

          let edgeData = recompute(start, end);
          if (!edgeData) return null;

          const stableInsideSign = resolveStableSideSign(
            edgeData.insideDot,
            verticalLabelSideByRelationIdRef.current[relation.id]
          );
          verticalLabelSideByRelationIdRef.current[relation.id] =
            stableInsideSign;

          // Canonical direction for vertical line labels:
          // keep triangle interior on the clockwise/right side of the directed edge.
          if (stableInsideSign < 0) {
            start = triangle.aux;
            end = triangle.anchor;
            edgeData = recompute(start, end);
            if (!edgeData) return null;
          }

          return {
            start,
            end,
            inside,
            insideSign: stableInsideSign,
            midX: edgeData.midX,
            midY: edgeData.midY,
            normalX: edgeData.normalX,
            normalY: edgeData.normalY,
            lineLength: edgeData.lineLength,
          };
        };

        const getVerticalLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const edge = getVerticalLineScreenData();
            if (!edge) return null;
            const refDistancePx = clampToRange(
              edge.lineLength * 0.2,
              LABEL_REFERENCE_MIN_DISTANCE_PX,
              LABEL_REFERENCE_MAX_DISTANCE_PX
            );

            // Use an inside-side reference point; overlay logic places the label on
            // the opposite side, i.e. outside the triangle.
            const nextReferencePoint = {
              x: edge.midX + edge.normalX * edge.insideSign * refDistancePx,
              y: edge.midY + edge.normalY * edge.insideSign * refDistancePx,
            };
            return nextReferencePoint;
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
        const forceComponentLabelsForSelectedOrActivePolylineEdges =
          isPolygonEdgeRelation && isSelectedOrActiveEdgeRelation;
        const showVerticalLabel =
          (forceComponentLabelsForSelectedOrActivePolylineEdges ||
            (relation.labelVisibilityByKind?.vertical ?? true)) &&
          verticalDistanceMeters > REFERENCE_LINE_EPSILON_METERS;
        const showHorizontalLabel =
          (forceComponentLabelsForSelectedOrActivePolylineEdges ||
            (relation.labelVisibilityByKind?.horizontal ?? true)) &&
          horizontalDistanceMeters > REFERENCE_LINE_EPSILON_METERS;

        if (relation.showDirectLine) {
          const forceSegmentLabelsForVisiblePolylineEdges =
            isPolygonEdgeRelation && isSelectedOrActiveEdgeRelation;
          const directLabelMode: DirectLineLabelMode =
            forceSegmentLabelsForVisiblePolylineEdges
              ? "segment"
              : relation.directLabelMode ?? "segment";
          const directLabelVisibilityEnabled =
            forceSegmentLabelsForVisiblePolylineEdges
              ? true
              : relation.labelVisibilityByKind?.direct ?? true;
          const shouldShowPolygonEdgeLengthLabel =
            !isPolygonEdgeRelation ||
            forceSegmentLabelsForVisiblePolylineEdges ||
            edgeRelationOwnerGroupIdSet.has(relation.id);
          const segmentDistanceMeters = Cartesian3.distance(
            pointA.geometryECEF,
            pointB.geometryECEF
          );
          const cumulativeDistanceMeters =
            cumulativeDistanceByRelationId?.[relation.id] ??
            segmentDistanceMeters;
          const directLabelDistanceMeters =
            directLabelMode === "cumulative"
              ? cumulativeDistanceMeters
              : segmentDistanceMeters;
          const showDirectLabel =
            directLabelVisibilityEnabled &&
            directLabelMode !== "none" &&
            !planarPolygonSharedEdgeRelationIdSet.has(relation.id) &&
            shouldShowPolygonEdgeLengthLabel &&
            !duplicateFacadeOpposingEdgeRelationIdSet.has(relation.id);
          const onDirectLineClick = onDistanceLineClick
            ? () => onDistanceLineClick(relation.id, "direct")
            : undefined;
          const onDirectLabelClick = onDistanceLineLabelToggle
            ? () => onDistanceLineLabelToggle(relation.id, "direct")
            : undefined;
          lines.push({
            id: `reference-direct-${relation.id}`,
            getCanvasLine: () => {
              const start = getScreenAnchor();
              const end = getScreenTarget();
              if (!start || !end) return null;
              return { start, end };
            },
            getLabelOutsideReferencePoint: getDirectLabelOutsideReferencePoint,
            stroke: "rgba(255, 255, 255, 0.9)",
            strokeWidth: 1.5,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: showDirectLabel
              ? `${formatNumber(directLabelDistanceMeters)} m`
              : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: forceSegmentLabelsForVisiblePolylineEdges
              ? 0
              : lineLabelMinDistancePx,
            onLineClick: onDirectLineClick,
            onLabelClick: onDirectLabelClick,
          });
        }

        if (isDistanceRelationVerticalLineVisible(relation)) {
          const onVerticalLineClick = onDistanceLineLabelToggle
            ? () => onDistanceLineLabelToggle(relation.id, "vertical")
            : undefined;
          lines.push({
            id: `reference-vertical-${relation.id}`,
            getCanvasLine: () => {
              const edge = getVerticalLineScreenData();
              if (!edge) return null;
              return { start: edge.start, end: edge.end };
            },
            getLabelOutsideReferencePoint:
              getVerticalLabelOutsideReferencePoint,
            stroke: REFERENCE_COMPONENT_VERTICAL_COLOR,
            strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: showVerticalLabel
              ? `${formatNumber(verticalDistanceMeters)} m`
              : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelRotationMode: "clockwise",
            labelOffsetPx: VERTICAL_COMPONENT_LABEL_OFFSET_PX,
            labelDominantBaseline: "alphabetic",
            labelMinLineLengthPx:
              forceComponentLabelsForSelectedOrActivePolylineEdges
                ? 0
                : lineLabelMinDistancePx,
            onLineClick: onVerticalLineClick,
          });
        }

        if (isDistanceRelationHorizontalLineVisible(relation)) {
          const onHorizontalLineClick = onDistanceLineLabelToggle
            ? () => onDistanceLineLabelToggle(relation.id, "horizontal")
            : undefined;
          lines.push({
            id: `reference-horizontal-${relation.id}`,
            getCanvasLine: () => {
              const start = getScreenAux();
              const end = getScreenTarget();
              if (!start || !end) return null;
              return { start, end };
            },
            getLabelOutsideReferencePoint:
              getHorizontalLabelOutsideReferencePoint,
            stroke: REFERENCE_COMPONENT_HORIZONTAL_COLOR,
            strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: showHorizontalLabel
              ? `${formatNumber(horizontalDistanceMeters)} m`
              : undefined,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx:
              forceComponentLabelsForSelectedOrActivePolylineEdges
                ? 0
                : lineLabelMinDistancePx,
            onLineClick: onHorizontalLineClick,
          });
        }
      }
    );

    if (scene && !scene.isDestroyed() && livePreviewDistanceLine) {
      const {
        anchorPointECEF,
        targetPointECEF,
        showDirectLine,
        showVerticalLine,
        showHorizontalLine,
      } = livePreviewDistanceLine;

      if (
        Cartesian3.distance(anchorPointECEF, targetPointECEF) >
        REFERENCE_LINE_EPSILON_METERS
      ) {
        const anchorWGS84 = getDegreesFromCartesian(anchorPointECEF);
        const targetWGS84 = getDegreesFromCartesian(targetPointECEF);
        const auxiliaryPointECEF = Cartesian3.fromDegrees(
          anchorWGS84.longitude,
          anchorWGS84.latitude,
          targetWGS84.altitude ?? 0
        );

        const getPreviewScreenAnchor = () => {
          if (!scene || scene.isDestroyed()) return null;
          const anchor = SceneTransforms.worldToWindowCoordinates(
            scene,
            anchorPointECEF
          );
          if (!defined(anchor)) return null;
          return { x: anchor.x, y: anchor.y };
        };

        const getPreviewScreenTarget = () => {
          if (!scene || scene.isDestroyed()) return null;
          const target = SceneTransforms.worldToWindowCoordinates(
            scene,
            targetPointECEF
          );
          if (!defined(target)) return null;
          return { x: target.x, y: target.y };
        };

        const getPreviewScreenAux = () => {
          if (!scene || scene.isDestroyed()) return null;
          const auxiliary = SceneTransforms.worldToWindowCoordinates(
            scene,
            auxiliaryPointECEF
          );
          if (!defined(auxiliary)) return null;
          return { x: auxiliary.x, y: auxiliary.y };
        };

        type PreviewScreenTriangleData = {
          anchor: ScreenPoint2D;
          target: ScreenPoint2D;
          aux: ScreenPoint2D;
          centroid: ScreenPoint2D;
        };

        let cachedPreviewTriangleFrameNumber: number | null = null;
        let cachedPreviewTriangle: PreviewScreenTriangleData | null = null;

        const getSceneFrameNumber = (): number | null => {
          const frameNumber = (
            scene as unknown as { frameState?: { frameNumber?: number } }
          ).frameState?.frameNumber;
          return typeof frameNumber === "number" ? frameNumber : null;
        };

        const getPreviewScreenTriangle =
          (): PreviewScreenTriangleData | null => {
            const frameNumber = getSceneFrameNumber();
            if (
              frameNumber !== null &&
              frameNumber === cachedPreviewTriangleFrameNumber
            ) {
              return cachedPreviewTriangle;
            }

            const anchor = getPreviewScreenAnchor();
            const target = getPreviewScreenTarget();
            const aux = getPreviewScreenAux();
            if (!anchor || !target || !aux) return null;
            const triangle = {
              anchor,
              target,
              aux,
              centroid: {
                x: (anchor.x + target.x + aux.x) / 3,
                y: (anchor.y + target.y + aux.y) / 3,
              },
            };
            if (frameNumber !== null) {
              cachedPreviewTriangleFrameNumber = frameNumber;
              cachedPreviewTriangle = triangle;
            }
            return triangle;
          };

        const buildStableOutsideReferencePoint = (
          start: ScreenPoint2D,
          end: ScreenPoint2D,
          insidePoint: ScreenPoint2D
        ): ScreenPoint2D | null => {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const lineLength = Math.hypot(dx, dy);
          if (lineLength <= 1e-3) return null;
          const midX = (start.x + end.x) * 0.5;
          const midY = (start.y + end.y) * 0.5;
          const normalX = -dy / lineLength;
          const normalY = dx / lineLength;
          const dot =
            (insidePoint.x - midX) * normalX + (insidePoint.y - midY) * normalY;
          const insideSign = dot >= 0 ? 1 : -1;
          const refDistancePx = clampToRange(
            lineLength * 0.2,
            LABEL_REFERENCE_MIN_DISTANCE_PX,
            LABEL_REFERENCE_MAX_DISTANCE_PX
          );
          return {
            x: midX + normalX * insideSign * refDistancePx,
            y: midY + normalY * insideSign * refDistancePx,
          };
        };

        const getStableInsidePointForDirectAndHorizontal =
          (): ScreenPoint2D | null => {
            const triangle = getPreviewScreenTriangle();
            if (!triangle) return null;
            return {
              x:
                triangle.aux.x +
                (triangle.centroid.x - triangle.aux.x) *
                  LABEL_INSIDE_BLEND_FACTOR,
              y:
                triangle.aux.y +
                (triangle.centroid.y - triangle.aux.y) *
                  LABEL_INSIDE_BLEND_FACTOR,
            };
          };

        const getPreviewDirectLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const triangle = getPreviewScreenTriangle();
            const insidePoint = getStableInsidePointForDirectAndHorizontal();
            if (!triangle || !insidePoint) return null;
            return buildStableOutsideReferencePoint(
              triangle.anchor,
              triangle.target,
              insidePoint
            );
          };

        const getPreviewHorizontalLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const triangle = getPreviewScreenTriangle();
            const insidePoint = getStableInsidePointForDirectAndHorizontal();
            if (!triangle || !insidePoint) return null;
            return buildStableOutsideReferencePoint(
              triangle.aux,
              triangle.target,
              insidePoint
            );
          };

        const getPreviewVerticalLineScreenData = (): {
          start: ScreenPoint2D;
          end: ScreenPoint2D;
          inside: ScreenPoint2D;
          insideSign: -1 | 1;
          midX: number;
          midY: number;
          normalX: number;
          normalY: number;
          lineLength: number;
        } | null => {
          const triangle = getPreviewScreenTriangle();
          if (!triangle) return null;

          let start = triangle.anchor;
          let end = triangle.aux;
          const inside = triangle.target;

          const recompute = (
            s: ScreenPoint2D,
            e: ScreenPoint2D
          ): {
            midX: number;
            midY: number;
            normalX: number;
            normalY: number;
            lineLength: number;
            insideDot: number;
          } | null => {
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const lineLength = Math.hypot(dx, dy);
            if (lineLength <= 1e-3) return null;
            const midX = (s.x + e.x) * 0.5;
            const midY = (s.y + e.y) * 0.5;
            const normalX = -dy / lineLength;
            const normalY = dx / lineLength;
            const insideDot =
              (inside.x - midX) * normalX + (inside.y - midY) * normalY;
            return {
              midX,
              midY,
              normalX,
              normalY,
              lineLength,
              insideDot,
            };
          };

          let edgeData = recompute(start, end);
          if (!edgeData) return null;

          const stableInsideSign = resolveStableSideSign(
            edgeData.insideDot,
            previewVerticalLabelSideRef.current
          );
          previewVerticalLabelSideRef.current = stableInsideSign;

          if (stableInsideSign < 0) {
            start = triangle.aux;
            end = triangle.anchor;
            edgeData = recompute(start, end);
            if (!edgeData) return null;
          }

          return {
            start,
            end,
            inside,
            insideSign: stableInsideSign,
            midX: edgeData.midX,
            midY: edgeData.midY,
            normalX: edgeData.normalX,
            normalY: edgeData.normalY,
            lineLength: edgeData.lineLength,
          };
        };

        const getPreviewVerticalLabelOutsideReferencePoint =
          (): ScreenPoint2D | null => {
            const edge = getPreviewVerticalLineScreenData();
            if (!edge) return null;
            const refDistancePx = clampToRange(
              edge.lineLength * 0.2,
              LABEL_REFERENCE_MIN_DISTANCE_PX,
              LABEL_REFERENCE_MAX_DISTANCE_PX
            );

            const nextReferencePoint = {
              x: edge.midX + edge.normalX * edge.insideSign * refDistancePx,
              y: edge.midY + edge.normalY * edge.insideSign * refDistancePx,
            };
            return nextReferencePoint;
          };

        const directDistanceMeters = Cartesian3.distance(
          anchorPointECEF,
          targetPointECEF
        );
        if (showDirectLine) {
          lines.push({
            id: "reference-preview-direct",
            getCanvasLine: () => {
              const start = getPreviewScreenAnchor();
              const end = getPreviewScreenTarget();
              if (!start || !end) return null;
              return { start, end };
            },
            getLabelOutsideReferencePoint:
              getPreviewDirectLabelOutsideReferencePoint,
            stroke: "rgba(255, 255, 255, 0.9)",
            strokeWidth: 1.5,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: `${formatNumber(directDistanceMeters)} m`,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: lineLabelMinDistancePx,
          });
        }

        const verticalDistanceMeters = Cartesian3.distance(
          anchorPointECEF,
          auxiliaryPointECEF
        );
        const horizontalDistanceMeters = Cartesian3.distance(
          auxiliaryPointECEF,
          targetPointECEF
        );

        if (
          showVerticalLine &&
          verticalDistanceMeters > REFERENCE_LINE_EPSILON_METERS
        ) {
          lines.push({
            id: "reference-preview-vertical",
            getCanvasLine: () => {
              const edge = getPreviewVerticalLineScreenData();
              if (!edge) return null;
              return { start: edge.start, end: edge.end };
            },
            getLabelOutsideReferencePoint:
              getPreviewVerticalLabelOutsideReferencePoint,
            stroke: REFERENCE_COMPONENT_VERTICAL_COLOR,
            strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: `${formatNumber(verticalDistanceMeters)} m`,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelRotationMode: "clockwise",
            labelOffsetPx: VERTICAL_COMPONENT_LABEL_OFFSET_PX,
            labelDominantBaseline: "alphabetic",
            labelMinLineLengthPx: lineLabelMinDistancePx,
          });
        }

        if (
          showHorizontalLine &&
          horizontalDistanceMeters > REFERENCE_LINE_EPSILON_METERS
        ) {
          lines.push({
            id: "reference-preview-horizontal",
            getCanvasLine: () => {
              const start = getPreviewScreenAux();
              const end = getPreviewScreenTarget();
              if (!start || !end) return null;
              return { start, end };
            },
            getLabelOutsideReferencePoint:
              getPreviewHorizontalLabelOutsideReferencePoint,
            stroke: REFERENCE_COMPONENT_HORIZONTAL_COLOR,
            strokeWidth: REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX,
            strokeDasharray: "6 8",
            hitTargetStrokeWidth: 10,
            labelText: `${formatNumber(horizontalDistanceMeters)} m`,
            labelColor: "#000000",
            labelStroke: "rgba(255, 255, 255, 0.95)",
            labelFontSize: 12,
            labelFontFamily: "Arial, sans-serif",
            labelFontWeight: "400",
            labelMinLineLengthPx: lineLabelMinDistancePx,
          });
        }
      }
    }

    return lines;
  }, [
    lineLabelMinDistancePx,
    onDistanceLineLabelToggle,
    onDistanceLineClick,
    cumulativeDistanceByRelationId,
    planarPolygonSharedEdgeRelationIdSet,
    duplicateFacadeOpposingEdgeRelationIdSet,
    livePreviewDistanceLine,
    resolvedRelations,
    scene,
    edgeRelationOwnerGroupIdSet,
    selectedOrActiveOpenPolylineEdgeRelationIdSet,
    splitMarkerRelationIdSet,
    renderDomVisuals,
  ]);

  useLineVisualizers(overlayLines, renderDomVisuals && overlayLines.length > 0);

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

    if (!renderDomVisuals) {
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
              dotScreen: { x: dotScreen.x, y: dotScreen.y },
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
    renderDomVisuals,
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

    if (!renderDomVisuals) {
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
              center: { x: center.x, y: center.y },
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
    renderDomVisuals,
    scene,
    midpointTickRelationIdSet,
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

    if (!renderCesiumCoreVisuals) {
      destroyLineVisualizerMap(directLineRefs);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
      return;
    }

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
  }, [relationsWithDirectLine, renderCesiumCoreVisuals, scene]);

  useEffect(() => {
    if (!scene) return;

    if (!renderCesiumCoreVisuals) {
      destroyLineVisualizerMap(verticalLineRefs);
      destroyLineVisualizerMap(horizontalLineRefs);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
      return;
    }

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
  }, [
    relationsWithHorizontalLine,
    relationsWithVerticalLine,
    renderCesiumCoreVisuals,
    scene,
  ]);

  useEffect(() => {
    if (!scene) return;

    if (!renderCesiumCoreVisuals) {
      destroyLineVisualizerRef(previewDirectLineRef);
      destroyLineVisualizerRef(previewVerticalLineRef);
      destroyLineVisualizerRef(previewHorizontalLineRef);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
      return;
    }

    destroyLineVisualizerRef(previewDirectLineRef);
    destroyLineVisualizerRef(previewVerticalLineRef);
    destroyLineVisualizerRef(previewHorizontalLineRef);

    if (!livePreviewDistanceLine) {
      scene.requestRender();
      return;
    }

    const {
      anchorPointECEF,
      targetPointECEF,
      showDirectLine,
      showVerticalLine,
      showHorizontalLine,
    } = livePreviewDistanceLine;

    if (
      Cartesian3.distance(anchorPointECEF, targetPointECEF) <=
      REFERENCE_LINE_EPSILON_METERS
    ) {
      scene.requestRender();
      return;
    }

    const anchorWGS84 = getDegreesFromCartesian(anchorPointECEF);
    const targetWGS84 = getDegreesFromCartesian(targetPointECEF);
    const auxiliaryPointECEF = Cartesian3.fromDegrees(
      anchorWGS84.longitude,
      anchorWGS84.latitude,
      targetWGS84.altitude ?? 0
    );

    if (showDirectLine) {
      const lineVisualizer = createLineVisualizer("reference-preview-direct", {
        start: anchorPointECEF,
        end: targetPointECEF,
        color: Color.WHITE,
        width: 1,
        dashed: false,
      });
      previewDirectLineRef.current = lineVisualizer;
      lineVisualizer.attach(scene, () => scene.requestRender());
    }

    const verticalDistanceMeters = Cartesian3.distance(
      anchorPointECEF,
      auxiliaryPointECEF
    );
    if (
      showVerticalLine &&
      verticalDistanceMeters > REFERENCE_LINE_EPSILON_METERS
    ) {
      const verticalLineVisualizer = createLineVisualizer(
        "reference-preview-vertical",
        {
          start: anchorPointECEF,
          end: auxiliaryPointECEF,
          color: Color.fromCssColorString(REFERENCE_COMPONENT_VERTICAL_COLOR),
          width: 1,
          dashed: false,
        }
      );
      previewVerticalLineRef.current = verticalLineVisualizer;
      verticalLineVisualizer.attach(scene, () => scene.requestRender());
    }

    const horizontalDistanceMeters = Cartesian3.distance(
      auxiliaryPointECEF,
      targetPointECEF
    );
    if (
      showHorizontalLine &&
      horizontalDistanceMeters > REFERENCE_LINE_EPSILON_METERS
    ) {
      const horizontalLineVisualizer = createLineVisualizer(
        "reference-preview-horizontal",
        {
          start: auxiliaryPointECEF,
          end: targetPointECEF,
          color: Color.fromCssColorString(REFERENCE_COMPONENT_HORIZONTAL_COLOR),
          width: 1,
          dashed: false,
        }
      );
      previewHorizontalLineRef.current = horizontalLineVisualizer;
      horizontalLineVisualizer.attach(scene, () => scene.requestRender());
    }

    scene.requestRender();

    return () => {
      destroyLineVisualizerRef(previewDirectLineRef);
      destroyLineVisualizerRef(previewVerticalLineRef);
      destroyLineVisualizerRef(previewHorizontalLineRef);
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [livePreviewDistanceLine, renderCesiumCoreVisuals, scene]);

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
      destroyLineVisualizerMap(directLineRefs);
      destroyLineVisualizerMap(verticalLineRefs);
      destroyLineVisualizerMap(horizontalLineRefs);
      destroyLineVisualizerRef(previewDirectLineRef);
      destroyLineVisualizerRef(previewVerticalLineRef);
      destroyLineVisualizerRef(previewHorizontalLineRef);
    };
  }, [removeLabelOverlayElement]);
};

export default useCesiumDistanceVisualizer;
