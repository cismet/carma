import {
  Fragment,
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  Cartesian2,
  Cartesian3,
  SceneTransforms,
  defined,
  getDegreesFromCartesian,
  type Scene,
} from "@carma/cesium";

import {
  computePointLabelLayout,
  DEFAULT_POINT_LABEL_LAYOUT_CONFIG,
  resolvePointLabelLayoutConfig,
  useLineVisualizers,
  usePointLabels,
  type LineVisualizerData,
  type LayoutPointInput,
  type PointLabelData,
  type PointLabelLayoutConfig,
  type PointLabelLayoutConfigOverrides,
  type PointLabelLayoutResult,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma/units/types";
import {
  formatNumber,
  getCustomPointAnnotationName,
} from "@carma-mapping/annotations/core";

import {
  DEFAULT_POINT_LABEL_METRIC_MODE,
  type PlanarPolygonPlane,
  type PointLabelMetricMode,
  type PointAnnotationEntry,
} from "../types/AnnotationTypes";
import { useCesiumSceneVisibilityIndex } from "./useCesiumSceneVisibilityIndex";
import { usePointRectangleSelectionOverlay } from "./usePointRectangleSelectionOverlay";

export type CesiumLabelLayoutConfig = PointLabelLayoutConfig;
export type CesiumLabelLayoutConfigOverrides = PointLabelLayoutConfigOverrides;
export const DEFAULT_CESIUM_LABEL_LAYOUT_CONFIG =
  DEFAULT_POINT_LABEL_LAYOUT_CONFIG;
export type PointMarkerBadge = {
  text: string;
  backgroundColor?: string;
  textColor?: string;
};
const ELEVATION_NEUTRAL_THRESHOLD_METERS = 0.03;
const REFERENCE_POINT_DISTANCE_EPSILON_METERS = 0.001;
const GLYPH_SIZE_EM = 1;
const ELEVATION_GLYPH_UP = "↥";
const ELEVATION_GLYPH_DOWN = "↧";
const NORMAL_MARKER_SIZE_PX = 10;
const MOVE_GIZMO_MARKER_SIZE_PX = 36;
const MOVE_GIZMO_MARKER_SIZE_DRAGGING_PX = 40;
const MOVE_GIZMO_MARKER_INNER_SCALE_IDLE = 0;
const MOVE_GIZMO_MARKER_INNER_SCALE_DRAGGING = 0.68;
const MOVE_GIZMO_MARKER_INNER_COLOR = "rgba(255, 255, 255, 0.96)";
const LABEL_BADGE_GAP_PX = 4;
const INPUT_CARET_BLINK_INTERVAL_MS = 530;
const AREA_NODE_BADGE_REGEX = /^[ADF]\d+$/i;

// Viewport padding constants for smooth label transitions
const VIEWPORT_PADDING_HORIZONTAL = 100; // pixels
const VIEWPORT_PADDING_VERTICAL = 50; // pixels
const PLANE_INTERSECTION_EPSILON = 1e-8;

const EMPTY_LAYOUT_RESULT: PointLabelLayoutResult = {
  placements: {},
  hiddenByLayout: new Set<string>(),
  collapsedToCompact: new Set<string>(),
};

const formatMeters = (value: number): string => `${formatNumber(value)}m`;
const GLYPH_BASE_STYLE: CSSProperties = {
  display: "inline-block",
  fontSize: `${GLYPH_SIZE_EM}em`,
  lineHeight: 1,
};
const INPUT_CARET_STYLE: CSSProperties = {
  display: "inline-block",
  width: 1,
  height: "1em",
  marginLeft: 2,
  verticalAlign: "-0.1em",
  backgroundColor: "currentColor",
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

const BlinkingInputCaret = () => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setVisible((previousVisible) => !previousVisible);
    }, INPUT_CARET_BLINK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  return createElement("span", {
    "aria-hidden": true,
    style: {
      ...INPUT_CARET_STYLE,
      opacity: visible ? 1 : 0,
    },
  });
};

type PointLabelTextRepresentation = {
  layoutText: string;
  content?: ReactNode;
  contentSignature?: string;
};

const getPointLabelBase = (
  pointName: string | undefined,
  pointIndex: number,
  isAuxiliaryLabelAnchor: boolean = false,
  pointLabelOverride?: string,
  preferDefaultNaming: boolean = false
): string => {
  if (!preferDefaultNaming) {
    const customPointName = getCustomPointAnnotationName(pointName);
    if (customPointName) return customPointName;
  }
  if (isAuxiliaryLabelAnchor) return "";
  if (pointLabelOverride && pointLabelOverride.trim().length > 0) {
    return pointLabelOverride;
  }
  return `${pointIndex + 1}`;
};

const getReferenceLabelBase = (
  points: PointAnnotationEntry[],
  distanceToReferenceByPointId?: Readonly<Record<string, number>>,
  referenceLabelPointId?: string | null,
  pointLabelIndexByPointId?: Readonly<Record<string, number>>,
  pointMarkerBadgeByPointId?: Readonly<Record<string, PointMarkerBadge>>,
  preferDefaultNaming: boolean = false
): string | undefined => {
  if (referenceLabelPointId) {
    const referencePointIndex = points.findIndex(
      (candidatePoint) => candidatePoint.id === referenceLabelPointId
    );
    if (referencePointIndex >= 0) {
      const referencePoint = points[referencePointIndex];
      if (!referencePoint) return undefined;
      const effectiveReferenceIndex =
        pointLabelIndexByPointId?.[referencePoint.id] ?? referencePointIndex;
      return getPointLabelBase(
        referencePoint.name,
        effectiveReferenceIndex,
        false,
        pointMarkerBadgeByPointId?.[referencePoint.id]?.text,
        preferDefaultNaming
      );
    }
  }

  const referencePointIndex = points.findIndex((candidatePoint) => {
    const distanceToReference =
      distanceToReferenceByPointId?.[candidatePoint.id];
    return (
      distanceToReference !== undefined &&
      Math.abs(distanceToReference) <= REFERENCE_POINT_DISTANCE_EPSILON_METERS
    );
  });

  if (referencePointIndex < 0) return undefined;

  const referencePoint = points[referencePointIndex];
  if (!referencePoint) return undefined;
  const effectiveReferenceIndex =
    pointLabelIndexByPointId?.[referencePoint.id] ?? referencePointIndex;
  return getPointLabelBase(
    referencePoint.name,
    effectiveReferenceIndex,
    false,
    pointMarkerBadgeByPointId?.[referencePoint.id]?.text,
    preferDefaultNaming
  );
};

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

const formatOffsetElevationLabelText = (
  labelBase: string,
  baseRelativeHeightMeters: number,
  offsetMeters: number
): PointLabelTextRepresentation => {
  const offsetSign = offsetMeters >= 0 ? "+" : "-";
  return {
    layoutText: `${labelBase} ${formatNumber(
      baseRelativeHeightMeters
    )} ${offsetSign} ${formatNumber(Math.abs(offsetMeters))}m`.trim(),
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

  if (referenceLabelBase === labelBase) {
    return formatNoneLabelText(labelBase);
  }

  return {
    layoutText: `${referenceLabelBase} ↔ ${labelBase}`,
    content: createElement(
      Fragment,
      null,
      referenceLabelBase,
      " ",
      "↔",
      " ",
      labelBase
    ),
    contentSignature: `${referenceLabelBase}:↔:${labelBase}`,
  };
};

const formatPointLabelText = (
  pointIndex: number,
  pointHeight: number,
  referenceElevation: number,
  pointName?: string,
  isAuxiliaryLabelAnchor: boolean = false,
  pointLabelMetricMode: PointLabelMetricMode = DEFAULT_POINT_LABEL_METRIC_MODE,
  pointDistanceToReference?: number,
  referenceLabelBase?: string,
  pointLabelOverride?: string,
  preferDefaultNaming: boolean = false
): PointLabelTextRepresentation => {
  const labelBase = getPointLabelBase(
    pointName,
    pointIndex,
    isAuxiliaryLabelAnchor,
    pointLabelOverride,
    preferDefaultNaming
  );

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

const getLabelTextWithoutLeadingBadge = (
  labelText: string,
  badgeText: string
): string => {
  if (!labelText) return "";
  const normalizedLabelText = labelText.trim();
  const normalizedBadgeText = badgeText.trim();
  if (!normalizedBadgeText) return normalizedLabelText;
  if (normalizedLabelText === normalizedBadgeText) return "";
  if (normalizedLabelText.startsWith(`${normalizedBadgeText} `)) {
    return normalizedLabelText.slice(normalizedBadgeText.length + 1);
  }
  return normalizedLabelText;
};

const createInlineLabelBadgeContent = (
  labelText: string,
  badgeText: string,
  badgeBackgroundColor?: string,
  badgeTextColor?: string
): ReactNode => {
  const suffixText = getLabelTextWithoutLeadingBadge(labelText, badgeText);
  return createElement(
    Fragment,
    null,
    createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "16px",
          height: "16px",
          padding: "0 4px",
          borderRadius: "999px",
          border: "1px solid rgba(255, 255, 255, 0.95)",
          backgroundColor: badgeBackgroundColor ?? "rgba(200, 200, 200, 0.92)",
          color: badgeTextColor ?? "#111111",
          fontSize: "10px",
          fontWeight: 600,
          lineHeight: 1,
          boxSizing: "border-box",
          verticalAlign: "middle",
        } satisfies CSSProperties,
      },
      badgeText
    ),
    suffixText
      ? createElement(
          "span",
          {
            style: {
              marginLeft: LABEL_BADGE_GAP_PX,
            } satisfies CSSProperties,
          },
          suffixText
        )
      : null
  );
};

const sanitizePositiveScale = (value: number | undefined): number =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 1;

const sanitizePointLabelFontSizePx = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 12;
  const parsed = Math.round(Number(value));
  return Math.min(48, Math.max(10, parsed));
};

const sanitizeCssColorString = (
  value: string | undefined
): string | undefined => {
  if (!value) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
};

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
  points: PointAnnotationEntry[],
  showLabels: boolean,
  referenceElevation: number = 0,
  selectedPointId: string | null = null,
  selectedPointIds: string[] = [],
  moveGizmoPointId: string | null = null,
  moveGizmoIsDragging: boolean = false,
  onPointClick?: (pointId: string) => void,
  onPointDoubleClick?: (pointId: string) => void,
  onPointLongPress?: (pointId: string) => void,
  onPointHoverChange?: (pointId: string, hovered: boolean) => void,
  onPointVerticalOffsetStemLongPress?: (pointId: string) => void,
  selectionModeEnabled: boolean = false,
  selectionRectangleModeEnabled: boolean = false,
  selectionAdditiveMode: boolean = false,
  onPointRectangleSelect?: (pointIds: string[], additive: boolean) => void,
  pointLongPressDurationMs: number = 300,
  occlusionChecksEnabled: boolean = true,
  layoutConfigOverrides?: CesiumLabelLayoutConfigOverrides,
  distanceToReferenceByPointId?: Readonly<Record<string, number>>,
  pointLabelIndexByPointId?: Readonly<Record<string, number>>,
  referenceLabelPointId?: string | null,
  polylinePointLabelTextByPointId?: Readonly<Record<string, string>>,
  hiddenPointLabelIds?: ReadonlySet<string>,
  fullyHiddenPointIds?: ReadonlySet<string>,
  markerlessPointIds?: ReadonlySet<string>,
  pillMarkerPointIds?: ReadonlySet<string>,
  pointDragPlaneByPointId?: Readonly<Record<string, PlanarPolygonPlane>>,
  onPointPlaneDragStart?: (pointId: string) => void,
  onPointPlaneDragPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void,
  onPointPlaneDragEnd?: (pointId: string) => void,
  moveGizmoMarkerSizeScale: number = 1,
  moveGizmoLabelDistanceScale: number = 1,
  labelInputPromptPointId: string | null = null,
  pointMarkerBadgeByPointId?: Readonly<Record<string, PointMarkerBadge>>,
  suppressCompactLabelPointIds?: ReadonlySet<string>,
  markerOnlyOverlayNodeInteractions: boolean = false
) => {
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);
  const registeredPointIdSetRef = useRef<Set<string>>(new Set());
  const selectedPointIdSet = useMemo(() => {
    const ids = new Set(selectedPointIds);
    if (selectedPointId) {
      ids.add(selectedPointId);
    }
    return ids;
  }, [selectedPointId, selectedPointIds]);

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
    const camera = scene.camera;

    const updatePitch = () => {
      const currentPitch = camera.pitch;
      setCameraPitch((prev) =>
        Math.abs(currentPitch - prev) > 0.001 ? currentPitch : prev
      );
    };

    updatePitch();
    const removeChangedListener = camera.changed.addEventListener(updatePitch);
    const removeMoveEndListener = camera.moveEnd.addEventListener(updatePitch);

    return () => {
      if (removeChangedListener) {
        removeChangedListener();
      }
      if (removeMoveEndListener) {
        removeMoveEndListener();
      }
    };
  }, [scene, showLabels]);

  const realtimeOcclusionPointIds = useMemo(() => {
    if (!occlusionChecksEnabled || !moveGizmoIsDragging) return [];
    if (!selectedPointId || selectedPointId !== moveGizmoPointId) return [];
    return [selectedPointId];
  }, [
    moveGizmoIsDragging,
    moveGizmoPointId,
    occlusionChecksEnabled,
    selectedPointId,
  ]);

  const { registerPoints, unregisterPointIds, visibilityStateById } =
    useCesiumSceneVisibilityIndex(scene, {
      shouldTestVisibility: showLabels,
      shouldTestOcclusion: occlusionChecksEnabled,
      realtimeOcclusionPointIds,
      viewportPaddingHorizontal: VIEWPORT_PADDING_HORIZONTAL,
      viewportPaddingVertical: VIEWPORT_PADDING_VERTICAL,
      occlusionToleranceMeters: 1.0,
    });

  useEffect(() => {
    const indexedPoints = points.map((point) => ({
      id: point.id,
      positionECEF: point.geometryECEF,
    }));
    registerPoints(indexedPoints);

    const nextIdSet = new Set(indexedPoints.map((point) => point.id));
    const removedIds: string[] = [];
    registeredPointIdSetRef.current.forEach((id) => {
      if (!nextIdSet.has(id)) {
        removedIds.push(id);
      }
    });

    if (removedIds.length > 0) {
      unregisterPointIds(removedIds);
    }
    registeredPointIdSetRef.current = nextIdSet;
  }, [points, registerPoints, unregisterPointIds]);

  useEffect(() => {
    return () => {
      const ids = Array.from(registeredPointIdSetRef.current);
      if (ids.length > 0) {
        unregisterPointIds(ids);
      }
      registeredPointIdSetRef.current = new Set();
    };
  }, [unregisterPointIds]);

  const pointLabelTextById = useMemo<
    Readonly<Record<string, PointLabelTextRepresentation>>
  >(() => {
    const referenceLabelBase = getReferenceLabelBase(
      points,
      distanceToReferenceByPointId,
      referenceLabelPointId,
      pointLabelIndexByPointId,
      pointMarkerBadgeByPointId
    );
    const defaultNamedReferenceLabelBase = getReferenceLabelBase(
      points,
      distanceToReferenceByPointId,
      referenceLabelPointId,
      pointLabelIndexByPointId,
      pointMarkerBadgeByPointId,
      true
    );

    return Object.fromEntries(
      points.map((point, index) => {
        // For polyline points, show override text without index
        const polylineOverrideText =
          polylinePointLabelTextByPointId?.[point.id];
        if (polylineOverrideText !== undefined) {
          return [
            point.id,
            {
              layoutText: polylineOverrideText,
            } as PointLabelTextRepresentation,
          ];
        }

        const effectivePointIndex =
          pointLabelIndexByPointId?.[point.id] ?? index;
        const pointMarkerBadgeText =
          pointMarkerBadgeByPointId?.[point.id]?.text?.trim() ?? "";
        const isAreaNodeBadge =
          AREA_NODE_BADGE_REGEX.test(pointMarkerBadgeText);
        const pointLabelOverride = isAreaNodeBadge
          ? undefined
          : pointMarkerBadgeByPointId?.[point.id]?.text;
        const pointLabelMetricMode =
          point.pointLabelMode ?? DEFAULT_POINT_LABEL_METRIC_MODE;
        const preferDefaultNaming = pointLabelMetricMode === "distance";
        let labelTextRepresentation = formatPointLabelText(
          effectivePointIndex,
          point.geometryWGS84.altitude,
          referenceElevation,
          point.name,
          Boolean(point.auxiliaryLabelAnchor),
          pointLabelMetricMode,
          distanceToReferenceByPointId?.[point.id],
          preferDefaultNaming
            ? defaultNamedReferenceLabelBase
            : referenceLabelBase,
          pointLabelOverride,
          preferDefaultNaming
        );

        if (
          pointLabelMetricMode === "elevation" &&
          point.verticalOffsetAnchorECEF
        ) {
          const anchorECEF = new Cartesian3(
            point.verticalOffsetAnchorECEF.x,
            point.verticalOffsetAnchorECEF.y,
            point.verticalOffsetAnchorECEF.z
          );
          const anchorWGS84 = getDegreesFromCartesian(anchorECEF);
          const anchorHeightMeters = anchorWGS84.altitude ?? 0;
          const anchorRelativeHeightMeters =
            anchorHeightMeters - referenceElevation;
          const verticalOffsetMeters =
            point.geometryWGS84.altitude - anchorHeightMeters;

          if (
            Number.isFinite(anchorHeightMeters) &&
            Number.isFinite(anchorRelativeHeightMeters) &&
            Number.isFinite(verticalOffsetMeters) &&
            Math.abs(verticalOffsetMeters) > ELEVATION_NEUTRAL_THRESHOLD_METERS
          ) {
            const labelBase = getPointLabelBase(
              point.name,
              effectivePointIndex,
              Boolean(point.auxiliaryLabelAnchor),
              pointLabelOverride,
              preferDefaultNaming
            );
            labelTextRepresentation = formatOffsetElevationLabelText(
              labelBase,
              anchorRelativeHeightMeters,
              verticalOffsetMeters
            );
          }
        }

        let effectiveLabelTextRepresentation = labelTextRepresentation;

        const distanceToRef = distanceToReferenceByPointId?.[point.id];
        const isReferencePoint =
          distanceToRef !== undefined &&
          Math.abs(distanceToRef) <= REFERENCE_POINT_DISTANCE_EPSILON_METERS;
        if (isReferencePoint) {
          const inner =
            effectiveLabelTextRepresentation.content ??
            effectiveLabelTextRepresentation.layoutText;
          effectiveLabelTextRepresentation = {
            ...effectiveLabelTextRepresentation,
            content: createElement("em", null, inner),
            contentSignature: `ref:${
              effectiveLabelTextRepresentation.contentSignature ??
              effectiveLabelTextRepresentation.layoutText
            }`,
          };
        }

        if (labelInputPromptPointId === point.id) {
          const promptBaseContent =
            effectiveLabelTextRepresentation.content ??
            effectiveLabelTextRepresentation.layoutText;
          const promptLayoutText =
            effectiveLabelTextRepresentation.layoutText.trim().length > 0
              ? `${effectiveLabelTextRepresentation.layoutText}|`
              : "|";
          effectiveLabelTextRepresentation = {
            ...effectiveLabelTextRepresentation,
            layoutText: promptLayoutText,
            content: createElement(
              Fragment,
              null,
              promptBaseContent,
              createElement(BlinkingInputCaret)
            ),
            contentSignature: `prompt:${
              effectiveLabelTextRepresentation.contentSignature ??
              effectiveLabelTextRepresentation.layoutText
            }`,
          };
        }

        return [point.id, effectiveLabelTextRepresentation];
      })
    );
  }, [
    points,
    referenceElevation,
    distanceToReferenceByPointId,
    referenceLabelPointId,
    pointLabelIndexByPointId,
    pointMarkerBadgeByPointId,
    polylinePointLabelTextByPointId,
    labelInputPromptPointId,
  ]);

  const layoutResult = useMemo((): PointLabelLayoutResult => {
    if (!scene || scene.isDestroyed()) {
      return EMPTY_LAYOUT_RESULT;
    }

    const layoutPoints: LayoutPointInput[] = points
      .map<LayoutPointInput | null>((point, index) => {
        const visibilityState = visibilityStateById[point.id];
        const anchor = visibilityState?.screenPosition ?? null;
        if (!anchor || visibilityState?.isHidden) return null;
        const labelTextRepresentation = pointLabelTextById[point.id];
        if (!labelTextRepresentation) return null;
        const isDraggedMoveGizmoPoint =
          moveGizmoIsDragging && point.id === moveGizmoPointId;
        const effectivePointIndex =
          pointLabelIndexByPointId?.[point.id] ?? index;
        const compactText = getPointLabelBase(
          point.name,
          effectivePointIndex,
          Boolean(point.auxiliaryLabelAnchor),
          (() => {
            const badgeText = pointMarkerBadgeByPointId?.[point.id]?.text;
            const normalizedBadgeText = badgeText?.trim() ?? "";
            return AREA_NODE_BADGE_REGEX.test(normalizedBadgeText)
              ? undefined
              : badgeText;
          })()
        );

        return {
          id: point.id,
          anchor,
          text: labelTextRepresentation.layoutText,
          compactText,
          index,
          ...(isDraggedMoveGizmoPoint
            ? {
                layoutPriority: Number.MAX_SAFE_INTEGER,
                lockPreferredPlacement: true,
              }
            : {}),
        };
      })
      .filter((point): point is LayoutPointInput => point !== null);

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
    visibilityStateById,
    pointLabelTextById,
    moveGizmoPointId,
    moveGizmoIsDragging,
    pointLabelIndexByPointId,
    pointMarkerBadgeByPointId,
    layoutConfig,
    cameraPitch,
  ]);

  const pointLabelData: PointLabelData[] = useMemo(() => {
    return points.map((point, index) => {
      const polylineOverrideText = polylinePointLabelTextByPointId?.[point.id];
      const effectivePointIndex = pointLabelIndexByPointId?.[point.id] ?? index;
      const pointMarkerBadge = pointMarkerBadgeByPointId?.[point.id];
      const pointMarkerBadgeText = pointMarkerBadge?.text?.trim() ?? "";
      const isAreaNodeBadge = AREA_NODE_BADGE_REGEX.test(pointMarkerBadgeText);
      const isMoveGizmoPoint = point.id === moveGizmoPointId;
      const suppressCompactLabel =
        Boolean(suppressCompactLabelPointIds?.has(point.id)) ||
        isAreaNodeBadge ||
        isMoveGizmoPoint;
      const customPointName = getCustomPointAnnotationName(point.name);
      const labelTextRepresentation =
        pointLabelTextById[point.id] ??
        (polylineOverrideText !== undefined
          ? { layoutText: polylineOverrideText }
          : formatNoneLabelText(
              getPointLabelBase(
                point.name,
                effectivePointIndex,
                Boolean(point.auxiliaryLabelAnchor),
                suppressCompactLabel ? undefined : pointMarkerBadge?.text
              )
            ));
      const compactLabelText = getPointLabelBase(
        point.name,
        effectivePointIndex,
        Boolean(point.auxiliaryLabelAnchor),
        suppressCompactLabel ? undefined : pointMarkerBadge?.text
      );
      const usesPillMarkerVariant =
        !isMoveGizmoPoint && Boolean(pillMarkerPointIds?.has(point.id));
      const isPolylineLabelPoint = polylineOverrideText !== undefined;
      const isFocusedPolylinePoint =
        pointLabelIndexByPointId?.[point.id] !== undefined;
      const isFirstFocusedPolylinePoint =
        isFocusedPolylinePoint && effectivePointIndex === 0;
      const shouldShowCompactForPolylinePoint =
        !isFocusedPolylinePoint || isFirstFocusedPolylinePoint;
      const collapsedByLayout = layoutResult.collapsedToCompact.has(point.id);
      const pointLabelMetricMode =
        point.pointLabelMode ?? DEFAULT_POINT_LABEL_METRIC_MODE;
      const isDistanceMetricPoint = pointLabelMetricMode === "distance";
      const isAnnotationMarker = Boolean(point.auxiliaryLabelAnchor);
      const pointLabelAppearance = point.labelAppearance;
      const resolvedPointLabelFontSizePx = sanitizePointLabelFontSizePx(
        pointLabelAppearance?.fontSizePx
      );
      const resolvedPointLabelBackgroundColor = sanitizeCssColorString(
        pointLabelAppearance?.backgroundColor
      );
      const resolvedPointLabelTextColor = sanitizeCssColorString(
        pointLabelAppearance?.textColor
      );
      const declaredLabelAnchor =
        point.labelAnchor && point.labelAnchor.anchorPointId === point.id
          ? point.labelAnchor
          : undefined;
      const declaredCompactContent =
        declaredLabelAnchor?.compactContent?.trim();
      const declaredCollapseToCompact =
        declaredLabelAnchor?.collapseToCompact ?? false;
      const hasDeclaredLabelAnchor = Boolean(declaredLabelAnchor);
      const isLabelInputPromptPoint = labelInputPromptPointId === point.id;
      const isStandalonePointMeasureBadge = Boolean(
        pointMarkerBadge?.text && /^\d+$/.test(pointMarkerBadge.text.trim())
      );
      const useMarkerLabel = true;
      const useBorderlessExtendedLabel = isAreaNodeBadge || isMoveGizmoPoint;
      const isPreviewLabelPoint = Boolean(point.temporary);
      const compactLayoutBadgeText =
        pointMarkerBadge?.text?.trim().length && pointMarkerBadge.text
          ? pointMarkerBadge.text
          : `${effectivePointIndex + 1}`;
      const compactContent =
        suppressCompactLabel || isAnnotationMarker
          ? undefined
          : declaredCompactContent
          ? declaredCompactContent
          : collapsedByLayout
          ? compactLayoutBadgeText
          : isPolylineLabelPoint
          ? shouldShowCompactForPolylinePoint
            ? compactLayoutBadgeText
            : undefined
          : isDistanceMetricPoint
          ? compactLayoutBadgeText
          : compactLabelText || customPointName || pointMarkerBadge?.text;
      const fallbackCompactContent = suppressCompactLabel
        ? undefined
        : compactContent ??
          (declaredCollapseToCompact ? compactLayoutBadgeText : undefined);
      const compactContentText =
        typeof fallbackCompactContent === "string"
          ? fallbackCompactContent
          : undefined;
      const compactAreaBadgeWithoutOutline = Boolean(
        compactContentText &&
          AREA_NODE_BADGE_REGEX.test(compactContentText.trim())
      );
      const extendedLabelContent = isLabelInputPromptPoint
        ? createElement(
            Fragment,
            null,
            getLabelTextWithoutLeadingBadge(
              labelTextRepresentation.layoutText.replace(/\|$/, ""),
              compactContentText ?? ""
            ),
            createElement(BlinkingInputCaret)
          )
        : useMarkerLabel && compactContentText
        ? getLabelTextWithoutLeadingBadge(
            labelTextRepresentation.layoutText,
            compactContentText
          )
        : useMarkerLabel &&
          suppressCompactLabel &&
          pointMarkerBadge?.text?.trim().length
        ? getLabelTextWithoutLeadingBadge(
            labelTextRepresentation.layoutText,
            pointMarkerBadge.text
          )
        : labelTextRepresentation.layoutText;
      const forceCollapseToCompactByLayout =
        collapsedByLayout &&
        !isAnnotationMarker &&
        Boolean(fallbackCompactContent);
      const forceCollapseToCompactByAnchor =
        declaredCollapseToCompact &&
        !isAnnotationMarker &&
        Boolean(fallbackCompactContent);
      const collapseByLegacyRules =
        !hasDeclaredLabelAnchor &&
        !isPolylineLabelPoint &&
        !isStandalonePointMeasureBadge &&
        !isAnnotationMarker;
      const showInlineLabelBadge =
        !useMarkerLabel &&
        !isMoveGizmoPoint &&
        !Boolean(markerlessPointIds?.has(point.id)) &&
        Boolean(pointMarkerBadge?.text);
      const inlineLabelBadgeContent =
        showInlineLabelBadge && pointMarkerBadge
          ? createInlineLabelBadgeContent(
              labelTextRepresentation.layoutText,
              pointMarkerBadge.text,
              pointMarkerBadge.backgroundColor,
              pointMarkerBadge.textColor
            )
          : undefined;
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
          if (!scene || scene.isDestroyed()) {
            return visibilityStateById[point.id]?.screenPosition ?? null;
          }
          const canvasPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            point.geometryECEF
          );
          return defined(canvasPosition)
            ? ({ x: canvasPosition.x, y: canvasPosition.y } as CssPixelPosition)
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
        content: useMarkerLabel
          ? extendedLabelContent
          : inlineLabelBadgeContent ??
            labelTextRepresentation.content ??
            labelTextRepresentation.layoutText,
        contentSignature: inlineLabelBadgeContent
          ? `${pointMarkerBadge?.text ?? ""}:${
              labelTextRepresentation.layoutText
            }`
          : labelTextRepresentation.contentSignature,
        hideMarker:
          usesPillMarkerVariant ||
          declaredCollapseToCompact ||
          isDistanceMetricPoint ||
          Boolean(markerlessPointIds?.has(point.id)),
        markerSize: isMoveGizmoPoint
          ? moveGizmoIsDragging
            ? moveGizmoMarkerSizeDraggingPx
            : moveGizmoMarkerSizePx
          : undefined,
        fontSize: `${resolvedPointLabelFontSizePx}px`,
        textColor: resolvedPointLabelTextColor,
        textBackgroundColor: resolvedPointLabelBackgroundColor,
        compactContent: useMarkerLabel ? fallbackCompactContent : undefined,
        compactBorderless:
          useMarkerLabel &&
          (compactAreaBadgeWithoutOutline || isPreviewLabelPoint),
        labelStyle: useMarkerLabel ? "capsule" : "auto",
        collapse:
          useMarkerLabel &&
          (declaredCollapseToCompact ||
            collapseByLegacyRules ||
            isPolylineLabelPoint),
        forceCollapse:
          forceCollapseToCompactByLayout || forceCollapseToCompactByAnchor,
        fullBorder:
          useMarkerLabel &&
          !useBorderlessExtendedLabel &&
          isDistanceMetricPoint,
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
        selected: selectedPointIdSet.has(point.id),
        visible: true,
        isOccluded: visibilityStateById[point.id]?.isOccluded ?? false,
        isHidden:
          (visibilityStateById[point.id]?.isHidden ?? false) ||
          Boolean(fullyHiddenPointIds?.has(point.id)),
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
        onHoverChange:
          !disableInteractionsForMoveGizmoPoint && onPointHoverChange
            ? (hovered: boolean) => onPointHoverChange(point.id, hovered)
            : undefined,
        markerOnlyPointerEvents: markerOnlyOverlayNodeInteractions,
        attachOverlayClickHandlers: !markerOnlyOverlayNodeInteractions,
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
    selectedPointIdSet,
    moveGizmoPointId,
    moveGizmoIsDragging,
    visibilityStateById,
    scene,
    cameraPitch,
    layoutResult,
    moveGizmoMarkerSizePx,
    moveGizmoMarkerSizeDraggingPx,
    resolvedMoveGizmoLabelDistanceScale,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    onPointHoverChange,
    pointLongPressDurationMs,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    pointLabelIndexByPointId,
    pointMarkerBadgeByPointId,
    polylinePointLabelTextByPointId,
    pillMarkerPointIds,
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
    markerlessPointIds,
    suppressCompactLabelPointIds,
    markerOnlyOverlayNodeInteractions,
  ]);

  usePointRectangleSelectionOverlay({
    scene,
    enabled:
      showLabels &&
      selectionModeEnabled &&
      selectionRectangleModeEnabled &&
      Boolean(onPointRectangleSelect),
    additiveMode: selectionAdditiveMode,
    points: pointLabelData,
    onSelect: (pointIds, additive) => {
      onPointRectangleSelect?.(pointIds, additive);
    },
  });

  const verticalOffsetStemLines = useMemo<LineVisualizerData[]>(() => {
    if (!scene || scene.isDestroyed()) return [];
    return points
      .map((point) => {
        const anchor = point.verticalOffsetAnchorECEF;
        if (!anchor) return null;
        const anchorECEF = new Cartesian3(anchor.x, anchor.y, anchor.z);
        return {
          id: `point-vertical-offset-stem-${point.id}`,
          stroke: "rgba(255, 255, 255, 1)",
          strokeWidth: 2,
          strokeDasharray: "0 3",
          strokeDashoffset: 0,
          opacity: 0.9,
          visible: true,
          onLineLongPress: onPointVerticalOffsetStemLongPress
            ? () => onPointVerticalOffsetStemLongPress(point.id)
            : undefined,
          longPressDurationMs: pointLongPressDurationMs,
          getCanvasLine: () => {
            if (!scene || scene.isDestroyed()) {
              return null;
            }
            const start = SceneTransforms.worldToWindowCoordinates(
              scene,
              point.geometryECEF
            );
            const end = SceneTransforms.worldToWindowCoordinates(
              scene,
              anchorECEF
            );
            if (!defined(start) || !defined(end)) {
              return null;
            }
            return {
              start: { x: start.x, y: start.y } as CssPixelPosition,
              end: { x: end.x, y: end.y } as CssPixelPosition,
            };
          },
        } as LineVisualizerData;
      })
      .filter((line): line is LineVisualizerData => Boolean(line));
  }, [
    onPointVerticalOffsetStemLongPress,
    pointLongPressDurationMs,
    points,
    scene,
  ]);

  useLineVisualizers(verticalOffsetStemLines, showLabels);

  usePointLabels(pointLabelData, showLabels, undefined, undefined, {
    transitionDurationMs: layoutConfig.transitionDurationMs,
  });
};

export default useCesiumPointLabels;
