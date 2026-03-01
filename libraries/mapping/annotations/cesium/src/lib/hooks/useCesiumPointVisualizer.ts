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
  Cartesian3,
  Cartesian4,
  Color,
  Matrix4,
  Primitive,
  SceneTransforms,
  Transforms,
  defined,
  type Scene,
} from "@carma/cesium";
import { formatNumber } from "@carma-mapping/annotations/core";
import {
  createPlacement,
  getPerspectiveStemAngleMagnitude,
  type PointLabelData,
  resolvePointLabelLayoutConfig,
  type LineVisualizerData,
  useLabelOverlay,
  useLineVisualizers,
  usePointLabels,
} from "@carma-providers/label-overlay";
import { createDisc } from "@carma-mapping/engines/cesium/primitives";

import {
  create3DCrossGroup,
  Cross3DGroup,
  update3dCrossVisibility,
} from "../utils/cesium3DCross";
import {
  isPointAnnotationEntry,
  AnnotationCollection,
  type PlanarPolygonPlane,
  type PointAnnotationEntry,
} from "../types/AnnotationTypes";
import {
  useCesiumPointLabels,
  type CesiumLabelLayoutConfigOverrides,
  type PointMarkerBadge,
} from "./useCesiumPointLabels";
import { useAnnotationMoveGizmoAdapter } from "./useAnnotationMoveGizmoAdapter";

const LIVE_PREVIEW_HEIGHT_LABEL_ID = "measurement-live-preview-height";
const LIVE_PREVIEW_CROSSHAIR_ID = "measurement-live-preview-crosshair";
const LIVE_PREVIEW_VERTICAL_OFFSET_STEM_ID =
  "measurement-live-preview-vertical-offset-stem";
const LIVE_PREVIEW_POINT_MARKER_ID = "measurement-live-preview-point-marker";

const CROSSHAIR_STROKE_COLOR = "rgba(255, 255, 255, 0.96)";
const CROSSHAIR_CONTRAST_FILTER =
  "drop-shadow(0 0 1px rgba(0, 0, 0, 1)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.95))";
const CROSSHAIR_THICKNESS_PX = 3;
const CROSSHAIR_CENTER_DOT_SIZE_PX = 1;
const CROSSHAIR_CENTER_GAP_PX = 5;
const CROSSHAIR_FAR_DASH_LENGTH_PX = 12;
const CROSSHAIR_INNER_TIP_PX = CROSSHAIR_THICKNESS_PX / 2;
const CROSSHAIR_HALF_EXTENT_PX =
  CROSSHAIR_CENTER_GAP_PX + CROSSHAIR_FAR_DASH_LENGTH_PX;
const CROSSHAIR_SIZE_PX =
  CROSSHAIR_HALF_EXTENT_PX * 2 + CROSSHAIR_CENTER_DOT_SIZE_PX;
const CROSSHAIR_CENTER_PX = CROSSHAIR_HALF_EXTENT_PX;
const CROSSHAIR_ANCHOR_OFFSET_Y_PX = 1;

const ELEVATION_NEUTRAL_THRESHOLD_METERS = 0.03;
const ELEVATION_GLYPH_UP = "↥";
const ELEVATION_GLYPH_DOWN = "↧";

const LIVE_PREVIEW_DISC_RADIUS_SCALE = 1.4;
const LIVE_PREVIEW_DISC_ALPHA = 0.66;
const LIVE_PREVIEW_DISC_SCREEN_RADIUS_PX = 48;
const SELECTED_DISC_SCREEN_RADIUS_PX = 50;
const DISC_PROJECTION_SCALE_SAMPLE_COUNT = 16;
const DISC_MIN_WORLD_RADIUS = 1e-3;
const DISC_MIN_PROJECTED_PIXEL_PER_WORLD = 1e-6;
const POINTER_NORMAL_EPSILON_SQUARED = 1e-8;
const LIVE_PREVIEW_HEIGHT_LABEL_ANCHOR_DISTANCE_PX = 14;
const LIVE_PREVIEW_HEIGHT_LABEL_STEM_START_DISTANCE_PX = 5;
const LIVE_PREVIEW_HEIGHT_LABEL_STEM_DISTANCE_PX = Math.max(
  0,
  LIVE_PREVIEW_HEIGHT_LABEL_ANCHOR_DISTANCE_PX -
    LIVE_PREVIEW_HEIGHT_LABEL_STEM_START_DISTANCE_PX
);
const LIVE_PREVIEW_PILL_STEM_EXTRA_DISTANCE_PX = 4;

const formatMeters = (value: number): string => `${formatNumber(value)}m`;

const safeRemovePrimitive = (
  scene: Scene | null,
  primitive: Primitive | null | undefined
) => {
  if (!scene || !primitive) return;
  try {
    if (!scene.isDestroyed()) {
      scene.primitives.remove(primitive);
    }
  } catch {
    // Scene/primitive teardown may race while effects are cleaning up.
  }
};

const safeCall = (callback: (() => void) | null | undefined) => {
  if (!callback) return;
  try {
    callback();
  } catch {
    // Listener removal can race with scene/widget teardown.
  }
};

const getLocalUpVector = (positionECEF: Cartesian3): Cartesian3 => {
  const localEnuFrame = Transforms.eastNorthUpToFixedFrame(positionECEF);
  const upDirectionColumn = Matrix4.getColumn(
    localEnuFrame,
    2,
    new Cartesian4()
  );
  const upDirection = new Cartesian3(
    upDirectionColumn.x,
    upDirectionColumn.y,
    upDirectionColumn.z
  );

  if (
    Cartesian3.magnitudeSquared(upDirection) <= POINTER_NORMAL_EPSILON_SQUARED
  ) {
    return Cartesian3.normalize(positionECEF, new Cartesian3());
  }

  return Cartesian3.normalize(upDirection, new Cartesian3());
};

const createPlaneBasis = (normal: Cartesian3) => {
  const up = Cartesian3.normalize(normal, new Cartesian3());
  const reference =
    Math.abs(Cartesian3.dot(up, Cartesian3.UNIT_Z)) > 0.9
      ? Cartesian3.UNIT_X
      : Cartesian3.UNIT_Z;
  const xAxis = Cartesian3.normalize(
    Cartesian3.cross(up, reference, new Cartesian3()),
    new Cartesian3()
  );
  const yAxis = Cartesian3.normalize(
    Cartesian3.cross(xAxis, up, new Cartesian3()),
    new Cartesian3()
  );
  return { xAxis, yAxis };
};

const resolveDiscNormal = (
  origin: Cartesian3,
  preferredNormal: Cartesian3 | null | undefined
): Cartesian3 => {
  if (
    preferredNormal &&
    Cartesian3.magnitudeSquared(preferredNormal) >
      POINTER_NORMAL_EPSILON_SQUARED
  ) {
    return Cartesian3.normalize(preferredNormal, new Cartesian3());
  }
  return getLocalUpVector(origin);
};

const createOrientedDiscModelMatrix = (
  origin: Cartesian3,
  planeNormal: Cartesian3,
  radius: number
): Matrix4 => {
  const safeRadius = Math.max(radius, DISC_MIN_WORLD_RADIUS);
  const normalizedNormal = Cartesian3.normalize(planeNormal, new Cartesian3());
  const planeBasis = createPlaneBasis(normalizedNormal);
  const matrix = Matrix4.clone(Matrix4.IDENTITY, new Matrix4());
  Matrix4.setColumn(
    matrix,
    0,
    new Cartesian4(
      planeBasis.xAxis.x * safeRadius,
      planeBasis.xAxis.y * safeRadius,
      planeBasis.xAxis.z * safeRadius,
      0
    ),
    matrix
  );
  Matrix4.setColumn(
    matrix,
    1,
    new Cartesian4(
      planeBasis.yAxis.x * safeRadius,
      planeBasis.yAxis.y * safeRadius,
      planeBasis.yAxis.z * safeRadius,
      0
    ),
    matrix
  );
  Matrix4.setColumn(
    matrix,
    2,
    new Cartesian4(
      normalizedNormal.x,
      normalizedNormal.y,
      normalizedNormal.z,
      0
    ),
    matrix
  );
  Matrix4.setColumn(
    matrix,
    3,
    new Cartesian4(origin.x, origin.y, origin.z, 1),
    matrix
  );
  return matrix;
};

const getDiscWorldRadius = (
  scene: Scene,
  origin: Cartesian3,
  planeNormal: Cartesian3,
  configuredWorldRadius: number,
  fixedScreenRadiusPx?: number
): number => {
  const baseRadius = Math.max(configuredWorldRadius, DISC_MIN_WORLD_RADIUS);
  if (fixedScreenRadiusPx === undefined) {
    return baseRadius;
  }

  const anchorCanvasPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    origin
  );
  if (!defined(anchorCanvasPosition)) {
    return baseRadius;
  }

  const planeBasis = createPlaneBasis(planeNormal);
  let pixelPerWorldMax = 0;
  for (let i = 0; i < DISC_PROJECTION_SCALE_SAMPLE_COUNT; i += 1) {
    const t = (i / DISC_PROJECTION_SCALE_SAMPLE_COUNT) * Math.PI * 2;
    const sampleDirection = Cartesian3.add(
      Cartesian3.multiplyByScalar(
        planeBasis.xAxis,
        Math.cos(t),
        new Cartesian3()
      ),
      Cartesian3.multiplyByScalar(
        planeBasis.yAxis,
        Math.sin(t),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    const sampleWorld = Cartesian3.add(
      origin,
      sampleDirection,
      new Cartesian3()
    );
    const sampleCanvas = SceneTransforms.worldToWindowCoordinates(
      scene,
      sampleWorld
    );
    if (!defined(sampleCanvas)) continue;

    const dx = sampleCanvas.x - anchorCanvasPosition.x;
    const dy = sampleCanvas.y - anchorCanvasPosition.y;
    const d = Math.hypot(dx, dy);
    if (Number.isFinite(d) && d > pixelPerWorldMax) {
      pixelPerWorldMax = d;
    }
  }

  if (pixelPerWorldMax <= DISC_MIN_PROJECTED_PIXEL_PER_WORLD) {
    return baseRadius;
  }

  return Math.max(
    fixedScreenRadiusPx / pixelPerWorldMax,
    DISC_MIN_WORLD_RADIUS
  );
};

const formatLivePreviewElevationText = (
  pointHeightMeters: number,
  referenceElevation: number,
  hasReferenceElevation: boolean
): string => {
  if (!hasReferenceElevation) {
    return formatMeters(pointHeightMeters);
  }

  const elevationDelta = pointHeightMeters - referenceElevation;
  const elevationText = formatMeters(elevationDelta);

  if (Math.abs(elevationDelta) < ELEVATION_NEUTRAL_THRESHOLD_METERS) {
    return elevationText;
  }

  return `${elevationText} ${
    elevationDelta > 0 ? ELEVATION_GLYPH_UP : ELEVATION_GLYPH_DOWN
  }`;
};

export type CesiumPointVisualizerOptions = {
  showMarkers?: boolean;
  showCesiumMarkers?: boolean;
  showLabels?: boolean;
  radius: number;
  referenceElevation?: number;
  selectedPointId?: string | null;
  selectedPointIds?: string[];
  pointDragPlaneByPointId?: Readonly<Record<string, PlanarPolygonPlane>>;
  onPointPlaneDragStart?: (pointId: string) => void;
  onPointPlaneDragPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void;
  onPointPlaneDragEnd?: (pointId: string) => void;
  hiddenPointLabelIds?: ReadonlySet<string>;
  fullyHiddenPointIds?: ReadonlySet<string>;
  markerlessPointIds?: ReadonlySet<string>;
  pillMarkerPointIds?: ReadonlySet<string>;
  suppressCompactLabelPointIds?: ReadonlySet<string>;
  showSelectedDisc?: boolean;
  debug?: boolean;
  onPointClick?: (pointId: string) => void;
  onPointDoubleClick?: (pointId: string) => void;
  onPointLongPress?: (pointId: string) => void;
  onPointHoverChange?: (pointId: string, hovered: boolean) => void;
  onPointVerticalOffsetStemLongPress?: (pointId: string) => void;
  selectionModeEnabled?: boolean;
  selectionRectangleModeEnabled?: boolean;
  selectionAdditiveMode?: boolean;
  onPointRectangleSelect?: (pointIds: string[], additive: boolean) => void;
  pointLongPressDurationMs?: number;
  occlusionChecksEnabled?: boolean;
  labelLayoutConfig?: CesiumLabelLayoutConfigOverrides;
  distanceToReferenceByPointId?: Readonly<Record<string, number>>;
  pointLabelIndexByPointId?: Readonly<Record<string, number>>;
  pointMarkerBadgeByPointId?: Readonly<Record<string, PointMarkerBadge>>;
  referenceLabelPointId?: string | null;
  polylinePointLabelTextByPointId?: Readonly<Record<string, string>>;
  labelInputPromptPointId?: string | null;
  markerOnlyOverlayNodeInteractions?: boolean;
  livePreviewPointECEF?: Cartesian3 | null;
  livePreviewSurfaceNormalECEF?: Cartesian3 | null;
  livePreviewVerticalOffsetAnchorECEF?: Cartesian3 | null;
  livePreviewDistanceLine?: {
    anchorPointECEF: Cartesian3;
    targetPointECEF: Cartesian3;
    showDirectLine: boolean;
    showVerticalLine: boolean;
    showHorizontalLine: boolean;
    previewTotalDistanceMeters?: number;
  } | null;
  livePreviewReferenceElevation?: number;
  livePreviewHasReferenceElevation?: boolean;
  moveGizmoPointId?: string | null;
  moveGizmoAxisDirection?: Cartesian3 | null;
  moveGizmoAxisTitle?: string | null;
  moveGizmoPreferredAxisId?: string | null;
  moveGizmoAxisCandidates?: Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null;
  moveGizmoMarkerSizeScale?: number;
  moveGizmoLabelDistanceScale?: number;
  moveGizmoSnapPlaneDragToGround?: boolean;
  moveGizmoShowRotationHandle?: boolean;
  moveGizmoIsDragging?: boolean;
  onMoveGizmoPointPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void;
  onMoveGizmoDragStateChange?: (isDragging: boolean) => void;
  onMoveGizmoAxisChange?: (
    axisDirection: Cartesian3,
    axisTitle?: string | null
  ) => void;
  onMoveGizmoExit?: () => void;
  renderDomVisuals?: boolean;
  renderCesiumCoreVisuals?: boolean;
};

export const useCesiumPointVisualizer = (
  scene: Scene | null,
  measurements: AnnotationCollection = [],
  {
    showMarkers = true,
    showCesiumMarkers = false,
    showLabels = false,
    radius,
    referenceElevation = 0,
    selectedPointId = null,
    selectedPointIds = [],
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    pillMarkerPointIds,
    suppressCompactLabelPointIds,
    showSelectedDisc = false,
    debug = false,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    onPointHoverChange,
    onPointVerticalOffsetStemLongPress,
    selectionModeEnabled = false,
    selectionRectangleModeEnabled = false,
    selectionAdditiveMode = false,
    onPointRectangleSelect,
    pointLongPressDurationMs = 300,
    occlusionChecksEnabled = true,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    pointLabelIndexByPointId,
    pointMarkerBadgeByPointId,
    referenceLabelPointId = null,
    polylinePointLabelTextByPointId,
    labelInputPromptPointId = null,
    markerOnlyOverlayNodeInteractions = false,
    livePreviewPointECEF = null,
    livePreviewSurfaceNormalECEF = null,
    livePreviewVerticalOffsetAnchorECEF = null,
    livePreviewDistanceLine = null,
    livePreviewReferenceElevation = 0,
    livePreviewHasReferenceElevation = false,
    moveGizmoPointId = null,
    moveGizmoAxisDirection = null,
    moveGizmoAxisTitle = null,
    moveGizmoPreferredAxisId = null,
    moveGizmoAxisCandidates = null,
    moveGizmoMarkerSizeScale = 1,
    moveGizmoLabelDistanceScale = 1,
    moveGizmoSnapPlaneDragToGround = false,
    moveGizmoShowRotationHandle = true,
    moveGizmoIsDragging = false,
    onMoveGizmoPointPositionChange,
    onMoveGizmoDragStateChange,
    onMoveGizmoAxisChange,
    onMoveGizmoExit,
    renderDomVisuals = false,
    renderCesiumCoreVisuals = true,
  }: CesiumPointVisualizerOptions
) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const cross3DRefs = useRef<Record<string, Cross3DGroup>>({});
  const selectedDiscRef = useRef<Primitive | null>(null);
  const livePreviewDiscRef = useRef<Primitive | null>(null);
  const removeLivePreviewDiscPostRenderListenerRef = useRef<
    (() => void) | null
  >(null);
  const removeSelectedDiscPostRenderListenerRef = useRef<(() => void) | null>(
    null
  );
  const livePreviewPointRef = useRef<Cartesian3 | null>(null);
  const livePreviewElevatedPointRef = useRef<Cartesian3 | null>(null);
  const livePreviewAuxAnchorRef = useRef<Cartesian3 | null>(null);
  const hasLivePreviewPoint = Boolean(livePreviewPointECEF);
  const hasLivePreviewAuxAnchor = Boolean(livePreviewVerticalOffsetAnchorECEF);
  const showLivePreviewCrosshair =
    hasLivePreviewPoint && !hasLivePreviewAuxAnchor;
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);
  const pointLabelsEnabled = showLabels && renderDomVisuals;
  const livePreviewDiscColor = useMemo(
    () => Color.WHITE.withAlpha(LIVE_PREVIEW_DISC_ALPHA),
    []
  );

  const livePreviewLabelLayoutConfig = useMemo(
    () => resolvePointLabelLayoutConfig(labelLayoutConfig),
    [labelLayoutConfig]
  );

  const livePreviewHeightLabelPlacement = useMemo(() => {
    return createPlacement(
      "left",
      LIVE_PREVIEW_HEIGHT_LABEL_STEM_DISTANCE_PX,
      getPerspectiveStemAngleMagnitude(
        cameraPitch,
        livePreviewLabelLayoutConfig
      )
    );
  }, [cameraPitch, livePreviewLabelLayoutConfig]);

  useEffect(() => {
    if (
      !renderDomVisuals ||
      !scene ||
      scene.isDestroyed() ||
      !hasLivePreviewPoint
    ) {
      return;
    }

    const camera = scene.camera;
    const updatePitch = () => {
      const currentPitch = camera.pitch;
      setCameraPitch((previousPitch) =>
        Math.abs(currentPitch - previousPitch) > 0.001
          ? currentPitch
          : previousPitch
      );
    };

    updatePitch();
    const removeChangedListener = camera.changed.addEventListener(updatePitch);
    const removeMoveEndListener = camera.moveEnd.addEventListener(updatePitch);

    return () => {
      removeChangedListener?.();
      removeMoveEndListener?.();
    };
  }, [scene, hasLivePreviewPoint, renderDomVisuals]);

  const [points, currentIds]: [PointAnnotationEntry[], Set<string>] =
    useMemo(() => {
      // memoize derived values of measurements
      const derivedPoints = measurements.filter(isPointAnnotationEntry);
      const ids = new Set(derivedPoints.map((measurement) => measurement.id));
      return [derivedPoints, ids];
    }, [measurements]);

  // Use overlay labels instead of Cesium entity labels
  useCesiumPointLabels(
    scene,
    points,
    pointLabelsEnabled,
    referenceElevation,
    selectedPointId,
    selectedPointIds,
    moveGizmoPointId,
    moveGizmoIsDragging,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    onPointHoverChange,
    onPointVerticalOffsetStemLongPress,
    selectionModeEnabled,
    selectionRectangleModeEnabled,
    selectionAdditiveMode,
    onPointRectangleSelect,
    pointLongPressDurationMs,
    occlusionChecksEnabled,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    pointLabelIndexByPointId,
    referenceLabelPointId,
    polylinePointLabelTextByPointId,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    pillMarkerPointIds,
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
    moveGizmoMarkerSizeScale,
    moveGizmoLabelDistanceScale,
    labelInputPromptPointId,
    pointMarkerBadgeByPointId,
    suppressCompactLabelPointIds,
    markerOnlyOverlayNodeInteractions
  );

  useAnnotationMoveGizmoAdapter({
    scene: renderCesiumCoreVisuals ? scene : null,
    points,
    moveGizmoPointId: renderCesiumCoreVisuals ? moveGizmoPointId : null,
    moveGizmoAxisDirection: renderCesiumCoreVisuals
      ? moveGizmoAxisDirection
      : null,
    moveGizmoAxisTitle: renderCesiumCoreVisuals ? moveGizmoAxisTitle : null,
    moveGizmoPreferredAxisId: renderCesiumCoreVisuals
      ? moveGizmoPreferredAxisId
      : null,
    moveGizmoAxisCandidates: renderCesiumCoreVisuals
      ? moveGizmoAxisCandidates
      : null,
    moveGizmoSnapPlaneDragToGround: renderCesiumCoreVisuals
      ? moveGizmoSnapPlaneDragToGround
      : false,
    moveGizmoShowRotationHandle: renderCesiumCoreVisuals
      ? moveGizmoShowRotationHandle
      : false,
    radius,
    onMoveGizmoPointPositionChange,
    onMoveGizmoDragStateChange,
    onMoveGizmoAxisChange,
    onMoveGizmoExit,
  });

  const livePreviewHeightLabelData = useMemo<PointLabelData[]>(() => {
    if (
      !renderDomVisuals ||
      !scene ||
      scene.isDestroyed() ||
      !livePreviewPointECEF
    ) {
      return [];
    }

    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(livePreviewPointECEF);
    if (!cartographic) {
      return [];
    }

    const pointHeightMeters = cartographic.height ?? 0;
    const showsDistancePreview =
      livePreviewDistanceLine?.previewTotalDistanceMeters !== undefined;
    const text = showsDistancePreview
      ? formatMeters(livePreviewDistanceLine.previewTotalDistanceMeters)
      : formatLivePreviewElevationText(
          pointHeightMeters,
          livePreviewReferenceElevation,
          livePreviewHasReferenceElevation
        );

    return [
      {
        id: LIVE_PREVIEW_HEIGHT_LABEL_ID,
        getCanvasPosition: () => {
          if (!scene || scene.isDestroyed()) {
            return null;
          }
          const elevatedPoint = livePreviewElevatedPointRef.current;
          if (!elevatedPoint) {
            return null;
          }
          const canvasPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            elevatedPoint
          );
          if (!defined(canvasPosition)) {
            return null;
          }
          return {
            x: canvasPosition.x,
            y: canvasPosition.y,
          };
        },
        content: text,
        collapse: true,
        fullBorder: showsDistancePreview,
        resizeMode: "fast-grow-slow-shrink",
        pitch: cameraPitch,
        labelAngleRad: livePreviewHeightLabelPlacement.angleRad,
        labelAttach: livePreviewHeightLabelPlacement.attach,
        hideMarker: true,
        labelDistance:
          livePreviewHeightLabelPlacement.distance +
          LIVE_PREVIEW_PILL_STEM_EXTRA_DISTANCE_PX,
        stemStartDistance: LIVE_PREVIEW_HEIGHT_LABEL_STEM_START_DISTANCE_PX,
      },
    ];
  }, [
    cameraPitch,
    livePreviewHeightLabelPlacement,
    renderDomVisuals,
    scene,
    livePreviewPointECEF,
    livePreviewDistanceLine,
    livePreviewHasReferenceElevation,
    livePreviewReferenceElevation,
  ]);

  const livePreviewVerticalOffsetStemLines = useMemo<
    LineVisualizerData[]
  >(() => {
    if (
      !renderDomVisuals ||
      !scene ||
      scene.isDestroyed() ||
      !hasLivePreviewPoint ||
      !hasLivePreviewAuxAnchor
    ) {
      return [];
    }

    return [
      {
        id: LIVE_PREVIEW_VERTICAL_OFFSET_STEM_ID,
        stroke: "rgba(255, 255, 255, 1)",
        strokeWidth: 2,
        strokeDasharray: "0 3",
        strokeDashoffset: 0,
        opacity: 0.9,
        visible: true,
        getCanvasLine: () => {
          if (!scene || scene.isDestroyed()) {
            return null;
          }
          const elevatedPoint = livePreviewElevatedPointRef.current;
          const auxAnchorPoint = livePreviewAuxAnchorRef.current;
          if (!elevatedPoint || !auxAnchorPoint) {
            return null;
          }
          const start = SceneTransforms.worldToWindowCoordinates(
            scene,
            elevatedPoint
          );
          const end = SceneTransforms.worldToWindowCoordinates(
            scene,
            auxAnchorPoint
          );
          if (!defined(start) || !defined(end)) {
            return null;
          }
          return {
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: end.y },
          };
        },
      } satisfies LineVisualizerData,
    ];
  }, [renderDomVisuals, scene, hasLivePreviewPoint, hasLivePreviewAuxAnchor]);

  useLineVisualizers(
    livePreviewVerticalOffsetStemLines,
    renderDomVisuals && livePreviewVerticalOffsetStemLines.length > 0
  );

  const livePreviewPointMarkerLabelData = useMemo<PointLabelData[]>(() => {
    if (
      !renderDomVisuals ||
      !scene ||
      scene.isDestroyed() ||
      !hasLivePreviewPoint
    ) {
      return [];
    }

    return [
      {
        id: LIVE_PREVIEW_POINT_MARKER_ID,
        getCanvasPosition: () => {
          if (!scene || scene.isDestroyed()) {
            return null;
          }
          const elevatedPoint = livePreviewElevatedPointRef.current;
          if (!elevatedPoint) {
            return null;
          }
          const canvasPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            elevatedPoint
          );
          if (!defined(canvasPosition)) {
            return null;
          }
          return {
            x: canvasPosition.x,
            y: canvasPosition.y,
          };
        },
        content: "",
        hideLabelAndStem: true,
        hideMarker: false,
      },
    ];
  }, [renderDomVisuals, scene, hasLivePreviewPoint]);

  usePointLabels(
    livePreviewPointMarkerLabelData,
    renderDomVisuals && livePreviewPointMarkerLabelData.length > 0,
    undefined,
    undefined,
    {
      transitionDurationMs: 0,
    }
  );

  usePointLabels(
    livePreviewHeightLabelData,
    renderDomVisuals && hasLivePreviewPoint,
    undefined,
    undefined,
    {
      transitionDurationMs: 0,
    }
  );

  const livePreviewCrosshairContent = useMemo(() => {
    const crosshairStrokeBlendStyle = {
      backgroundColor: CROSSHAIR_STROKE_COLOR,
    };

    return createElement(
      "div",
      {
        style: {
          position: "relative",
          width: `${CROSSHAIR_SIZE_PX}px`,
          height: `${CROSSHAIR_SIZE_PX}px`,
          pointerEvents: "none",
          filter: CROSSHAIR_CONTRAST_FILTER,
        },
      },
      createElement("div", {
        key: "center-dot",
        style: {
          position: "absolute",
          left: `${CROSSHAIR_CENTER_PX}px`,
          top: `${CROSSHAIR_CENTER_PX}px`,
          width: `${CROSSHAIR_CENTER_DOT_SIZE_PX}px`,
          height: `${CROSSHAIR_CENTER_DOT_SIZE_PX}px`,
          transform: "translate(-50%, -50%)",
          ...crosshairStrokeBlendStyle,
        },
      }),
      createElement("div", {
        key: "h-right-dash",
        style: {
          position: "absolute",
          left: `${CROSSHAIR_CENTER_PX + CROSSHAIR_CENTER_GAP_PX}px`,
          top: `${CROSSHAIR_CENTER_PX}px`,
          width: `${CROSSHAIR_FAR_DASH_LENGTH_PX}px`,
          height: `${CROSSHAIR_THICKNESS_PX}px`,
          transform: "translateY(-50%)",
          clipPath: `polygon(0 50%, ${CROSSHAIR_INNER_TIP_PX}px 0, 100% 0, 100% 100%, ${CROSSHAIR_INNER_TIP_PX}px 100%)`,
          ...crosshairStrokeBlendStyle,
        },
      }),
      createElement("div", {
        key: "h-left-dash",
        style: {
          position: "absolute",
          left: `${
            CROSSHAIR_CENTER_PX -
            CROSSHAIR_CENTER_GAP_PX -
            CROSSHAIR_FAR_DASH_LENGTH_PX
          }px`,
          top: `${CROSSHAIR_CENTER_PX}px`,
          width: `${CROSSHAIR_FAR_DASH_LENGTH_PX}px`,
          height: `${CROSSHAIR_THICKNESS_PX}px`,
          transform: "translateY(-50%)",
          clipPath: `polygon(0 0, calc(100% - ${CROSSHAIR_INNER_TIP_PX}px) 0, 100% 50%, calc(100% - ${CROSSHAIR_INNER_TIP_PX}px) 100%, 0 100%)`,
          ...crosshairStrokeBlendStyle,
        },
      }),
      createElement("div", {
        key: "v-bottom-dash",
        style: {
          position: "absolute",
          left: `${CROSSHAIR_CENTER_PX}px`,
          top: `${CROSSHAIR_CENTER_PX + CROSSHAIR_CENTER_GAP_PX}px`,
          width: `${CROSSHAIR_THICKNESS_PX}px`,
          height: `${CROSSHAIR_FAR_DASH_LENGTH_PX}px`,
          transform: "translateX(-50%)",
          clipPath: `polygon(0 ${CROSSHAIR_INNER_TIP_PX}px, 50% 0, 100% ${CROSSHAIR_INNER_TIP_PX}px, 100% 100%, 0 100%)`,
          ...crosshairStrokeBlendStyle,
        },
      }),
      createElement("div", {
        key: "v-top-dash",
        style: {
          position: "absolute",
          left: `${CROSSHAIR_CENTER_PX}px`,
          top: `${
            CROSSHAIR_CENTER_PX -
            CROSSHAIR_CENTER_GAP_PX -
            CROSSHAIR_FAR_DASH_LENGTH_PX
          }px`,
          width: `${CROSSHAIR_THICKNESS_PX}px`,
          height: `${CROSSHAIR_FAR_DASH_LENGTH_PX}px`,
          transform: "translateX(-50%)",
          clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CROSSHAIR_INNER_TIP_PX}px), 50% 100%, 0 calc(100% - ${CROSSHAIR_INNER_TIP_PX}px))`,
          ...crosshairStrokeBlendStyle,
        },
      })
    );
  }, []);

  const getLivePreviewCanvasPosition = useCallback(() => {
    if (!scene || scene.isDestroyed()) {
      return null;
    }
    const position = livePreviewPointRef.current;
    if (!position) {
      return null;
    }
    const canvasPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      position
    );
    if (!defined(canvasPosition)) {
      return null;
    }
    return {
      x: canvasPosition.x,
      y: canvasPosition.y + CROSSHAIR_ANCHOR_OFFSET_Y_PX,
    };
  }, [scene]);

  useEffect(() => {
    livePreviewPointRef.current =
      livePreviewVerticalOffsetAnchorECEF ?? livePreviewPointECEF;
    livePreviewElevatedPointRef.current = livePreviewPointECEF;
    livePreviewAuxAnchorRef.current = livePreviewVerticalOffsetAnchorECEF;
  }, [livePreviewPointECEF, livePreviewVerticalOffsetAnchorECEF]);

  useEffect(() => {
    if (!renderDomVisuals || !scene || scene.isDestroyed()) {
      removeLabelOverlayElement(LIVE_PREVIEW_CROSSHAIR_ID);
      return;
    }

    addLabelOverlayElement({
      id: LIVE_PREVIEW_CROSSHAIR_ID,
      zIndex: 22,
      getCanvasPosition: getLivePreviewCanvasPosition,
      content: livePreviewCrosshairContent,
      visible: showLivePreviewCrosshair,
    });

    return () => {
      removeLabelOverlayElement(LIVE_PREVIEW_CROSSHAIR_ID);
    };
  }, [
    scene,
    renderDomVisuals,
    showLivePreviewCrosshair,
    addLabelOverlayElement,
    removeLabelOverlayElement,
    getLivePreviewCanvasPosition,
    livePreviewCrosshairContent,
  ]);

  useEffect(() => {
    if (!scene) return;

    safeCall(removeLivePreviewDiscPostRenderListenerRef.current);
    removeLivePreviewDiscPostRenderListenerRef.current = null;

    if (!renderCesiumCoreVisuals) {
      if (livePreviewDiscRef.current) {
        safeRemovePrimitive(scene, livePreviewDiscRef.current);
        livePreviewDiscRef.current = null;
        if (!scene.isDestroyed()) {
          scene.requestRender();
        }
      }
      return;
    }

    const livePreviewDiscCenterECEF =
      livePreviewVerticalOffsetAnchorECEF ?? livePreviewPointECEF;

    let disc = livePreviewDiscRef.current;
    if (!livePreviewDiscCenterECEF) {
      if (disc) {
        safeRemovePrimitive(scene, disc);
        livePreviewDiscRef.current = null;
        scene.requestRender();
      }
      return;
    }

    const livePreviewDiscRadius = Math.max(
      radius * LIVE_PREVIEW_DISC_RADIUS_SCALE,
      0.1
    );

    if (!disc) {
      const nextDisc = createDisc("measurement-live-pointer-preview", {
        radius: 1,
        color: livePreviewDiscColor,
        unitCircleSegments: 20,
      });
      scene.primitives.add(nextDisc);
      livePreviewDiscRef.current = nextDisc;
      disc = nextDisc;
    }

    const updateLivePreviewDisc = () => {
      const activeDisc = livePreviewDiscRef.current;
      if (!activeDisc || !livePreviewDiscCenterECEF || scene.isDestroyed()) {
        return;
      }
      const discNormal = resolveDiscNormal(
        livePreviewDiscCenterECEF,
        livePreviewSurfaceNormalECEF
      );
      const discWorldRadius = getDiscWorldRadius(
        scene,
        livePreviewDiscCenterECEF,
        discNormal,
        livePreviewDiscRadius,
        LIVE_PREVIEW_DISC_SCREEN_RADIUS_PX
      );
      activeDisc.modelMatrix = createOrientedDiscModelMatrix(
        livePreviewDiscCenterECEF,
        discNormal,
        discWorldRadius
      );
    };

    updateLivePreviewDisc();

    removeLivePreviewDiscPostRenderListenerRef.current =
      scene.postRender.addEventListener(() => {
        if (!livePreviewDiscCenterECEF || scene.isDestroyed()) return;
        updateLivePreviewDisc();
      });
    scene.requestRender();
  }, [
    renderCesiumCoreVisuals,
    scene,
    livePreviewPointECEF,
    livePreviewVerticalOffsetAnchorECEF,
    livePreviewSurfaceNormalECEF,
    radius,
    livePreviewDiscColor,
  ]);

  useEffect(() => {
    return () => {
      safeCall(removeLivePreviewDiscPostRenderListenerRef.current);
      removeLivePreviewDiscPostRenderListenerRef.current = null;
      safeCall(removeSelectedDiscPostRenderListenerRef.current);
      removeSelectedDiscPostRenderListenerRef.current = null;
      if (livePreviewDiscRef.current) {
        safeRemovePrimitive(scene, livePreviewDiscRef.current);
        livePreviewDiscRef.current = null;
      }
      if (selectedDiscRef.current) {
        safeRemovePrimitive(scene, selectedDiscRef.current);
        selectedDiscRef.current = null;
      }
    };
  }, [scene]);

  useEffect(() => {
    if (!scene) return;

    safeCall(removeSelectedDiscPostRenderListenerRef.current);
    removeSelectedDiscPostRenderListenerRef.current = null;

    const clearSelectedDisc = () => {
      if (selectedDiscRef.current) {
        safeRemovePrimitive(scene, selectedDiscRef.current);
        selectedDiscRef.current = null;
      }
    };

    if (!renderCesiumCoreVisuals) {
      clearSelectedDisc();
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
      return;
    }

    if (!showSelectedDisc) {
      clearSelectedDisc();
      scene.requestRender();
      return;
    }

    if (!selectedPointId) {
      clearSelectedDisc();
      scene.requestRender();
      return;
    }

    const moveGizmoOnSelectedPoint =
      moveGizmoPointId !== null && moveGizmoPointId === selectedPointId;
    if (moveGizmoOnSelectedPoint) {
      // Prevent two overlapping disc polygons (selected-guide + move-gizmo disc),
      // which can produce visual z-fighting artifacts.
      clearSelectedDisc();
      scene.requestRender();
      return;
    }

    const selectedPoint = points.find((point) => point.id === selectedPointId);
    if (!selectedPoint) {
      clearSelectedDisc();
      scene.requestRender();
      return;
    }

    if (!selectedDiscRef.current) {
      selectedDiscRef.current = createDisc("selectedGuide", {
        radius: 1,
        color: Color.WHITE.withAlpha(0.5),
        unitCircleSegments: 24,
      });
      scene.primitives.add(selectedDiscRef.current);
    }

    const updateSelectedDisc = () => {
      const activeDisc = selectedDiscRef.current;
      if (!activeDisc || scene.isDestroyed()) return;
      const discNormal = resolveDiscNormal(
        selectedPoint.geometryECEF,
        moveGizmoAxisDirection
      );
      const discWorldRadius = getDiscWorldRadius(
        scene,
        selectedPoint.geometryECEF,
        discNormal,
        radius,
        SELECTED_DISC_SCREEN_RADIUS_PX
      );
      activeDisc.modelMatrix = createOrientedDiscModelMatrix(
        selectedPoint.geometryECEF,
        discNormal,
        discWorldRadius
      );
    };

    updateSelectedDisc();
    removeSelectedDiscPostRenderListenerRef.current =
      scene.postRender.addEventListener(() => {
        if (scene.isDestroyed()) return;
        updateSelectedDisc();
      });
    scene.requestRender();

    return () => {
      safeCall(removeSelectedDiscPostRenderListenerRef.current);
      removeSelectedDiscPostRenderListenerRef.current = null;
    };
  }, [
    scene,
    points,
    selectedPointId,
    radius,
    showSelectedDisc,
    moveGizmoAxisDirection,
    moveGizmoPointId,
    renderCesiumCoreVisuals,
  ]);

  useEffect(() => {
    // render markers using primitives instead of entities
    if (!scene) return;
    const crosses = cross3DRefs.current;

    if (!renderCesiumCoreVisuals || !showCesiumMarkers) {
      Object.keys(crosses).forEach((id) => {
        crosses[id].cleanup(scene);
        delete crosses[id];
      });
      scene.requestRender();
      return;
    }

    points.forEach(({ id, geometryECEF }) => {
      if (!crosses[id]) {
        const cross3D = create3DCrossGroup(scene, {
          position: geometryECEF,
          radius,
          width: 1,
          id: `debugMarker-${id}`,
          showAxes: debug,
        });
        update3dCrossVisibility(cross3D, showMarkers);
        crosses[id] = cross3D;
      } else {
        update3dCrossVisibility(crosses[id], showMarkers);
      }
    });
    // Remove refs for points that no longer exist
    Object.keys(crosses).forEach((id) => {
      if (!currentIds.has(id)) {
        crosses[id].cleanup(scene);
        delete crosses[id];
      }
    });
    scene.requestRender(); // Ensure scene updates after changes

    return () => {
      try {
        Object.keys(crosses).forEach((id) => {
          if (!currentIds.has(id)) {
            crosses[id].cleanup(scene);
            delete crosses[id];
          }
        });
      } catch (error) {
        console.warn("Cross3D primitive cleanup failed:", error);
      }
    };
  }, [
    scene,
    points,
    radius,
    currentIds,
    showMarkers,
    showCesiumMarkers,
    debug,
    renderCesiumCoreVisuals,
  ]);
};

export default useCesiumPointVisualizer;
