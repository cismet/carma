import {
  Fragment,
  createElement,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { SceneTransforms, defined, type Scene } from "@carma/cesium";

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

// Viewport padding constants for smooth label transitions
const VIEWPORT_PADDING_HORIZONTAL = 100; // pixels
const VIEWPORT_PADDING_VERTICAL = 50; // pixels

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

  return formatNoneLabelText(labelBase);
};

export const useCesiumPointLabels = (
  scene: Scene | null,
  points: PointMeasurementEntry[],
  showLabels: boolean,
  referenceElevation: number = 0,
  selectedPointId: string | null = null,
  onPointClick?: (pointId: string) => void,
  layoutConfigOverrides?: CesiumLabelLayoutConfigOverrides,
  distanceToReferenceByPointId?: Readonly<Record<string, number>>
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

        return {
          id: point.id,
          selected: point.id === selectedPointId,
          anchor,
          text: labelTextRepresentation.layoutText,
          index,
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
    selectedPointId,
    layoutConfig,
    cameraPitch,
  ]);

  const pointLabelData: PointLabelData[] = useMemo(() => {
    return points.map((point, index) => {
      const labelTextRepresentation =
        pointLabelTextById[point.id] ??
        formatNoneLabelText(getPointLabelBase(point.name, index));

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
        labelDistance: layoutResult.placements[point.id]?.distance,
        labelAttach: layoutResult.placements[point.id]?.attach,
        hideLabelAndStem: layoutResult.hiddenByLayout.has(point.id),
        text: labelTextRepresentation.layoutText,
        content: labelTextRepresentation.content,
        contentSignature: labelTextRepresentation.contentSignature,
        selected: point.id === selectedPointId,
        visible: true,
        isOccluded: occlusionResults[point.id] || false,
        isHidden: hiddenResults[point.id] || false,
        onClick: onPointClick ? () => onPointClick(point.id) : undefined,
      };
    });
  }, [
    points,
    pointLabelTextById,
    selectedPointId,
    occlusionResults,
    hiddenResults,
    scene,
    cameraPitch,
    layoutResult,
    onPointClick,
  ]);

  usePointLabels(pointLabelData, showLabels, undefined, undefined, {
    transitionDurationMs: layoutConfig.transitionDurationMs,
  });
};

export default useCesiumPointLabels;
