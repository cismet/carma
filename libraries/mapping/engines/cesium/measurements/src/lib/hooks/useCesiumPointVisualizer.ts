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
  SceneTransforms,
  Transforms,
  defined,
  type Scene,
} from "@carma/cesium";
import {
  createPlacement,
  getPerspectiveStemAngleMagnitude,
  type PointLabelData,
  resolvePointLabelLayoutConfig,
  useLabelOverlay,
  usePointLabels,
} from "@carma-providers/label-overlay";
import {
  createDiscVisualizer,
  type DiscVisualizer,
} from "@carma-mapping/engines/cesium/legacy";

import {
  create3DCrossGroup,
  Cross3DGroup,
  update3dCrossVisibility,
} from "../utils/cesium3DCross";
import {
  isPointMeasurementEntry,
  MeasurementCollection,
  type PlanarPolygonGroup,
  type PlanarPolygonPlane,
  type PointDistanceRelation,
  type PointMeasurementEntry,
  type ReferenceLineLabelKind,
} from "../types/MeasurementTypes";
import {
  useCesiumPointLabels,
  type CesiumLabelLayoutConfigOverrides,
  type PointMarkerBadge,
} from "./useCesiumPointLabels";
import { useCesiumPointMoveGizmo } from "@carma-mapping/engines-interop/gizmo/cesium-integration";
import { useCesiumDistanceVisualizer } from "./useCesiumDistanceVisualizer";
import { formatNumber } from "../utils/formatting";

const LIVE_PREVIEW_HEIGHT_LABEL_ID = "measurement-live-preview-height";
const LIVE_PREVIEW_CROSSHAIR_ID = "measurement-live-preview-crosshair";

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
const LIVE_PREVIEW_DISC_SCREEN_RADIUS_PX = 48;
const LIVE_PREVIEW_DISC_ALPHA = 0.66;
const LIVE_PREVIEW_HEIGHT_LABEL_ANCHOR_DISTANCE_PX = 14;
const LIVE_PREVIEW_HEIGHT_LABEL_STEM_START_DISTANCE_PX = 5;
const LIVE_PREVIEW_HEIGHT_LABEL_STEM_DISTANCE_PX = Math.max(
  0,
  LIVE_PREVIEW_HEIGHT_LABEL_ANCHOR_DISTANCE_PX -
    LIVE_PREVIEW_HEIGHT_LABEL_STEM_START_DISTANCE_PX
);
const LIVE_PREVIEW_PILL_STEM_EXTRA_DISTANCE_PX = 4;

const LIVE_PREVIEW_SURFACE_NORMAL_EPSILON_SQUARED = 1e-8;
const LIVE_PREVIEW_STEEP_SURFACE_UP_DOT_THRESHOLD = Math.cos(
  (45 * Math.PI) / 180
);

const formatMeters = (value: number): string => `${formatNumber(value)}m`;

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

const getLivePreviewDiscUpVector = (
  scene: Scene | null,
  pointECEF: Cartesian3,
  surfaceNormalECEF: Cartesian3 | null
): Cartesian3 => {
  const localUp = Cartesian3.normalize(pointECEF, new Cartesian3());

  if (
    !surfaceNormalECEF ||
    Cartesian3.magnitudeSquared(surfaceNormalECEF) <=
      LIVE_PREVIEW_SURFACE_NORMAL_EPSILON_SQUARED
  ) {
    return localUp;
  }

  const normalizedNormal = Cartesian3.normalize(
    surfaceNormalECEF,
    new Cartesian3()
  );
  const upDot = Math.abs(Cartesian3.dot(normalizedNormal, localUp));

  // For flatter surfaces keep a horizontal disc (up-normal). For steep surfaces
  // (>45° from horizon), use a vertical disc by projecting the normal onto the
  // local tangent plane.
  if (upDot > LIVE_PREVIEW_STEEP_SURFACE_UP_DOT_THRESHOLD) {
    return localUp;
  }

  const verticalComponent = Cartesian3.multiplyByScalar(
    localUp,
    Cartesian3.dot(normalizedNormal, localUp),
    new Cartesian3()
  );
  const projectedHorizontalNormal = Cartesian3.subtract(
    normalizedNormal,
    verticalComponent,
    new Cartesian3()
  );

  if (
    Cartesian3.magnitudeSquared(projectedHorizontalNormal) <=
    LIVE_PREVIEW_SURFACE_NORMAL_EPSILON_SQUARED
  ) {
    return localUp;
  }

  const cameraPosition = scene?.camera?.position;
  if (cameraPosition) {
    const pointToCamera = Cartesian3.subtract(
      cameraPosition,
      pointECEF,
      new Cartesian3()
    );
    const cameraVerticalComponent = Cartesian3.multiplyByScalar(
      localUp,
      Cartesian3.dot(pointToCamera, localUp),
      new Cartesian3()
    );
    const cameraTangentDirection = Cartesian3.subtract(
      pointToCamera,
      cameraVerticalComponent,
      new Cartesian3()
    );

    if (
      Cartesian3.magnitudeSquared(cameraTangentDirection) >
      LIVE_PREVIEW_SURFACE_NORMAL_EPSILON_SQUARED
    ) {
      return Cartesian3.normalize(cameraTangentDirection, new Cartesian3());
    }
  }

  return Cartesian3.normalize(projectedHorizontalNormal, new Cartesian3());
};

export type CesiumPointVisualizerOptions = {
  showMarkers?: boolean;
  showCesiumMarkers?: boolean;
  showLabels?: boolean;
  radius: number;
  referenceElevation?: number;
  selectedPointId?: string | null;
  selectedPointIds?: string[];
  selectedPlanarPolygonGroupId?: string | null;
  activePlanarPolygonGroupId?: string | null;
  distanceRelations?: PointDistanceRelation[];
  planarPolygonGroups?: PlanarPolygonGroup[];
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, Cartesian3>
  >;
  onPlanarPolygonClick?: (polygonGroupId: string) => void;
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
  onDistanceRelationLineLabelToggle?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceRelationLineClick?: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceRelationMidpointClick?: (relationId: string) => void;
  distanceLineLabelMinDistancePx?: number;
  cumulativeDistanceByRelationId?: Readonly<Record<string, number>>;
  showSelectedDisc?: boolean;
  debug?: boolean;
  onPointClick?: (pointId: string) => void;
  onPointDoubleClick?: (pointId: string) => void;
  onPointLongPress?: (pointId: string) => void;
  onPointHoverChange?: (pointId: string, hovered: boolean) => void;
  onPointVerticalOffsetStemLongPress?: (pointId: string) => void;
  selectionModeEnabled?: boolean;
  selectionAdditiveMode?: boolean;
  onPointRectangleSelect?: (pointIds: string[], additive: boolean) => void;
  onDistanceRelationCornerClick?: (relationId: string) => void;
  pointLongPressDurationMs?: number;
  occlusionChecksEnabled?: boolean;
  labelLayoutConfig?: CesiumLabelLayoutConfigOverrides;
  distanceToReferenceByPointId?: Readonly<Record<string, number>>;
  pointLabelIndexByPointId?: Readonly<Record<string, number>>;
  pointMarkerBadgeByPointId?: Readonly<Record<string, PointMarkerBadge>>;
  referenceLabelPointId?: string | null;
  polylinePointLabelTextByPointId?: Readonly<Record<string, string>>;
  labelInputPromptPointId?: string | null;
  livePreviewPointECEF?: Cartesian3 | null;
  livePreviewSurfaceNormalECEF?: Cartesian3 | null;
  livePreviewDistanceLine?: {
    anchorPointECEF: Cartesian3;
    targetPointECEF: Cartesian3;
    showDirectLine: boolean;
    showVerticalLine: boolean;
    showHorizontalLine: boolean;
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
};

export const useCesiumPointVisualizer = (
  scene: Scene | null,
  measurements: MeasurementCollection = [],
  {
    showMarkers = true,
    showCesiumMarkers = false,
    showLabels = false,
    radius,
    referenceElevation = 0,
    selectedPointId = null,
    selectedPointIds = [],
    selectedPlanarPolygonGroupId = null,
    activePlanarPolygonGroupId = null,
    distanceRelations = [],
    planarPolygonGroups = [],
    facadeRectanglePreviewOppositeByGroupId,
    onPlanarPolygonClick,
    pointDragPlaneByPointId,
    onPointPlaneDragStart,
    onPointPlaneDragPositionChange,
    onPointPlaneDragEnd,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    pillMarkerPointIds,
    onDistanceRelationLineLabelToggle,
    onDistanceRelationLineClick,
    onDistanceRelationMidpointClick,
    distanceLineLabelMinDistancePx = 50,
    cumulativeDistanceByRelationId,
    showSelectedDisc = false,
    debug = false,
    onPointClick,
    onPointDoubleClick,
    onPointLongPress,
    onPointHoverChange,
    onPointVerticalOffsetStemLongPress,
    selectionModeEnabled = false,
    selectionAdditiveMode = false,
    onPointRectangleSelect,
    onDistanceRelationCornerClick,
    pointLongPressDurationMs = 300,
    occlusionChecksEnabled = true,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    pointLabelIndexByPointId,
    pointMarkerBadgeByPointId,
    referenceLabelPointId = null,
    polylinePointLabelTextByPointId,
    labelInputPromptPointId = null,
    livePreviewPointECEF = null,
    livePreviewSurfaceNormalECEF = null,
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
  }: CesiumPointVisualizerOptions
) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const cross3DRefs = useRef<Record<string, Cross3DGroup>>({});
  const selectedDiscRef = useRef<DiscVisualizer | null>(null);
  const livePreviewDiscRef = useRef<DiscVisualizer | null>(null);
  const livePreviewPointRef = useRef<Cartesian3 | null>(null);
  const hasLivePreviewPoint = Boolean(livePreviewPointECEF);
  const [cameraPitch, setCameraPitch] = useState<number>(-Math.PI / 4);
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
      "bottomLeft",
      LIVE_PREVIEW_HEIGHT_LABEL_STEM_DISTANCE_PX,
      getPerspectiveStemAngleMagnitude(
        cameraPitch,
        livePreviewLabelLayoutConfig
      )
    );
  }, [cameraPitch, livePreviewLabelLayoutConfig]);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !hasLivePreviewPoint) return;

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
  }, [scene, hasLivePreviewPoint]);

  const [points, currentIds]: [PointMeasurementEntry[], Set<string>] =
    useMemo(() => {
      // memoize derived values of measurements
      const derivedPoints = measurements.filter(isPointMeasurementEntry);
      const ids = new Set(derivedPoints.map((measurement) => measurement.id));
      return [derivedPoints, ids];
    }, [measurements]);

  const moveGizmoPoints = useMemo(
    () =>
      points.map((point) => {
        if (!point.verticalOffsetAnchorECEF) {
          return point;
        }
        return {
          ...point,
          geometryECEF: new Cartesian3(
            point.verticalOffsetAnchorECEF.x,
            point.verticalOffsetAnchorECEF.y,
            point.verticalOffsetAnchorECEF.z
          ),
        };
      }),
    [points]
  );

  // Use overlay labels instead of Cesium entity labels
  useCesiumPointLabels(
    scene,
    points,
    showLabels,
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
    pointMarkerBadgeByPointId
  );

  useCesiumPointMoveGizmo(scene, {
    points: moveGizmoPoints,
    movePointId: moveGizmoPointId,
    axisDirection: moveGizmoAxisDirection,
    axisTitle: moveGizmoAxisTitle,
    preferredAxisId: moveGizmoPreferredAxisId,
    axisCandidates: moveGizmoAxisCandidates,
    snapPlaneDragToGround: moveGizmoSnapPlaneDragToGround,
    showRotationHandle: moveGizmoShowRotationHandle,
    radius,
    onPointPositionChange: onMoveGizmoPointPositionChange,
    onDragStateChange: onMoveGizmoDragStateChange,
    onAxisDirectionChange: onMoveGizmoAxisChange,
    onExit: onMoveGizmoExit,
  });

  useCesiumDistanceVisualizer(scene, points, {
    distanceRelations,
    planarPolygonGroups,
    facadeRectanglePreviewOppositeByGroupId,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    onPlanarPolygonClick,
    onDistanceLineLabelToggle: onDistanceRelationLineLabelToggle,
    onDistanceLineClick: onDistanceRelationLineClick,
    onDistanceRelationMidpointClick,
    lineLabelMinDistancePx: distanceLineLabelMinDistancePx,
    onDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    livePreviewDistanceLine,
  });

  const livePreviewHeightLabelData = useMemo<PointLabelData[]>(() => {
    if (!scene || scene.isDestroyed() || !livePreviewPointECEF) {
      return [];
    }

    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(livePreviewPointECEF);
    if (!cartographic) {
      return [];
    }

    const pointHeightMeters = cartographic.height ?? 0;
    const text = formatLivePreviewElevationText(
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
          const canvasPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            livePreviewPointECEF
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
        fullBorder: true,
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
    scene,
    livePreviewPointECEF,
    livePreviewHasReferenceElevation,
    livePreviewReferenceElevation,
  ]);

  usePointLabels(
    livePreviewHeightLabelData,
    hasLivePreviewPoint,
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
    livePreviewPointRef.current = livePreviewPointECEF;
  }, [livePreviewPointECEF]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      removeLabelOverlayElement(LIVE_PREVIEW_CROSSHAIR_ID);
      return;
    }

    addLabelOverlayElement({
      id: LIVE_PREVIEW_CROSSHAIR_ID,
      zIndex: 22,
      getCanvasPosition: getLivePreviewCanvasPosition,
      content: livePreviewCrosshairContent,
      visible: hasLivePreviewPoint,
    });

    return () => {
      removeLabelOverlayElement(LIVE_PREVIEW_CROSSHAIR_ID);
    };
  }, [
    scene,
    hasLivePreviewPoint,
    addLabelOverlayElement,
    removeLabelOverlayElement,
    getLivePreviewCanvasPosition,
    livePreviewCrosshairContent,
  ]);

  useEffect(() => {
    if (!scene) return;

    let disc = livePreviewDiscRef.current;
    if (!livePreviewPointECEF) {
      if (disc) {
        disc.destroy();
        livePreviewDiscRef.current = null;
        scene.requestRender();
      }
      return;
    }

    const upVector = getLivePreviewDiscUpVector(
      scene,
      livePreviewPointECEF,
      livePreviewSurfaceNormalECEF
    );
    const livePreviewDiscRadius = Math.max(
      radius * LIVE_PREVIEW_DISC_RADIUS_SCALE,
      0.1
    );

    if (!disc) {
      const nextDisc = createDiscVisualizer(
        "measurement-live-pointer-preview",
        {
          origin: livePreviewPointECEF,
          upVector,
          radius: livePreviewDiscRadius,
          screenPixelRadius: LIVE_PREVIEW_DISC_SCREEN_RADIUS_PX,
          color: livePreviewDiscColor,
          unitCircleSegments: 20,
        }
      );
      nextDisc.attach(scene, () => scene.requestRender());
      livePreviewDiscRef.current = nextDisc;
    } else {
      disc.update(livePreviewPointECEF, upVector, livePreviewDiscRadius);
    }

    scene.requestRender();
  }, [
    scene,
    livePreviewPointECEF,
    livePreviewSurfaceNormalECEF,
    radius,
    livePreviewDiscColor,
  ]);

  useEffect(() => {
    return () => {
      if (livePreviewDiscRef.current) {
        livePreviewDiscRef.current.destroy();
        livePreviewDiscRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!scene) return;

    if (selectedDiscRef.current) {
      selectedDiscRef.current.destroy();
      selectedDiscRef.current = null;
    }

    if (!showSelectedDisc) {
      scene.requestRender();
      return;
    }

    if (!selectedPointId) {
      scene.requestRender();
      return;
    }

    const moveGizmoOnSelectedPoint =
      moveGizmoPointId !== null && moveGizmoPointId === selectedPointId;
    if (moveGizmoOnSelectedPoint) {
      // Prevent two overlapping disc polygons (selected-guide + move-gizmo disc),
      // which can produce visual z-fighting artifacts.
      scene.requestRender();
      return;
    }

    const selectedPoint = points.find((point) => point.id === selectedPointId);
    if (!selectedPoint) {
      scene.requestRender();
      return;
    }

    const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(
      selectedPoint.geometryECEF
    );
    const upAxis4 = Matrix4.getColumn(eastNorthUpMatrix, 2, new Cartesian4());
    const fallbackUpVector = Cartesian3.normalize(
      new Cartesian3(upAxis4.x, upAxis4.y, upAxis4.z),
      new Cartesian3()
    );
    const hasAxisOverride =
      Boolean(moveGizmoAxisDirection) &&
      Cartesian3.magnitudeSquared(moveGizmoAxisDirection as Cartesian3) > 1e-8;
    const discNormal = hasAxisOverride
      ? Cartesian3.normalize(
          moveGizmoAxisDirection as Cartesian3,
          new Cartesian3()
        )
      : fallbackUpVector;

    selectedDiscRef.current = createDiscVisualizer(
      `selectedGuide-${selectedPoint.id}`,
      {
        origin: selectedPoint.geometryECEF,
        upVector: discNormal,
        radius,
        screenPixelRadius: 50,
        color: Color.WHITE.withAlpha(0.5),
        unitCircleSegments: 24,
      }
    );
    selectedDiscRef.current.attach(scene, () => scene.requestRender());
    scene.requestRender();

    return () => {
      if (selectedDiscRef.current) {
        selectedDiscRef.current.destroy();
        selectedDiscRef.current = null;
      }
      if (!scene || scene.isDestroyed()) return;
      scene.requestRender();
    };
  }, [
    scene,
    points,
    selectedPointId,
    radius,
    showSelectedDisc,
    moveGizmoAxisDirection,
    moveGizmoPointId,
  ]);

  useEffect(() => {
    // render markers using primitives instead of entities
    if (!scene) return;
    const crosses = cross3DRefs.current;

    if (!showCesiumMarkers) {
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
  ]);
};

export default useCesiumPointVisualizer;
