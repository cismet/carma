import {
  Fragment,
  createElement,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  Cartesian2,
  Cartesian3,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma/cesium";

import {
  computePointLabelLayout,
  DEFAULT_POINT_LABEL_LAYOUT_CONFIG,
  formatNumberToEnclosed,
  resolvePointLabelLayoutConfig,
  usePointLabels,
  type LayoutPointInput,
  type PointLabelData,
  type PointLabelLayoutConfig,
  type PointLabelLayoutConfigOverrides,
  type PointLabelLayoutResult,
  type ScreenPoint,
} from "@carma-providers/label-overlay";

import {
  DEFAULT_POINT_LABEL_METRIC_MODE,
  type PlanarPolygonPlane,
  type PointLabelMetricMode,
  type PointMeasurementEntry,
} from "../types/MeasurementTypes";
import {
  isPointOccluded,
  isPointInViewport,
} from "../utils/occlusionDetection";
import { getCustomPointMeasurementName } from "../utils/measurementNaming";
import { formatNumber } from "../utils/formatting";

export type CesiumLabelLayoutConfig = PointLabelLayoutConfig;
export type CesiumLabelLayoutConfigOverrides = PointLabelLayoutConfigOverrides;
export const DEFAULT_CESIUM_LABEL_LAYOUT_CONFIG =
  DEFAULT_POINT_LABEL_LAYOUT_CONFIG;
export type { PointLabelMetricMode };
export { DEFAULT_POINT_LABEL_METRIC_MODE };
const ELEVATION_NEUTRAL_THRESHOLD_METERS = 0.03;
const REFERENCE_POINT_DISTANCE_EPSILON_METERS = 0.001;
const GLYPH_SIZE_EM = 1;
const ELEVATION_GLYPH_UP = "↥";
const ELEVATION_GLYPH_DOWN = "↧";
const DISTANCE_GLYPH_LEFT = "⭠";
const DISTANCE_GLYPH_RIGHT = "⭢";
const NORMAL_MARKER_SIZE_PX = 10;
const MOVE_GIZMO_MARKER_SIZE_PX = 36;
const MOVE_GIZMO_MARKER_SIZE_DRAGGING_PX = 40;
const MOVE_GIZMO_MARKER_INNER_SCALE_IDLE = 0;
const MOVE_GIZMO_MARKER_INNER_SCALE_DRAGGING = 0.68;
const MOVE_GIZMO_MARKER_INNER_COLOR = "rgba(255, 255, 255, 0.96)";

// Viewport padding constants for smooth label transitions
const VIEWPORT_PADDING_HORIZONTAL = 100; // pixels
const VIEWPORT_PADDING_VERTICAL = 50; // pixels
const PLANE_INTERSECTION_EPSILON = 1e-8;

const EMPTY_LAYOUT_RESULT: PointLabelLayoutResult = {
  placements: {},
  hiddenByLayout: new Set<string>(),
};

const formatMeters = (value: number): string => `${formatNumber(value)}m`;
const GLYPH_BASE_STYLE: CSSProperties = {
  display: "inline-block",
  fontSize: `${GLYPH_SIZE_EM}em`,
  lineHeight: 1,
};

const renderGlyph = (glyph: string, rotationDeg?: number) =>
  createElement(
    "span",
    {
      style:
        rotationDeg === undefined
          ? GLYPH_BASE_STYLE
          : {
              ...GLYPH_BASE_STYLE,
              transform: `rotate(${rotationDeg}deg)`,
              transformOrigin: "50% 50%",
            },
    },
    glyph
  );

type PointLabelTextRepresentation = {
  layoutText: string;
  content?: ReactNode;
  contentSignature?: string;
};

const getPointLabelBase = (
  pointName: string | undefined,
  pointIndex: number
): string => {
  const customPointName = getCustomPointMeasurementName(pointName);
  return customPointName ?? formatNumberToEnclosed(pointIndex + 1);
};

const getReferenceLabelBase = (
  points: PointMeasurementEntry[],
  distanceToReferenceByPointId?: Readonly<Record<string, number>>
): string | undefined => {
  const referencePointIndex = points.findIndex((candidatePoint) => {
    const distanceToReference =
      distanceToReferenceByPointId?.[candidatePoint.id];
    return (
      distanceToReference !== undefined &&
      Math.abs(distanceToReference) <= REFERENCE_POINT_DISTANCE_EPSILON_METERS
    );
  });

  if (referencePointIndex < 0) return undefined;

  return getPointLabelBase(
    points[referencePointIndex]?.name,
    referencePointIndex
  );
};

const areBooleanMapsDifferent = (
  prev: Record<string, boolean>,
  next: Record<string, boolean>,
  ids: string[]
): boolean => ids.some((id) => Boolean(prev[id]) !== Boolean(next[id]));

const areScreenPointMapsDifferent = (
  prev: Record<string, ScreenPoint>,
  next: Record<string, ScreenPoint>,
  ids: string[]
): boolean =>
  ids.some((id) => {
    const prevPoint = prev[id];
    const nextPoint = next[id];
    if (!prevPoint && !nextPoint) return false;
    if (!prevPoint || !nextPoint) return true;
    return prevPoint.x !== nextPoint.x || prevPoint.y !== nextPoint.y;
  });

const formatNoneLabelText = (
  labelBase: string
): PointLabelTextRepresentation => ({
  layoutText: labelBase,
});

const formatElevationLabelText = (
  labelBase: string,
  pointHeight: number,
  referenceElevation: number
): PointLabelTextRepresentation => {
  const elevationDelta = pointHeight - referenceElevation;
  const absoluteElevationDelta = Math.abs(elevationDelta);
  const elevationValue = formatMeters(elevationDelta);

  if (absoluteElevationDelta < ELEVATION_NEUTRAL_THRESHOLD_METERS) {
    return {
      layoutText: `${labelBase} ${elevationValue}`,
    };
  }

  const elevationGlyph =
    elevationDelta > 0 ? ELEVATION_GLYPH_UP : ELEVATION_GLYPH_DOWN;

  return {
    layoutText: `${labelBase} ${elevationValue} ${elevationGlyph}`,
    content: createElement(
      Fragment,
      null,
      labelBase,
      " ",
      elevationValue,
      " ",
      renderGlyph(elevationGlyph)
    ),
    contentSignature: `${labelBase}:${elevationGlyph}:${elevationValue}`,
  };
};

const formatAbsoluteElevationLabelText = (
  labelBase: string,
  pointHeight: number
): PointLabelTextRepresentation => ({
  layoutText: `${labelBase} ${formatMeters(pointHeight)}`,
});

const formatDistanceLabelText = (
  labelBase: string,
  pointDistanceToReference?: number,
  referenceLabelBase?: string
): PointLabelTextRepresentation => {
  const distanceToReference = pointDistanceToReference ?? 0;
  const isReferencePointLabel =
    Math.abs(distanceToReference) <= REFERENCE_POINT_DISTANCE_EPSILON_METERS;

  if (isReferencePointLabel || !referenceLabelBase) {
    return formatNoneLabelText(labelBase);
  }

  const distanceValue = formatMeters(distanceToReference);

  return {
    layoutText: `${referenceLabelBase} ${DISTANCE_GLYPH_LEFT} ${distanceValue} ${DISTANCE_GLYPH_RIGHT} ${labelBase}`,
    content: createElement(
      Fragment,
      null,
      referenceLabelBase,
      " ",
      renderGlyph(DISTANCE_GLYPH_LEFT),
      " ",
      distanceValue,
      " ",
      renderGlyph(DISTANCE_GLYPH_RIGHT),
      " ",
      labelBase
    ),
    contentSignature: `${referenceLabelBase}:${distanceValue}:${labelBase}`,
  };
};

const formatPointLabelText = (
  pointIndex: number,
  pointHeight: number,
  referenceElevation: number,
  pointName?: string,
  pointLabelMetricMode: PointLabelMetricMode = DEFAULT_POINT_LABEL_METRIC_MODE,
  pointDistanceToReference?: number,
  referenceLabelBase?: string
): PointLabelTextRepresentation => {
  const labelBase = getPointLabelBase(pointName, pointIndex);

  if (pointLabelMetricMode === "distance") {
    return formatDistanceLabelText(
      labelBase,
      pointDistanceToReference,
      referenceLabelBase
    );
  }

  if (pointLabelMetricMode === "elevation") {
    return formatElevationLabelText(labelBase, pointHeight, referenceElevation);
  }

  if (pointLabelMetricMode === "absoluteElevation") {
    return formatAbsoluteElevationLabelText(labelBase, pointHeight);
  }

  return formatNoneLabelText(labelBase);
};

const sanitizePositiveScale = (value: number | undefined): number =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 1;

const getPlaneIntersectionForClientPosition = (
  scene: Scene | null,
  clientX: number,
  clientY: number,
  plane: PlanarPolygonPlane
): Cartesian3 | null => {
  if (!scene || scene.isDestroyed()) return null;

  const canvasRect = scene.canvas.getBoundingClientRect();
  const windowPosition = new Cartesian2(
    clientX - canvasRect.left,
    clientY - canvasRect.top
  );
  const pickRay = scene.camera.getPickRay(windowPosition);
  if (!pickRay) return null;

  const planeAnchor = new Cartesian3(
    plane.anchorECEF.x,
    plane.anchorECEF.y,
    plane.anchorECEF.z
  );
  const planeNormalRaw = new Cartesian3(
    plane.normalECEF.x,
    plane.normalECEF.y,
    plane.normalECEF.z
  );
  if (
    Cartesian3.magnitudeSquared(planeNormalRaw) <= PLANE_INTERSECTION_EPSILON
  ) {
    return null;
  }
  const planeNormal = Cartesian3.normalize(planeNormalRaw, new Cartesian3());
  const denominator = Cartesian3.dot(planeNormal, pickRay.direction);
  if (Math.abs(denominator) <= PLANE_INTERSECTION_EPSILON) {
    return null;
  }

  const originToPlane = Cartesian3.subtract(
    planeAnchor,
    pickRay.origin,
    new Cartesian3()
  );
  const axisParameter =
    Cartesian3.dot(planeNormal, originToPlane) / denominator;
  if (!Number.isFinite(axisParameter) || axisParameter < 0) {
    return null;
  }

  return Cartesian3.add(
    pickRay.origin,
    Cartesian3.multiplyByScalar(
      pickRay.direction,
      axisParameter,
      new Cartesian3()
    ),
    new Cartesian3()
  );
};

export const useCesiumPointLabels = (
  scene: Scene | null,
  points: PointMeasurementEntry[],
  showLabels: boolean,
  referenceElevation: number = 0,
  selectedPointId: string | null = null,
  moveGizmoPointId: string | null = null,
  moveGizmoIsDragging: boolean = false,
  onPointClick?: (pointId: string) => void,
  onPointDoubleClick?: (pointId: string) => void,
  onPointLongPress?: (pointId: string) => void,
  pointLongPressDurationMs: number = 300,
  layoutConfigOverrides?: CesiumLabelLayoutConfigOverrides,
  distanceToReferenceByPointId?: Readonly<Record<string, number>>,
  hiddenPointLabelIds?: ReadonlySet<string>,
  pointDragPlaneByPointId?: Readonly<Record<string, PlanarPolygonPlane>>,
  onPointPlaneDragStart?: (pointId: string) => void,
  onPointPlaneDragPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void,
  onPointPlaneDragEnd?: (pointId: string) => void,
  moveGizmoMarkerSizeScale: number = 1,
  moveGizmoLabelDistanceScale: number = 1
) => {
  const [occlusionResults, setOcclusionResults] = useState<
    Record<string, boolean>
  >({});
  const [hiddenResults, setHiddenResults] = useState<Record<string, boolean>>(
    {}
  );
  const [projectedPositions, setProjectedPositions] = useState<
    Record<string, ScreenPoint>
  >({});
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);

  const layoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(layoutConfigOverrides),
    [layoutConfigOverrides]
  );
  const resolvedMoveGizmoMarkerSizeScale = useMemo(
    () => sanitizePositiveScale(moveGizmoMarkerSizeScale),
    [moveGizmoMarkerSizeScale]
  );
  const resolvedMoveGizmoLabelDistanceScale = useMemo(
    () => sanitizePositiveScale(moveGizmoLabelDistanceScale),
    [moveGizmoLabelDistanceScale]
  );
  const moveGizmoMarkerSizePx = useMemo(
    () => MOVE_GIZMO_MARKER_SIZE_PX * resolvedMoveGizmoMarkerSizeScale,
    [resolvedMoveGizmoMarkerSizeScale]
  );
  const moveGizmoMarkerSizeDraggingPx = useMemo(
    () => MOVE_GIZMO_MARKER_SIZE_DRAGGING_PX * resolvedMoveGizmoMarkerSizeScale,
    [resolvedMoveGizmoMarkerSizeScale]
  );

  // Keep camera pitch in sync while the camera moves.
  useEffect(() => {
    if (!scene || scene.isDestroyed() || !showLabels) return;

    const updatePitch = () => {
      const currentPitch = scene.camera.pitch;
      setCameraPitch((prev) =>
        Math.abs(currentPitch - prev) > 0.001 ? currentPitch : prev
      );
    };

    updatePitch();
    const removePostRenderListener =
      scene.postRender.addEventListener(updatePitch);

    return () => {
      if (removePostRenderListener) {
        removePostRenderListener();
      }
    };
  }, [scene, showLabels]);

  // Cesium-specific visibility and occlusion detection.
  useEffect(() => {
    if (!scene || scene.isDestroyed() || !showLabels) return;

    const checkVisibilityAndOcclusion = () => {
      const newOcclusionResults: Record<string, boolean> = {};
      const newHiddenResults: Record<string, boolean> = {};
      const newProjectedPositions: Record<string, ScreenPoint> = {};

      points.forEach((point) => {
        const canvasPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          point.geometryECEF
        );

        if (!defined(canvasPosition)) {
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false;
          return;
        }

        const inViewport = isPointInViewport(
          canvasPosition,
          scene.canvas.clientWidth,
          scene.canvas.clientHeight,
          VIEWPORT_PADDING_HORIZONTAL,
          VIEWPORT_PADDING_VERTICAL
        );

        if (!inViewport) {
          newHiddenResults[point.id] = true;
          newOcclusionResults[point.id] = false;
          return;
        }

        newHiddenResults[point.id] = false;
        newProjectedPositions[point.id] = {
          x: canvasPosition.x,
          y: canvasPosition.y,
        };

        newOcclusionResults[point.id] = isPointOccluded(
          scene,
          point.geometryECEF,
          canvasPosition,
          1.0
        );
      });

      const pointIds = points.map((point) => point.id);

      setOcclusionResults((prev) =>
        areBooleanMapsDifferent(prev, newOcclusionResults, pointIds)
          ? newOcclusionResults
          : prev
      );
      setHiddenResults((prev) =>
        areBooleanMapsDifferent(prev, newHiddenResults, pointIds)
          ? newHiddenResults
          : prev
      );
      setProjectedPositions((prev) =>
        areScreenPointMapsDifferent(prev, newProjectedPositions, pointIds)
          ? newProjectedPositions
          : prev
      );
    };

    const removePostRenderListener = scene.postRender.addEventListener(
      checkVisibilityAndOcclusion
    );

    checkVisibilityAndOcclusion();

    return () => {
      if (removePostRenderListener) {
        removePostRenderListener();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, points, showLabels]);

  const pointLabelTextById = useMemo<
    Readonly<Record<string, PointLabelTextRepresentation>>
  >(() => {
    const referenceLabelBase = getReferenceLabelBase(
      points,
      distanceToReferenceByPointId
    );

    return Object.fromEntries(
      points.map((point, index) => {
        const pointLabelMetricMode =
          point.pointLabelMode ?? DEFAULT_POINT_LABEL_METRIC_MODE;
        const labelTextRepresentation = formatPointLabelText(
          index,
          point.geometryWGS84.height,
          referenceElevation,
          point.name,
          pointLabelMetricMode,
          distanceToReferenceByPointId?.[point.id],
          referenceLabelBase
        );

        return [point.id, labelTextRepresentation];
      })
    );
  }, [points, referenceElevation, distanceToReferenceByPointId]);

  const layoutResult = useMemo((): PointLabelLayoutResult => {
    if (!scene || scene.isDestroyed()) {
      return EMPTY_LAYOUT_RESULT;
    }

    const layoutPoints: LayoutPointInput[] = points
      .map((point, index) => {
        const anchor = projectedPositions[point.id];
        if (!anchor || hiddenResults[point.id]) return null;
        const labelTextRepresentation = pointLabelTextById[point.id];
        if (!labelTextRepresentation) return null;
        const isDraggedMoveGizmoPoint =
          moveGizmoIsDragging && point.id === moveGizmoPointId;

        return {
          id: point.id,
          anchor,
          text: labelTextRepresentation.layoutText,
          index,
          ...(isDraggedMoveGizmoPoint
            ? {
                layoutPriority: Number.MAX_SAFE_INTEGER,
                lockPreferredPlacement: true,
              }
            : {}),
        };
      })
      .filter((point): point is LayoutPointInput => Boolean(point));

    return computePointLabelLayout({
      points: layoutPoints,
      viewportWidth: scene.canvas.clientWidth,
      viewportHeight: scene.canvas.clientHeight,
      cameraPitch,
      config: layoutConfig,
    });
  }, [
    scene,
    points,
    projectedPositions,
    hiddenResults,
    pointLabelTextById,
    moveGizmoPointId,
    moveGizmoIsDragging,
    layoutConfig,
    cameraPitch,
  ]);

  const pointLabelData: PointLabelData[] = useMemo(() => {
    return points.map((point, index) => {
      const labelTextRepresentation =
        pointLabelTextById[point.id] ??
        formatNoneLabelText(getPointLabelBase(point.name, index));
      const isMoveGizmoPoint = point.id === moveGizmoPointId;
      const disableInteractionsForMoveGizmoPoint = isMoveGizmoPoint;
      const dragPlane = pointDragPlaneByPointId?.[point.id];
      const canDirectPlaneDrag = Boolean(
        dragPlane && onPointPlaneDragPositionChange
      );
      const updatePointFromDragPosition = (
        clientX: number,
        clientY: number
      ) => {
        if (!dragPlane || !onPointPlaneDragPositionChange) return;
        const nextPosition = getPlaneIntersectionForClientPosition(
          scene,
          clientX,
          clientY,
          dragPlane
        );
        if (!nextPosition) return;
        onPointPlaneDragPositionChange(point.id, nextPosition);
      };

      return {
        id: point.id,
        getCanvasPosition: () => {
          if (!scene || scene.isDestroyed()) return null;
          const canvasPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            point.geometryECEF
          );
          return defined(canvasPosition)
            ? { x: canvasPosition.x, y: canvasPosition.y }
            : null;
        },
        pitch: cameraPitch,
        labelAngleRad: layoutResult.placements[point.id]?.angleRad,
        labelDistance:
          isMoveGizmoPoint &&
          layoutResult.placements[point.id]?.distance !== undefined
            ? layoutResult.placements[point.id].distance *
              resolvedMoveGizmoLabelDistanceScale
            : layoutResult.placements[point.id]?.distance,
        labelAttach: layoutResult.placements[point.id]?.attach,
        hideLabelAndStem:
          layoutResult.hiddenByLayout.has(point.id) ||
          Boolean(hiddenPointLabelIds?.has(point.id)),
        text: labelTextRepresentation.layoutText,
        content: labelTextRepresentation.content,
        contentSignature: labelTextRepresentation.contentSignature,
        markerSize: isMoveGizmoPoint
          ? moveGizmoIsDragging
            ? moveGizmoMarkerSizeDraggingPx
            : moveGizmoMarkerSizePx
          : undefined,
        markerInnerScale: isMoveGizmoPoint
          ? moveGizmoIsDragging
            ? MOVE_GIZMO_MARKER_INNER_SCALE_DRAGGING
            : MOVE_GIZMO_MARKER_INNER_SCALE_IDLE
          : undefined,
        markerInnerColor: isMoveGizmoPoint
          ? MOVE_GIZMO_MARKER_INNER_COLOR
          : undefined,
        markerInnerOpacity: isMoveGizmoPoint ? 1 : undefined,
        stemReferenceMarkerSize: isMoveGizmoPoint
          ? NORMAL_MARKER_SIZE_PX
          : undefined,
        selected: point.id === selectedPointId,
        visible: true,
        isOccluded: occlusionResults[point.id] || false,
        isHidden: hiddenResults[point.id] || false,
        onClick:
          !disableInteractionsForMoveGizmoPoint && onPointClick
            ? () => onPointClick(point.id)
            : undefined,
        onDoubleClick:
          !disableInteractionsForMoveGizmoPoint && onPointDoubleClick
            ? () => onPointDoubleClick(point.id)
            : undefined,
        onLongPress:
          !disableInteractionsForMoveGizmoPoint &&
          !canDirectPlaneDrag &&
          onPointLongPress
            ? () => onPointLongPress(point.id)
            : undefined,
        longPressDurationMs: pointLongPressDurationMs,
        onMarkerDragStart: canDirectPlaneDrag
          ? (clientX: number, clientY: number) => {
              onPointPlaneDragStart?.(point.id);
              updatePointFromDragPosition(clientX, clientY);
            }
          : undefined,
        onMarkerDragMove: canDirectPlaneDrag
          ? (clientX: number, clientY: number) => {
              updatePointFromDragPosition(clientX, clientY);
            }
          : undefined,
        onMarkerDragEnd: canDirectPlaneDrag
          ? () => onPointPlaneDragEnd?.(point.id)
          : undefined,
      };
    });
  }, [
    points,
    pointLabelTextById,
    selectedPointId,
    moveGizmoPointId,
    moveGizmoIsDragging,
    occlusionResults,
    hiddenResults,
    scene,
    cameraPitch,
    layoutResult,
    moveGizmoMarkerSizePx,
    moveGizmoMarkerSizeDraggingPx,
    resolvedMoveGizmoLabelDistanceScale,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    pointLongPressDurationMs,
    hiddenPointLabelIds,
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
  ]);

  usePointLabels(pointLabelData, showLabels, undefined, undefined, {
    transitionDurationMs: layoutConfig.transitionDurationMs,
  });
};

export default useCesiumPointLabels;
