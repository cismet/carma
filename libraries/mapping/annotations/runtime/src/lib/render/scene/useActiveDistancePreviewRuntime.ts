import { useEffect, useRef } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  getPointById,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Material,
  Matrix4,
  PolylineCollection,
  SceneTransforms,
  defined,
  type Polyline,
  type Primitive,
  type Scene,
} from "@carma-cesium";
import {
  createOrientedDiscModelMatrix,
  createRing,
  getDiscWorldRadius,
  getLocalUpDirectionAtAnchor,
  isValidScene,
  resolveDiscNormal,
  safeRemovePrimitive,
} from "@carma-mapping/engines/cesium/core";
import { formatLengthMeters, LENGTH_UNIT_MODE } from "@carma-units";

import type {
  PreviewRuntimeController,
  PreviewRuntimeSnapshot,
} from "../../interaction/candidate/previewRuntime";

const PREVIEW_ROOT_SELECTOR = '[data-annotation-cursor-root="true"]';
const PREVIEW_LAYER_ID = "annotation-candidate-preview-layer";
const PREVIEW_PILL_ID = "annotation-candidate-preview-pill";
const PREVIEW_STEM_ID = "annotation-candidate-preview-stem";
const PREVIEW_PILL_OFFSET_X_PX = 24;
const PREVIEW_PILL_OFFSET_Y_PX = -18;
const PREVIEW_STEM_THICKNESS_PX = 2;
const PREVIEW_LINE_LABEL_OFFSET_PX = 18;
const PREVIEW_LINE_LABEL_MIN_LENGTH_PX = 44;
const PREVIEW_RING_RADIUS_SCALE = 1.4;
const PREVIEW_RING_ALPHA = 0.66;
const PREVIEW_RING_SCREEN_RADIUS_PX = 48;
const PREVIEW_LINE_STROKE_WIDTH_PX = 1;
const PREVIEW_GEOMETRY_EPSILON_METERS = 0.01;
const ELEVATION_NEUTRAL_THRESHOLD_METERS = 0.03;
const ELEVATION_GLYPH_UP = "↥";
const ELEVATION_GLYPH_DOWN = "↧";

const DIRECT_LINE_COLOR = "rgba(255, 255, 255, 1)";
const VERTICAL_LINE_COLOR = "rgba(111, 168, 255, 0.96)";
const HORIZONTAL_LINE_COLOR = "rgba(188, 194, 102, 0.95)";

type DistancePreviewRuntimeConfig = {
  activeToolType: AnnotationToolType;
  annotationCursorEnabled: boolean;
  annotations: AnnotationCollection;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  activeNodeChainAnnotationId: string | null;
  selectablePointIds: ReadonlySet<string>;
  distanceModeStickyToFirstPoint: boolean;
  referencePointMeasurementId: string | null;
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  pointRadius: number;
  suppressCandidateLabelOverlay: boolean;
};

type DistancePreviewLineRuntime = {
  polyline: Polyline;
  positions: [Cartesian3, Cartesian3];
};

type DistancePreviewSceneRuntime = {
  lines: {
    direct: DistancePreviewLineRuntime;
    vertical: DistancePreviewLineRuntime;
    horizontal: DistancePreviewLineRuntime;
  };
  lineCollection: PolylineCollection;
  ring: Primitive;
  ringMatrix: Matrix4;
  overlayLayer: HTMLDivElement;
  previewPill: HTMLDivElement;
  previewStem: HTMLDivElement;
  lineLabels: {
    direct: HTMLDivElement;
    vertical: HTMLDivElement;
    horizontal: HTMLDivElement;
  };
  cartographicScratchA: Cartographic;
  cartographicScratchB: Cartographic;
  auxiliaryPointScratch: Cartesian3;
  auxiliaryScreenScratch: Cartesian2;
};

const formatMeters = (value: number): string =>
  formatLengthMeters(value, {
    locale: "de-DE",
    unitMode: LENGTH_UNIT_MODE.METERS,
  });

const formatRelativeElevationText = (
  valueMeters: number | null,
  fallbackHeightMeters: number
) => {
  if (valueMeters === null) {
    return formatMeters(fallbackHeightMeters);
  }

  const elevationText = formatMeters(valueMeters);
  if (Math.abs(valueMeters) < ELEVATION_NEUTRAL_THRESHOLD_METERS) {
    return elevationText;
  }

  return `${elevationText} ${
    valueMeters > 0 ? ELEVATION_GLYPH_UP : ELEVATION_GLYPH_DOWN
  }`;
};

const applyStyles = (
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) => {
  Object.assign(element.style, styles);
};

const resolvePreviewContainer = (scene: Scene) => {
  const explicitRoot = scene.canvas.closest(PREVIEW_ROOT_SELECTOR);
  if (explicitRoot instanceof HTMLElement) {
    return explicitRoot;
  }

  const widgetContainer = scene.canvas.parentElement?.parentElement;
  if (widgetContainer instanceof HTMLElement) {
    return widgetContainer;
  }

  return scene.canvas.parentElement;
};

const createPreviewPill = () => {
  const element = document.createElement("div");
  element.id = PREVIEW_PILL_ID;
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    padding: "3px 9px",
    borderRadius: "999px",
    border: "1px solid rgba(255, 255, 255, 0.88)",
    background: "rgba(255, 255, 255, 0.92)",
    color: "rgba(19, 24, 32, 0.96)",
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "1",
    whiteSpace: "nowrap",
    transform: "translate(-100%, -50%)",
    boxShadow: "0 1px 8px rgba(0, 0, 0, 0.22)",
    pointerEvents: "none",
    willChange: "transform",
  });
  return element;
};

const createPreviewStem = () => {
  const element = document.createElement("div");
  element.id = PREVIEW_STEM_ID;
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    height: `${PREVIEW_STEM_THICKNESS_PX}px`,
    transformOrigin: "0 50%",
    background:
      "repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.92) 0 5px, rgba(255, 255, 255, 0.22) 5px 10px)",
    borderRadius: `${PREVIEW_STEM_THICKNESS_PX}px`,
    pointerEvents: "none",
    willChange: "transform,width",
  });
  return element;
};

const createLineLabel = (accentColor: string) => {
  const element = document.createElement("div");
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    padding: "5px 10px",
    borderRadius: "999px",
    border: `1px solid ${accentColor}`,
    background: "rgba(20, 24, 31, 0.26)",
    color: "rgba(255, 255, 255, 0.98)",
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "1",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    backdropFilter: "blur(10px) saturate(1.08) brightness(1.16)",
    boxShadow:
      "0 6px 18px rgba(0, 0, 0, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.14)",
    pointerEvents: "none",
    transform: "translate(-50%, -50%)",
    willChange: "transform",
  });
  return element;
};

const hidePreviewOverlay = (
  previewPill: HTMLDivElement,
  previewStem: HTMLDivElement
) => {
  previewPill.style.display = "none";
  previewStem.style.display = "none";
};

const hideLineLabels = (lineLabels: DistancePreviewSceneRuntime["lineLabels"]) => {
  lineLabels.direct.style.display = "none";
  lineLabels.vertical.style.display = "none";
  lineLabels.horizontal.style.display = "none";
};

const createLineRuntime = (
  collection: PolylineCollection,
  id: string,
  colorCss: string
): DistancePreviewLineRuntime => {
  const positions: [Cartesian3, Cartesian3] = [
    new Cartesian3(),
    new Cartesian3(),
  ];
  const polyline = collection.add({
    id,
    positions,
    width: PREVIEW_LINE_STROKE_WIDTH_PX,
    material: Material.fromType("Color", {
      color: Color.fromCssColorString(colorCss),
    }),
    show: false,
  });

  return { polyline, positions };
};

const createSceneRuntime = (
  scene: Scene
): DistancePreviewSceneRuntime | null => {
  const container = resolvePreviewContainer(scene);
  if (!container) {
    return null;
  }

  const overlayLayer = document.createElement("div");
  overlayLayer.id = PREVIEW_LAYER_ID;
  applyStyles(overlayLayer, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "1650",
  });

  const previewPill = createPreviewPill();
  const previewStem = createPreviewStem();
  const lineLabels = {
    direct: createLineLabel("rgba(255, 255, 255, 0.34)"),
    vertical: createLineLabel("rgba(111, 168, 255, 0.54)"),
    horizontal: createLineLabel("rgba(188, 194, 102, 0.5)"),
  };
  overlayLayer.append(
    lineLabels.direct,
    lineLabels.vertical,
    lineLabels.horizontal,
    previewStem,
    previewPill
  );
  container.appendChild(overlayLayer);

  const lineCollection = new PolylineCollection();
  const lines = {
    direct: createLineRuntime(
      lineCollection,
      "distance-preview-direct",
      DIRECT_LINE_COLOR
    ),
    vertical: createLineRuntime(
      lineCollection,
      "distance-preview-vertical",
      VERTICAL_LINE_COLOR
    ),
    horizontal: createLineRuntime(
      lineCollection,
      "distance-preview-horizontal",
      HORIZONTAL_LINE_COLOR
    ),
  };
  scene.primitives.add(lineCollection);

  const ring = createRing("measurement-distance-preview-ring", {
    radius: 1,
    innerRadius: 0.5,
    color: Color.WHITE.withAlpha(PREVIEW_RING_ALPHA),
    segments: 20,
  });
  scene.primitives.add(ring);
  ring.show = false;

  return {
    lines,
    lineCollection,
    ring,
    ringMatrix: new Matrix4(),
    overlayLayer,
    previewPill,
    previewStem,
    lineLabels,
    cartographicScratchA: new Cartographic(),
    cartographicScratchB: new Cartographic(),
    auxiliaryPointScratch: new Cartesian3(),
    auxiliaryScreenScratch: new Cartesian2(),
  };
};

const clearLineRuntime = (lineRuntime: DistancePreviewLineRuntime) => {
  lineRuntime.polyline.show = false;
};

const applyLineRuntime = (
  lineRuntime: DistancePreviewLineRuntime,
  start: Cartesian3,
  end: Cartesian3
) => {
  Cartesian3.clone(start, lineRuntime.positions[0]);
  Cartesian3.clone(end, lineRuntime.positions[1]);
  lineRuntime.polyline.positions = lineRuntime.positions;
  lineRuntime.polyline.show = true;
};

const hideSceneRuntime = (runtime: DistancePreviewSceneRuntime) => {
  clearLineRuntime(runtime.lines.direct);
  clearLineRuntime(runtime.lines.vertical);
  clearLineRuntime(runtime.lines.horizontal);
  runtime.ring.show = false;
  hidePreviewOverlay(runtime.previewPill, runtime.previewStem);
  hideLineLabels(runtime.lineLabels);
};

const destroySceneRuntime = (
  scene: Scene | null,
  runtime: DistancePreviewSceneRuntime | null
) => {
  if (!scene || !runtime) {
    return;
  }

  runtime.overlayLayer.remove();
  safeRemovePrimitive(scene, runtime.ring);

  try {
    if (!scene.isDestroyed()) {
      scene.primitives.remove(runtime.lineCollection);
    }
  } catch {
    // Scene teardown can race with cleanup.
  }
};

const resolveOpenChainPointId = (
  activeNodeChainAnnotationId: string | null,
  nodeChainAnnotations: readonly NodeChainAnnotation[]
) => {
  if (!activeNodeChainAnnotationId) {
    return null;
  }

  const activeOpenAnnotation =
    nodeChainAnnotations.find(
      (annotation) =>
        annotation.id === activeNodeChainAnnotationId && !annotation.closed
    ) ?? null;

  return (
    activeOpenAnnotation?.nodeIds[activeOpenAnnotation.nodeIds.length - 1] ??
    null
  );
};

const buildAuxiliaryPoint = (
  scene: Scene,
  anchorPointECEF: Cartesian3,
  targetPointECEF: Cartesian3,
  cartographicScratchA: Cartographic,
  cartographicScratchB: Cartographic,
  result: Cartesian3
) => {
  const ellipsoid = scene.globe.ellipsoid;
  const anchorCartographic =
    ellipsoid.cartesianToCartographic(anchorPointECEF, cartographicScratchA);
  const targetCartographic =
    ellipsoid.cartesianToCartographic(targetPointECEF, cartographicScratchB);
  if (!anchorCartographic || !targetCartographic) {
    return null;
  }

  return Cartesian3.fromRadians(
    anchorCartographic.longitude,
    anchorCartographic.latitude,
    targetCartographic.height ?? 0,
    ellipsoid,
    result
  );
};

const resolveDistanceAnchorPoint = (config: DistancePreviewRuntimeConfig) => {
  if (config.activeToolType !== ANNOTATION_TYPE_DISTANCE) {
    return null;
  }

  const openChainPointId = resolveOpenChainPointId(
    config.activeNodeChainAnnotationId,
    config.nodeChainAnnotations
  );
  const anchorPointId =
    config.distanceModeStickyToFirstPoint && config.referencePointMeasurementId
      ? config.referencePointMeasurementId
      : openChainPointId && config.selectablePointIds.has(openChainPointId)
      ? openChainPointId
      : null;

  if (!anchorPointId) {
    return null;
  }

  const anchorPoint = getPointById(config.annotations, anchorPointId);
  return anchorPoint && isPointAnnotationEntry(anchorPoint)
    ? anchorPoint
    : null;
};

const applyPreviewOverlay = (
  runtime: DistancePreviewSceneRuntime,
  snapshot: PreviewRuntimeSnapshot,
  anchorPoint: ReturnType<typeof resolveDistanceAnchorPoint>,
  targetHeightMeters: number,
  suppressCandidateLabelOverlay: boolean
) => {
  if (
    suppressCandidateLabelOverlay ||
    !snapshot.candidateNodeScreenPosition ||
    !snapshot.candidateNodePositionECEF
  ) {
    hidePreviewOverlay(runtime.previewPill, runtime.previewStem);
    return;
  }

  const anchorHeightMeters = anchorPoint
    ? anchorPoint.geometryWGS84?.altitude ?? null
    : null;
  const relativeElevationMeters =
    anchorHeightMeters === null ? null : targetHeightMeters - anchorHeightMeters;

  runtime.previewPill.textContent = formatRelativeElevationText(
    relativeElevationMeters,
    targetHeightMeters
  );
  runtime.previewPill.style.display = "block";
  runtime.previewPill.style.transform = `translate(${Math.round(
    snapshot.candidateNodeScreenPosition.x - PREVIEW_PILL_OFFSET_X_PX
  )}px, ${Math.round(
    snapshot.candidateNodeScreenPosition.y + PREVIEW_PILL_OFFSET_Y_PX
  )}px) translate(-100%, -50%)`;

  const anchorScreenPosition =
    snapshot.candidateNodeVerticalOffsetAnchorScreenPosition;
  if (!anchorScreenPosition) {
    runtime.previewStem.style.display = "none";
    return;
  }

  const deltaX =
    snapshot.candidateNodeScreenPosition.x - anchorScreenPosition.x;
  const deltaY =
    snapshot.candidateNodeScreenPosition.y - anchorScreenPosition.y;
  const distancePx = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(distancePx) || distancePx < 1) {
    runtime.previewStem.style.display = "none";
    return;
  }

  runtime.previewStem.style.display = "block";
  runtime.previewStem.style.width = `${distancePx}px`;
  runtime.previewStem.style.transform = `translate(${Math.round(
    anchorScreenPosition.x
  )}px, ${Math.round(anchorScreenPosition.y)}px) rotate(${Math.atan2(
    deltaY,
    deltaX
  )}rad)`;
};

const resolveLabelOffsetPosition = ({
  start,
  end,
}: {
  start: { x: number; y: number };
  end: { x: number; y: number };
}) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distancePx = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(distancePx) || distancePx < PREVIEW_LINE_LABEL_MIN_LENGTH_PX) {
    return null;
  }

  const midX = (start.x + end.x) * 0.5;
  const midY = (start.y + end.y) * 0.5;
  const normalX = -deltaY / distancePx;
  const normalY = deltaX / distancePx;

  return {
    x: midX + normalX * PREVIEW_LINE_LABEL_OFFSET_PX,
    y: midY + normalY * PREVIEW_LINE_LABEL_OFFSET_PX,
  };
};

const applyLineLabel = ({
  element,
  text,
  start,
  end,
}: {
  element: HTMLDivElement;
  text: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}) => {
  const labelPosition = resolveLabelOffsetPosition({ start, end });
  if (!labelPosition) {
    element.style.display = "none";
    return;
  }

  element.textContent = text;
  element.style.display = "block";
  element.style.transform = `translate(${Math.round(
    labelPosition.x
  )}px, ${Math.round(labelPosition.y)}px) translate(-50%, -50%)`;
};

const applyDistancePreviewRuntime = (
  scene: Scene,
  runtime: DistancePreviewSceneRuntime,
  snapshot: PreviewRuntimeSnapshot,
  config: DistancePreviewRuntimeConfig
) => {
  if (
    !config.annotationCursorEnabled ||
    config.activeToolType !== ANNOTATION_TYPE_DISTANCE ||
    !snapshot.candidateNodePositionECEF
  ) {
    hideSceneRuntime(runtime);
    return;
  }

  const anchorPoint = resolveDistanceAnchorPoint(config);
  const ringCenter =
    snapshot.candidateNodeVerticalOffsetAnchorECEF ??
    snapshot.candidateNodePositionECEF;
  const ringNormal = resolveDiscNormal(
    ringCenter,
    snapshot.candidateNodeSurfaceNormalECEF ??
      getLocalUpDirectionAtAnchor(ringCenter)
  );
  const ringRadius = getDiscWorldRadius(
    scene,
    ringCenter,
    ringNormal,
    Math.max(config.pointRadius * PREVIEW_RING_RADIUS_SCALE, 0.1),
    PREVIEW_RING_SCREEN_RADIUS_PX
  );
  runtime.ring.show = true;
  runtime.ring.modelMatrix = createOrientedDiscModelMatrix(
    ringCenter,
    ringNormal,
    ringRadius,
    runtime.ringMatrix
  );

  const ellipsoid = scene.globe.ellipsoid;
  const targetCartographic =
    ellipsoid.cartesianToCartographic(
      snapshot.candidateNodePositionECEF,
      runtime.cartographicScratchA
    );
  const targetHeightMeters = targetCartographic?.height ?? 0;

  applyPreviewOverlay(
    runtime,
    snapshot,
    anchorPoint,
    targetHeightMeters,
    config.suppressCandidateLabelOverlay
  );

  clearLineRuntime(runtime.lines.direct);
  clearLineRuntime(runtime.lines.vertical);
  clearLineRuntime(runtime.lines.horizontal);
  hideLineLabels(runtime.lineLabels);

  if (!anchorPoint) {
    return;
  }

  const anchorPointECEF = anchorPoint.geometryECEF;
  if (
    Cartesian3.distance(anchorPointECEF, snapshot.candidateNodePositionECEF) <=
    PREVIEW_GEOMETRY_EPSILON_METERS
  ) {
    return;
  }

  if (config.distanceCreationLineVisibility.direct) {
    applyLineRuntime(
      runtime.lines.direct,
      anchorPointECEF,
      snapshot.candidateNodePositionECEF
    );
    if (
      snapshot.candidateNodeVerticalOffsetAnchorScreenPosition &&
      snapshot.candidateNodeScreenPosition
    ) {
      applyLineLabel({
        element: runtime.lineLabels.direct,
        text: formatMeters(
          Cartesian3.distance(anchorPointECEF, snapshot.candidateNodePositionECEF)
        ),
        start: snapshot.candidateNodeVerticalOffsetAnchorScreenPosition,
        end: snapshot.candidateNodeScreenPosition,
      });
    }
  }

  const auxiliaryPoint = buildAuxiliaryPoint(
    scene,
    anchorPointECEF,
    snapshot.candidateNodePositionECEF,
    runtime.cartographicScratchA,
    runtime.cartographicScratchB,
    runtime.auxiliaryPointScratch
  );
  if (!auxiliaryPoint) {
    return;
  }

  const auxiliaryScreenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    auxiliaryPoint,
    runtime.auxiliaryScreenScratch
  );

  if (
    config.distanceCreationLineVisibility.vertical &&
    Cartesian3.distance(anchorPointECEF, auxiliaryPoint) >
      PREVIEW_GEOMETRY_EPSILON_METERS
  ) {
    applyLineRuntime(runtime.lines.vertical, anchorPointECEF, auxiliaryPoint);
    if (
      snapshot.candidateNodeVerticalOffsetAnchorScreenPosition &&
      defined(auxiliaryScreenPosition)
    ) {
      applyLineLabel({
        element: runtime.lineLabels.vertical,
        text: formatMeters(Cartesian3.distance(anchorPointECEF, auxiliaryPoint)),
        start: snapshot.candidateNodeVerticalOffsetAnchorScreenPosition,
        end: auxiliaryScreenPosition,
      });
    }
  }

  if (
    config.distanceCreationLineVisibility.horizontal &&
    Cartesian3.distance(auxiliaryPoint, snapshot.candidateNodePositionECEF) >
      PREVIEW_GEOMETRY_EPSILON_METERS
  ) {
    applyLineRuntime(
      runtime.lines.horizontal,
      auxiliaryPoint,
      snapshot.candidateNodePositionECEF
    );
    if (
      defined(auxiliaryScreenPosition) &&
      snapshot.candidateNodeScreenPosition
    ) {
      applyLineLabel({
        element: runtime.lineLabels.horizontal,
        text: formatMeters(
          Cartesian3.distance(auxiliaryPoint, snapshot.candidateNodePositionECEF)
        ),
        start: auxiliaryScreenPosition,
        end: snapshot.candidateNodeScreenPosition,
      });
    }
  }
};

export const useActiveDistancePreviewRuntime = (
  scene: Scene | null,
  previewRuntimeController: PreviewRuntimeController,
  config: DistancePreviewRuntimeConfig
) => {
  const sceneRuntimeRef = useRef<DistancePreviewSceneRuntime | null>(null);
  const latestConfigRef = useRef(config);
  const latestSnapshotRef = useRef(previewRuntimeController.getSnapshot());

  latestConfigRef.current = config;

  useEffect(() => {
    if (!isValidScene(scene)) {
      return;
    }

    const sceneRuntime = createSceneRuntime(scene);
    if (!sceneRuntime) {
      return;
    }
    sceneRuntimeRef.current = sceneRuntime;

    const applyLatestPreview = () => {
      const activeRuntime = sceneRuntimeRef.current;
      if (!activeRuntime || !isValidScene(scene)) {
        return;
      }

      applyDistancePreviewRuntime(
        scene,
        activeRuntime,
        latestSnapshotRef.current,
        latestConfigRef.current
      );
      scene.requestRender();
    };

    const unsubscribe = previewRuntimeController.subscribe((snapshot) => {
      latestSnapshotRef.current = snapshot;
      applyLatestPreview();
    });

    applyLatestPreview();

    return () => {
      unsubscribe();
      destroySceneRuntime(scene, sceneRuntimeRef.current);
      sceneRuntimeRef.current = null;
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [previewRuntimeController, scene]);

  useEffect(() => {
    if (!sceneRuntimeRef.current || !isValidScene(scene)) {
      return;
    }

    applyDistancePreviewRuntime(
      scene,
      sceneRuntimeRef.current,
      latestSnapshotRef.current,
      latestConfigRef.current
    );
    scene.requestRender();
  }, [
    config.activeNodeChainAnnotationId,
    config.activeToolType,
    config.annotationCursorEnabled,
    config.annotations,
    config.distanceCreationLineVisibility,
    config.distanceModeStickyToFirstPoint,
    config.nodeChainAnnotations,
    config.pointRadius,
    config.referencePointMeasurementId,
    config.selectablePointIds,
    config.suppressCandidateLabelOverlay,
    scene,
  ]);
};
