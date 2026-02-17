/* @refresh reset */
import { createElement, useCallback, useEffect, useMemo, useRef } from "react";

import {
  BoundingSphere,
  Cartesian3,
  Color,
  SceneTransforms,
  defined,
  type Cartesian2,
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
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type PointMeasurementEntry,
  type ReferenceLineLabelKind,
} from "../types/MeasurementTypes";
import {
  REFERENCE_LINE_EPSILON_METERS,
  computePolygonCentroid2D,
  getArcPointsInSpannedPlane,
  getRoofRoofSharedEdgeRelationIdSet,
  getSplitMarkerRelationIdSet,
  hasVisibleDistanceRelationComponentLines,
  isDistanceRelationHorizontalLineVisible,
  isDistanceRelationVerticalLineVisible,
  resolveDistanceRelation,
  type ResolvedDistanceRelation,
  type ScreenPoint2D,
} from "../utils/distanceVisualization";
import { formatNumber } from "../utils/formatting";

export type CesiumDistanceVisualizerOptions = {
  distanceRelations?: PointDistanceRelation[];
  planarPolygonGroups?: PlanarPolygonGroup[];
  selectedPlanarPolygonGroupId?: string | null;
  onPlanarPolygonClick?: (polygonGroupId: string) => void;
  onDistanceLineLabelToggle?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceRelationMidpointClick?: (relationId: string) => void;
  lineLabelMinDistancePx?: number;
  onDistanceRelationCornerClick?: (relationId: string) => void;
};

// EN component color: light mix of the standard East (red) and North (green) axis colors.
const REFERENCE_COMPONENT_HORIZONTAL_COLOR = "rgba(188, 194, 102, 0.95)";
// U component color: lighter blue for better readability and a softer look.
const REFERENCE_COMPONENT_VERTICAL_COLOR = "rgba(111, 168, 255, 0.96)";
const REFERENCE_COMPONENT_ARC_COLOR = "rgba(246, 248, 255, 0.95)";
const REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX = 1.25;
const CORNER_OVERLAY_ID_PREFIX = "distance-right-angle-corner";
const MIDPOINT_OVERLAY_ID_PREFIX = "distance-edge-midpoint";
const POLYGON_PREVIEW_OVERLAY_ID_PREFIX = "distance-polygon-preview";
const CORNER_OVERLAY_MIN_BOX_PX = 20;
const CORNER_OVERLAY_PADDING_PX = 6;
const CORNER_OVERLAY_TARGET_RADIUS_PX = 20;
const CORNER_OVERLAY_DOT_RADIUS_PX =
  REFERENCE_COMPONENT_LINE_STROKE_WIDTH_PX / 2;
const CORNER_OVERLAY_SEGMENTS = 20;
const MIDPOINT_MARKER_HIT_TARGET_PX = 14;
const MIDPOINT_MARKER_TICK_LENGTH_PX = 8;
const MIDPOINT_MARKER_TICK_WIDTH_PX = 1.25;
const POLYGON_PREVIEW_PADDING_PX = 6;
const POLYGON_PREVIEW_FILL_ROOF_OPEN = "rgba(239, 223, 145, 0.20)";
const POLYGON_PREVIEW_FILL_ROOF_CLOSED = "rgba(239, 223, 145, 0.30)";
const POLYGON_PREVIEW_FILL_FACADE_OPEN = "rgba(111, 168, 255, 0.20)";
const POLYGON_PREVIEW_FILL_FACADE_CLOSED = "rgba(111, 168, 255, 0.30)";
const POLYGON_PREVIEW_STROKE = "rgba(255, 255, 255, 0.65)";
const POLYGON_PREVIEW_STROKE_WIDTH_PX = 1;
const POLYGON_AREA_LABEL_COLOR = "#111111";
const POLYGON_AREA_LABEL_FONT_SIZE_PX = 12;
const POLYGON_AREA_LABEL_FONT_FAMILY = "Arial, sans-serif";
const POLYGON_AREA_LABEL_FONT_WEIGHT = "400";
const POLYGON_OVERLAY_MAX_BOUNDS_SCALE = 2.5;

const clampToRange = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const destroyLineVisualizerMap = (lineRefs: {
  current: Record<string, LineVisualizer>;
}) => {
  Object.values(lineRefs.current).forEach((lineVisualizer) => {
    lineVisualizer.destroy();
  });
  lineRefs.current = {};
};

const getPolygonPreviewFillColor = (
  surfaceType: PlanarPolygonGroup["surfaceType"],
  isClosed: boolean
) => {
  if (surfaceType === "facade") {
    return isClosed
      ? POLYGON_PREVIEW_FILL_FACADE_CLOSED
      : POLYGON_PREVIEW_FILL_FACADE_OPEN;
  }

  return isClosed
    ? POLYGON_PREVIEW_FILL_ROOF_CLOSED
    : POLYGON_PREVIEW_FILL_ROOF_OPEN;
};

const getProjectedHorizontalAreaSquareMeters = (group: PlanarPolygonGroup) => {
  const planarArea = group.areaSquareMeters ?? 0;
  if (!Number.isFinite(planarArea) || planarArea <= 0) return 0;
  const verticalityDeg = Math.max(0, Math.min(90, group.verticalityDeg ?? 0));
  const projectionFactor = Math.max(
    0,
    Math.cos((verticalityDeg * Math.PI) / 180)
  );
  return planarArea * projectionFactor;
};

const getPolygonAreaLabelText = (group: PlanarPolygonGroup) => {
  const planarArea = Math.max(0, group.areaSquareMeters ?? 0);
  const projectedHorizontalArea = getProjectedHorizontalAreaSquareMeters(group);
  const showProjectedHorizontalArea =
    planarArea > 0 && projectedHorizontalArea < planarArea * 0.99;

  return {
    planarText: `${formatNumber(planarArea)} m²`,
    projectedHorizontalText: showProjectedHorizontalArea
      ? `(${formatNumber(projectedHorizontalArea)} m²)`
      : null,
  };
};

export const useCesiumDistanceVisualizer = (
  scene: Scene | null,
  points: PointMeasurementEntry[],
  {
    distanceRelations = [],
    planarPolygonGroups = [],
    selectedPlanarPolygonGroupId = null,
    onDistanceLineLabelToggle,
    onDistanceRelationMidpointClick,
    lineLabelMinDistancePx = 50,
    onDistanceRelationCornerClick,
  }: CesiumDistanceVisualizerOptions
) => {
  const directLineRefs = useRef<Record<string, LineVisualizer>>({});
  const verticalLineRefs = useRef<Record<string, LineVisualizer>>({});
  const horizontalLineRefs = useRef<Record<string, LineVisualizer>>({});
  const cornerOverlayIdsRef = useRef<string[]>([]);
  const midpointOverlayIdsRef = useRef<string[]>([]);
  const polygonPreviewOverlayIdsRef = useRef<string[]>([]);

  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const pointsById = useMemo(() => {
    const map = new Map<string, PointMeasurementEntry>();
    points.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [points]);

  const splitMarkerRelationIdSet = useMemo(() => {
    return getSplitMarkerRelationIdSet(planarPolygonGroups);
  }, [planarPolygonGroups]);
  const roofRoofSharedEdgeRelationIdSet = useMemo(() => {
    return getRoofRoofSharedEdgeRelationIdSet(planarPolygonGroups);
  }, [planarPolygonGroups]);

  const resolvedRelations = useMemo(
    () =>
      distanceRelations
        .map((relation) => resolveDistanceRelation(relation, pointsById))
        .filter((relation): relation is ResolvedDistanceRelation =>
          Boolean(relation)
        ),
    [distanceRelations, pointsById]
  );

  const polygonPreviewGroups = useMemo(
    () =>
      planarPolygonGroups
        .filter(
          (group) =>
            group.vertexPointIds.length >= 3 &&
            (group.planeLocked || group.closed)
        )
        .map((group) => {
          const vertexPoints = group.vertexPointIds
            .map((pointId) => pointsById.get(pointId)?.geometryECEF)
            .filter((point): point is Cartesian3 => Boolean(point));
          return {
            group,
            vertexPoints,
          };
        })
        .filter(({ vertexPoints }) => vertexPoints.length >= 3),
    [planarPolygonGroups, pointsById]
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
          const isPolygonEdgeRelation = splitMarkerRelationIdSet.has(
            relation.id
          );
          const shouldShowPolygonEdgeLengthLabel =
            !isPolygonEdgeRelation || Boolean(selectedPlanarPolygonGroupId);
          const showDirectLabel =
            (relation.labelVisibilityByKind?.direct ?? true) &&
            !roofRoofSharedEdgeRelationIdSet.has(relation.id) &&
            shouldShowPolygonEdgeLengthLabel;
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
            labelText: showDirectLabel
              ? `${formatNumber(
                  Cartesian3.distance(pointA.geometryECEF, pointB.geometryECEF)
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
    roofRoofSharedEdgeRelationIdSet,
    resolvedRelations,
    scene,
    selectedPlanarPolygonGroupId,
    splitMarkerRelationIdSet,
  ]);

  useLineVisualizers(overlayLines, overlayLines.length > 0);

  const polygonPreviewContent = useCallback(
    (group: PlanarPolygonGroup) =>
      createElement(
        "div",
        {
          style: {
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          },
        },
        createElement(
          "svg",
          {
            width: "100%",
            height: "100%",
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              overflow: "visible",
              pointerEvents: "none",
            },
          },
          createElement("polygon", {
            "data-polygon-preview-shape": "true",
            fill: POLYGON_PREVIEW_FILL_ROOF_OPEN,
            stroke: POLYGON_PREVIEW_STROKE,
            strokeWidth: POLYGON_PREVIEW_STROKE_WIDTH_PX,
            vectorEffect: "non-scaling-stroke",
            strokeLinejoin: "round",
            style: {
              cursor: "default",
              pointerEvents: "none",
            },
          }),
          createElement("text", {
            "data-polygon-preview-area-label": "true",
            x: "0",
            y: "0",
            textAnchor: "middle",
            dominantBaseline: "middle",
            fill: POLYGON_AREA_LABEL_COLOR,
            fontSize: POLYGON_AREA_LABEL_FONT_SIZE_PX,
            fontFamily: POLYGON_AREA_LABEL_FONT_FAMILY,
            fontWeight: POLYGON_AREA_LABEL_FONT_WEIGHT,
            style: {
              userSelect: "none",
              pointerEvents: "none",
            },
          }),
          createElement("text", {
            "data-polygon-preview-area-label-secondary": "true",
            x: "0",
            y: "0",
            textAnchor: "middle",
            dominantBaseline: "middle",
            fill: POLYGON_AREA_LABEL_COLOR,
            fontSize: Math.max(10, POLYGON_AREA_LABEL_FONT_SIZE_PX - 1),
            fontFamily: POLYGON_AREA_LABEL_FONT_FAMILY,
            fontWeight: POLYGON_AREA_LABEL_FONT_WEIGHT,
            style: {
              userSelect: "none",
              pointerEvents: "none",
              display: "none",
            },
          })
        )
      ),
    []
  );

  useEffect(() => {
    polygonPreviewOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    polygonPreviewOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextOverlayIds: string[] = [];

    polygonPreviewGroups.forEach(({ group, vertexPoints }) => {
      const overlayId = `${POLYGON_PREVIEW_OVERLAY_ID_PREFIX}-${group.id}`;

      addLabelOverlayElement({
        id: overlayId,
        zIndex: 4,
        content: polygonPreviewContent(group),
        updatePosition: (elementDiv) => {
          if (!scene || scene.isDestroyed()) return false;

          const screenPoints = vertexPoints
            .map((point) =>
              SceneTransforms.worldToWindowCoordinates(scene, point)
            )
            .filter(
              (point): point is Cartesian2 =>
                defined(point) &&
                Number.isFinite(point.x) &&
                Number.isFinite(point.y)
            );

          if (screenPoints.length < 3) {
            return false;
          }

          const minX = Math.min(...screenPoints.map((point) => point.x));
          const maxX = Math.max(...screenPoints.map((point) => point.x));
          const minY = Math.min(...screenPoints.map((point) => point.y));
          const maxY = Math.max(...screenPoints.map((point) => point.y));

          const width = Math.max(
            1,
            maxX - minX + POLYGON_PREVIEW_PADDING_PX * 2
          );
          const height = Math.max(
            1,
            maxY - minY + POLYGON_PREVIEW_PADDING_PX * 2
          );
          const canvasWidth = Math.max(
            1,
            scene.canvas.clientWidth || scene.canvas.width || 1
          );
          const canvasHeight = Math.max(
            1,
            scene.canvas.clientHeight || scene.canvas.height || 1
          );
          if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width > canvasWidth * POLYGON_OVERLAY_MAX_BOUNDS_SCALE ||
            height > canvasHeight * POLYGON_OVERLAY_MAX_BOUNDS_SCALE
          ) {
            return false;
          }

          const localPoints = screenPoints.map((point) => ({
            x: point.x - minX + POLYGON_PREVIEW_PADDING_PX,
            y: point.y - minY + POLYGON_PREVIEW_PADDING_PX,
          }));
          const pointsAttr = localPoints
            .map((point) => `${point.x},${point.y}`)
            .join(" ");

          const polygonEl = elementDiv.querySelector(
            '[data-polygon-preview-shape="true"]'
          ) as SVGPolygonElement | null;
          if (!polygonEl) {
            return false;
          }
          polygonEl.setAttribute("points", pointsAttr);
          polygonEl.setAttribute(
            "fill",
            getPolygonPreviewFillColor(group.surfaceType, group.closed)
          );

          const areaLabelEl = elementDiv.querySelector(
            '[data-polygon-preview-area-label="true"]'
          ) as SVGTextElement | null;
          const areaLabelSecondaryEl = elementDiv.querySelector(
            '[data-polygon-preview-area-label-secondary="true"]'
          ) as SVGTextElement | null;
          if (areaLabelEl) {
            const { planarText, projectedHorizontalText } =
              getPolygonAreaLabelText(group);
            areaLabelEl.textContent = planarText;
            areaLabelEl.setAttribute("transform", "");

            const centroidAnchor = computePolygonCentroid2D(localPoints);
            if (!centroidAnchor) {
              areaLabelEl.style.display = "none";
              if (areaLabelSecondaryEl) {
                areaLabelSecondaryEl.style.display = "none";
              }
            } else {
              const clampedAnchor: ScreenPoint2D = {
                x: clampToRange(centroidAnchor.x, 0, width),
                y: clampToRange(centroidAnchor.y, 0, height),
              };

              areaLabelEl.setAttribute("x", `${clampedAnchor.x}`);
              areaLabelEl.setAttribute(
                "y",
                `${
                  clampedAnchor.y -
                  (projectedHorizontalText
                    ? POLYGON_AREA_LABEL_FONT_SIZE_PX * 0.45
                    : 0)
                }`
              );

              if (areaLabelSecondaryEl) {
                areaLabelSecondaryEl.textContent =
                  projectedHorizontalText ?? "";
                areaLabelSecondaryEl.setAttribute("x", `${clampedAnchor.x}`);
                areaLabelSecondaryEl.setAttribute(
                  "y",
                  `${
                    clampedAnchor.y +
                    (projectedHorizontalText
                      ? POLYGON_AREA_LABEL_FONT_SIZE_PX * 0.55
                      : 0)
                  }`
                );
                areaLabelSecondaryEl.style.display = projectedHorizontalText
                  ? "block"
                  : "none";
              }

              areaLabelEl.style.display = "block";
            }
          }

          elementDiv.style.position = "absolute";
          elementDiv.style.left = `${minX - POLYGON_PREVIEW_PADDING_PX}px`;
          elementDiv.style.top = `${minY - POLYGON_PREVIEW_PADDING_PX}px`;
          elementDiv.style.width = `${width}px`;
          elementDiv.style.height = `${height}px`;
          elementDiv.style.transform = "none";
          elementDiv.style.pointerEvents = "none";
          elementDiv.style.zIndex = "4";

          return true;
        },
      });

      nextOverlayIds.push(overlayId);
    });

    polygonPreviewOverlayIdsRef.current = nextOverlayIds;

    return () => {
      nextOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      polygonPreviewOverlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    polygonPreviewContent,
    polygonPreviewGroups,
    removeLabelOverlayElement,
    scene,
  ]);

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

  const midpointMarkerContent = useMemo(
    () =>
      createElement(
        "div",
        {
          style: {
            position: "relative",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          },
        },
        createElement("div", {
          style: {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: `${MIDPOINT_MARKER_TICK_LENGTH_PX}px`,
            height: `${MIDPOINT_MARKER_TICK_WIDTH_PX}px`,
            borderRadius: "999px",
            background: "rgba(255, 255, 255, 0.95)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          },
        })
      ),
    []
  );

  useEffect(() => {
    midpointOverlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    midpointOverlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const nextMidpointOverlayIds: string[] = [];

    resolvedRelations
      .filter(({ relation }) => {
        if (!selectedPlanarPolygonGroupId) return false;
        if (!relation.showDirectLine) return false;
        return splitMarkerRelationIdSet.has(relation.id);
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
            elementDiv.style.position = "absolute";
            elementDiv.style.left = `${center.x}px`;
            elementDiv.style.top = `${center.y}px`;
            elementDiv.style.width = `${MIDPOINT_MARKER_HIT_TARGET_PX}px`;
            elementDiv.style.height = `${MIDPOINT_MARKER_HIT_TARGET_PX}px`;
            elementDiv.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
            elementDiv.style.transformOrigin = "50% 50%";
            elementDiv.style.pointerEvents = onDistanceRelationMidpointClick
              ? "auto"
              : "none";
            elementDiv.style.cursor = onDistanceRelationMidpointClick
              ? "pointer"
              : "default";
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
    scene,
    selectedPlanarPolygonGroupId,
    splitMarkerRelationIdSet,
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
      midpointOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      midpointOverlayIdsRef.current = [];
      polygonPreviewOverlayIdsRef.current.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      polygonPreviewOverlayIdsRef.current = [];
      destroyLineVisualizerMap(directLineRefs);
      destroyLineVisualizerMap(verticalLineRefs);
      destroyLineVisualizerMap(horizontalLineRefs);
    };
  }, [removeLabelOverlayElement]);
};

export default useCesiumDistanceVisualizer;
