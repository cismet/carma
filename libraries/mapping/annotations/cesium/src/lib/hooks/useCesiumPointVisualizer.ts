/* @refresh reset */
import { useEffect, useMemo, useRef } from "react";

import {
  CarmaTransforms,
  Cartesian3,
  Color,
  Matrix4,
  Primitive,
  SceneTransforms,
  defined,
  type Scene,
} from "@carma/cesium";
import {
  createDisc,
  createRing,
} from "@carma-mapping/engines/cesium/primitives";
import {
  isPointAnnotationEntry,
  AnnotationCollection,
  type PlanarPolygonPlane,
  type PointAnnotationEntry,
} from "../types/AnnotationTypes";
import {
  type CesiumLabelLayoutConfigOverrides,
  type PointMarkerBadge,
} from "./useCesiumPointLabels";
import { useAnnotationMoveGizmoAdapter } from "./useAnnotationMoveGizmoAdapter";
import {
  type LivePreviewDiscSample,
  getAveragedLivePreviewDiscNormal,
  pushLivePreviewDiscSample,
} from "./utils/livePreviewDiscNormalSmoothing";
import {
  POINTER_NORMAL_EPSILON_SQUARED,
  getLocalUpDirectionECEF,
} from "./utils/pointSurfaceMath";

const LIVE_PREVIEW_DISC_RADIUS_SCALE = 1.4;
const LIVE_PREVIEW_DISC_ALPHA = 0.66;
const LIVE_PREVIEW_DISC_SCREEN_RADIUS_PX = 48;
const LIVE_PREVIEW_DISC_SMOOTHING_SAMPLE_COUNT = 10;
const LIVE_PREVIEW_DISC_SMOOTHING_WINDOW_MS = 300;
const SELECTED_DISC_SCREEN_RADIUS_PX = 50;
const DISC_PROJECTION_SCALE_SAMPLE_COUNT = 16;
const DISC_MIN_WORLD_RADIUS = 1e-3;
const DISC_MIN_PROJECTED_PIXEL_PER_WORLD = 1e-6;

type LivePreviewDiscQueuedInput = {
  pointRef: Cartesian3 | null;
  surfaceNormalRef: Cartesian3 | null;
};

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
  return getLocalUpDirectionECEF(origin);
};

const createOrientedDiscModelMatrix = (
  origin: Cartesian3,
  planeNormal: Cartesian3,
  radius: number,
  result?: Matrix4
): Matrix4 => {
  const safeRadius = Math.max(radius, DISC_MIN_WORLD_RADIUS);
  const normalizedNormal = Cartesian3.normalize(planeNormal, new Cartesian3());
  const planeBasis = createPlaneBasis(normalizedNormal);
  return CarmaTransforms.createBasisScaleTranslationMatrix(
    origin,
    planeBasis.xAxis,
    planeBasis.yAxis,
    normalizedNormal,
    safeRadius,
    safeRadius,
    1,
    result
  );
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

export type CesiumPointVisualizerOptions = {
  showMarkers?: boolean;
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
  suppressLivePreviewLabelOverlay?: boolean;
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
  annotations: AnnotationCollection = [],
  {
    radius,
    selectedPointId = null,
    showSelectedDisc = false,
    livePreviewPointECEF = null,
    livePreviewSurfaceNormalECEF = null,
    livePreviewVerticalOffsetAnchorECEF = null,
    moveGizmoPointId = null,
    moveGizmoAxisDirection = null,
    moveGizmoAxisTitle = null,
    moveGizmoPreferredAxisId = null,
    moveGizmoAxisCandidates = null,
    moveGizmoSnapPlaneDragToGround = false,
    moveGizmoShowRotationHandle = true,
    onMoveGizmoPointPositionChange,
    onMoveGizmoDragStateChange,
    onMoveGizmoAxisChange,
    onMoveGizmoExit,
    renderCesiumCoreVisuals = true,
  }: CesiumPointVisualizerOptions
) => {
  const selectedDiscRef = useRef<Primitive | null>(null);
  const livePreviewDiscRef = useRef<Primitive | null>(null);
  const removeLivePreviewDiscPostRenderListenerRef = useRef<
    (() => void) | null
  >(null);
  const removeSelectedDiscPostRenderListenerRef = useRef<(() => void) | null>(
    null
  );
  const livePreviewPointRef = useRef<Cartesian3 | null>(null);
  const livePreviewSurfaceNormalRef = useRef<Cartesian3 | null>(null);
  const livePreviewDiscSamplesRef = useRef<LivePreviewDiscSample[]>([]);
  const livePreviewDiscLastQueuedInputRef =
    useRef<LivePreviewDiscQueuedInput | null>(null);
  const livePreviewDiscColor = useMemo(
    () => Color.WHITE.withAlpha(LIVE_PREVIEW_DISC_ALPHA),
    []
  );

  livePreviewPointRef.current =
    livePreviewVerticalOffsetAnchorECEF ?? livePreviewPointECEF;
  livePreviewSurfaceNormalRef.current = livePreviewSurfaceNormalECEF;

  const points: PointAnnotationEntry[] = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
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

  useEffect(() => {
    if (!scene) return;

    safeCall(removeLivePreviewDiscPostRenderListenerRef.current);
    removeLivePreviewDiscPostRenderListenerRef.current = null;

    const livePreviewDiscRadius = Math.max(
      radius * LIVE_PREVIEW_DISC_RADIUS_SCALE,
      0.1
    );
    const averagedNormal = new Cartesian3();

    const clearLivePreviewDisc = () => {
      if (livePreviewDiscRef.current) {
        safeRemovePrimitive(scene, livePreviewDiscRef.current);
      }
      livePreviewDiscRef.current = null;
      livePreviewDiscSamplesRef.current = [];
      livePreviewDiscLastQueuedInputRef.current = null;
    };

    const ensureLivePreviewDisc = () => {
      const center = livePreviewPointRef.current;
      if (!center) {
        clearLivePreviewDisc();
        return null;
      }

      let disc = livePreviewDiscRef.current;
      if (!disc) {
        const nextDisc = createRing("measurement-live-pointer-preview", {
          radius: 1,
          innerRadius: 0.5,
          color: livePreviewDiscColor,
          segments: 20,
        });
        scene.primitives.add(nextDisc);
        livePreviewDiscRef.current = nextDisc;
        disc = nextDisc;
      }
      return disc;
    };

    const shouldQueueCurrentDiscSample = () => {
      const currentInput: LivePreviewDiscQueuedInput = {
        pointRef: livePreviewPointRef.current,
        surfaceNormalRef: livePreviewSurfaceNormalRef.current,
      };
      const previousInput = livePreviewDiscLastQueuedInputRef.current;
      const hasInputChanged =
        !previousInput ||
        previousInput.pointRef !== currentInput.pointRef ||
        previousInput.surfaceNormalRef !== currentInput.surfaceNormalRef;
      if (!hasInputChanged) {
        return false;
      }
      livePreviewDiscLastQueuedInputRef.current = currentInput;
      return true;
    };

    const queueDiscSample = (normal: Cartesian3) => {
      pushLivePreviewDiscSample({
        samples: livePreviewDiscSamplesRef.current,
        normal,
        maxSampleCount: LIVE_PREVIEW_DISC_SMOOTHING_SAMPLE_COUNT,
        timestampMs: performance.now(),
      });
    };

    const getAveragedDiscNormal = (fallbackNormal: Cartesian3) => {
      return getAveragedLivePreviewDiscNormal({
        samples: livePreviewDiscSamplesRef.current,
        fallbackNormal,
        result: averagedNormal,
        epsilonSquared: POINTER_NORMAL_EPSILON_SQUARED,
        maxSampleAgeMs: LIVE_PREVIEW_DISC_SMOOTHING_WINDOW_MS,
        nowMs: performance.now(),
      });
    };

    if (!renderCesiumCoreVisuals) {
      clearLivePreviewDisc();
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
      return;
    }

    ensureLivePreviewDisc();

    const updateLivePreviewDisc = () => {
      if (scene.isDestroyed()) {
        return;
      }

      const center = livePreviewPointRef.current;
      if (!center) {
        clearLivePreviewDisc();
        return;
      }

      const discNormal = resolveDiscNormal(
        center,
        livePreviewSurfaceNormalRef.current
      );
      const sampledRadius = getDiscWorldRadius(
        scene,
        center,
        discNormal,
        livePreviewDiscRadius,
        LIVE_PREVIEW_DISC_SCREEN_RADIUS_PX
      );
      const activeDisc = livePreviewDiscRef.current ?? ensureLivePreviewDisc();
      if (!activeDisc) {
        return;
      }

      if (shouldQueueCurrentDiscSample()) {
        queueDiscSample(discNormal);
      }
      const averagedNormal = getAveragedDiscNormal(discNormal);
      activeDisc.modelMatrix = createOrientedDiscModelMatrix(
        center,
        averagedNormal,
        sampledRadius,
        activeDisc.modelMatrix
      );
    };

    updateLivePreviewDisc();

    removeLivePreviewDiscPostRenderListenerRef.current =
      scene.postRender.addEventListener(updateLivePreviewDisc);
    scene.requestRender();
  }, [renderCesiumCoreVisuals, scene, radius, livePreviewDiscColor]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    scene.requestRender();
  }, [scene, livePreviewPointECEF, livePreviewVerticalOffsetAnchorECEF]);

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
      livePreviewDiscSamplesRef.current = [];
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

    if (!showSelectedDisc || !selectedPointId) {
      clearSelectedDisc();
      scene.requestRender();
      return;
    }

    const moveGizmoOnSelectedPoint =
      moveGizmoPointId !== null && moveGizmoPointId === selectedPointId;
    if (moveGizmoOnSelectedPoint) {
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
        segments: 24,
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
        discWorldRadius,
        activeDisc.modelMatrix
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
};

export default useCesiumPointVisualizer;
