import { useEffect, useMemo, useRef } from "react";

import { createSvgLineVisualizers } from "@carma-commons/svg";
import {
  distanceVisualizationDefaults,
  getAnnotationSurfaceAccentCssColor,
} from "@carma-mapping/annotations/core";
import {
  cartesian3FromGeographicCoordinate,
  getArcPointsInSpannedPlane,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";
import { formatLengthMeters, type CssPixelPosition } from "@carma-units";
import {
  BoundingSphere,
  Cartesian3,
  Color,
  Material,
  PolylineCollection,
  SceneTransforms,
  defined,
} from "@carma-cesium";
import {
  buildOverlayHoverFilterCss,
  buildOverlayHoverTransitionCss,
  buildOverlayRingBoxShadowCss,
  labelOverlayAffordanceDefaults,
  labelOverlayLayerDefaults,
  resolveOverlayMidpointTickMetrics,
  useLineVisualizers,
  type LineVisualizerData,
  type Rect,
} from "@carma-providers/label-overlay";

import type { Scene } from "@carma-cesium";
import {
  PREVIEW_OVERLAY_GROUP,
  buildAuxiliaryPoint,
  buildPreviewDistanceTriangleLabelReferences,
  createLineLabel,
  createPreviewOverlayLayers,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyPreviewOverlayLayer,
  hideLineLabels,
  previewControllerDefaults,
  resolvePreviewContainer,
  resolvePreviewDistanceTriangleComponentLabelVisibility,
  type PreviewSegmentLineLabelElements,
  type PreviewSegmentScratch,
} from "../interaction/authoring-visual-runtime";
import {
  RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE,
  resolveRuntimeOverlayDistanceZIndex,
  type RuntimeDistanceTriangleOverlayRenderModel,
  type RuntimeEdgeRenderModel,
} from "./measurement-render-models";
import {
  areOverlayVisibilitySceneSnapshotsEqual,
  captureOverlayVisibilitySceneSnapshot,
  type OverlayVisibilitySceneSnapshot,
} from "./overlay-visibility.shared";
import { type SecondaryLineLabelPlacementCandidate } from "./secondary-line-label-placement";
import {
  reconcileSecondaryLineLabelVisibility,
  type SecondaryLineLabelConflictCandidate,
} from "./secondary-line-label-conflict-resolution";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import {
  resolvePreviewLineLabelVisualOptions,
  type PreviewLineLabelVisualOptions,
} from "../config/preview-line-label-visual-defaults";
import { measurementVisualDefaults } from "../config/measurement-visual-defaults";

type UseRuntimeMeasurementEdgesControllerArgs = {
  edges: readonly RuntimeEdgeRenderModel[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  surfaceKey?: string;
  activeMoveGizmoNodeId: string | null;
  blockEdgeInteractions: boolean;
  onMeasurementSelect?: (measurementId: string) => void;
  onEdgeClick?: (startNodeId: string, endNodeId: string) => boolean;
  insertNodeTargetMeasurementIds?: readonly string[];
  onInsertNodeTargetClick?: (
    measurementId: string,
    startNodeId: string,
    endNodeId: string
  ) => boolean;
  onDistanceTriangleCornerClick?: (measurementId: string) => void;
};

type EdgeSceneLine = {
  id: string;
  start: Cartesian3;
  end: Cartesian3;
  stroke: string;
  strokeWidth: number;
};

type EdgeSegment = {
  id: string;
  measurementId?: string;
  startNodeId?: string;
  endNodeId?: string;
  startCoordinate: RuntimeEdgeRenderModel["coordinates"][number];
  endCoordinate: RuntimeEdgeRenderModel["coordinates"][number];
  stroke: string;
  strokeWidth: number;
  overlayDashPattern: string;
  overlayDashed?: true;
  showSegmentLengthLabels?: true;
  distanceTriangleOverlay?: RuntimeDistanceTriangleOverlayRenderModel;
};

const resolveDistanceTriangleMeasurementId = (edge: EdgeSegment) =>
  edge.distanceTriangleOverlay?.measurementId ?? edge.id;

const resolveOverlayZIndexAtWorldPosition = (
  scene: Scene,
  worldPosition: Cartesian3
) =>
  resolveRuntimeOverlayDistanceZIndex(
    Cartesian3.distance(scene.camera.positionWC, worldPosition)
  );

const resolveOverlayZIndexBetweenWorldPositions = (
  scene: Scene,
  start: Cartesian3,
  end: Cartesian3
) =>
  Math.round(
    (resolveOverlayZIndexAtWorldPosition(scene, start) +
      resolveOverlayZIndexAtWorldPosition(scene, end)) /
      2
  );

const measurementEdgeMidpointMarkerDefaults = Object.freeze({
  ...resolveOverlayMidpointTickMetrics({
    markerDiameterPx: measurementVisualDefaults.sizes.pointPixelSize,
    markerStrokeWidthPx: measurementVisualDefaults.sizes.pointOutlineWidth,
  }),
  tickColor: labelOverlayAffordanceDefaults.colors.surfaceStrong,
  minOverlayZIndex: labelOverlayLayerDefaults.zIndex.interactionHandleFloor,
});

const measurementEdgeDefaults = Object.freeze({
  pointLabelCollisionSelector:
    '[data-pillbutton-root="true"], [data-point-label-content-root="true"]',
  svgNamespace: "http://www.w3.org/2000/svg",
  distanceTriangle: Object.freeze({
    cornerDotRadiusPx: 1.25 / 2,
  }),
  midpointMarker: measurementEdgeMidpointMarkerDefaults,
});

const distanceTriangleVisualDefaults = Object.freeze({
  cornerOverlay: Object.freeze({
    minBoxPx: 20,
    paddingPx: 6,
    targetRadiusPx: 20,
    segments: 20,
    strokeWidthPx: 1.25,
    color: getAnnotationSurfaceAccentCssColor(),
    straightHitTargetPx: 20,
  }),
});

const toLayoutRect = (domRect: DOMRect): Rect => ({
  left: domRect.left,
  top: domRect.top,
  right: domRect.right,
  bottom: domRect.bottom,
});

const resolveVisiblePointLabelRects = (scene: Scene): Rect[] => {
  const container = resolvePreviewContainer(scene);
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      measurementEdgeDefaults.pointLabelCollisionSelector
    )
  )
    .map((element) => toLayoutRect(element.getBoundingClientRect()))
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
};

type SceneLineHandle = {
  signature: string;
  collection: PolylineCollection;
  destroy: () => void;
};

type DistanceTriangleOverlayScreenData = {
  anchorPointECEF: Cartesian3;
  targetPointECEF: Cartesian3;
  auxiliaryPointECEF: Cartesian3;
  anchorScreenPosition: CssPixelPosition;
  targetScreenPosition: CssPixelPosition;
  auxiliaryScreenPosition: CssPixelPosition;
  directLabelText: string;
  verticalLabelText: string | null;
  horizontalLabelText: string | null;
  showVerticalLabel: boolean;
  showHorizontalLabel: boolean;
  directOutsideReferencePoint: CssPixelPosition | null;
  verticalOutsideReferencePoint: CssPixelPosition | null;
  horizontalOutsideReferencePoint: CssPixelPosition | null;
  nextVerticalOutsideSign: -1 | 1 | undefined;
};

type DistanceTriangleLabelHandle = {
  lineLabels: PreviewSegmentLineLabelElements;
  scratch: PreviewSegmentScratch;
  previousVerticalOutsideSign?: -1 | 1;
};

type EdgeSegmentLabelHandle = {
  element: HTMLDivElement;
};

type DistanceTriangleCornerHandle = {
  root: HTMLDivElement;
  svg: SVGSVGElement;
  path: SVGPathElement;
  dot: SVGCircleElement;
};

type EdgeMidpointHandle = {
  root: HTMLDivElement;
  tick: HTMLDivElement;
};

const buildSceneLineSignature = (line: EdgeSceneLine) =>
  [
    line.id,
    line.start.x,
    line.start.y,
    line.start.z,
    line.end.x,
    line.end.y,
    line.end.z,
    line.stroke,
    line.strokeWidth,
  ].join(":");

const createSceneLineHandle = (
  scene: Scene,
  line: EdgeSceneLine
): SceneLineHandle => {
  const collection = new PolylineCollection();
  const material = Material.fromType("Color", {
    color: Color.fromCssColorString(line.stroke),
  });

  collection.add({
    id: line.id,
    positions: [line.start, line.end],
    width: line.strokeWidth,
    material,
    show: true,
  });

  scene.primitives.add(collection);

  const destroy = () => {
    if (!isValidScene(scene)) {
      return;
    }

    try {
      if (
        typeof collection.isDestroyed === "function" &&
        collection.isDestroyed()
      ) {
        return;
      }
      scene.primitives.remove(collection);
    } catch (error) {
      console.warn(
        "[annotations/runtime] Ignoring committed edge destroy error.",
        error
      );
    }
  };

  return {
    signature: buildSceneLineSignature(line),
    collection,
    destroy,
  };
};

const destroySceneLineHandles = (handles: Map<string, SceneLineHandle>) => {
  handles.forEach((handle) => {
    handle.destroy();
  });
  handles.clear();
};

const resolveDistanceTriangleLabelLayerId = (surfaceKey: string) =>
  `annotation-overlay-distance-triangle-label-layer-${surfaceKey}`;

const toCssPixelPosition = (x: number, y: number): CssPixelPosition =>
  ({
    x: x as CssPixelPosition["x"],
    y: y as CssPixelPosition["y"],
  } as CssPixelPosition);

const resolveDistanceTriangleAnchorSelection = ({
  overlay,
}: {
  overlay: RuntimeDistanceTriangleOverlayRenderModel;
}) =>
  overlay.anchorCoordinateRole !==
  RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE.END_COORDINATE;

const resolveDistanceTriangleOverlayScreenData = ({
  scene,
  edge,
  scratch,
  previousVerticalOutsideSign,
  formatOptions,
}: {
  scene: Scene;
  edge: EdgeSegment;
  scratch: PreviewSegmentScratch;
  previousVerticalOutsideSign?: -1 | 1;
  formatOptions: AnnotationsRuntimeFormatOptions;
}): DistanceTriangleOverlayScreenData | null => {
  const overlay = edge.distanceTriangleOverlay;
  if (!overlay || !edge.startCoordinate || !edge.endCoordinate) {
    return null;
  }

  const startPointECEF = cartesian3FromGeographicCoordinate(
    edge.startCoordinate
  );
  const endPointECEF = cartesian3FromGeographicCoordinate(edge.endCoordinate);
  const startCanvasPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    startPointECEF
  );
  const endCanvasPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    endPointECEF
  );
  if (!defined(startCanvasPosition) || !defined(endCanvasPosition)) {
    return null;
  }

  const startScreenPosition = toCssPixelPosition(
    startCanvasPosition.x,
    startCanvasPosition.y
  );
  const endScreenPosition = toCssPixelPosition(
    endCanvasPosition.x,
    endCanvasPosition.y
  );
  const anchorIsStart = resolveDistanceTriangleAnchorSelection({
    overlay,
  });
  const anchorCoordinate = anchorIsStart
    ? edge.startCoordinate
    : edge.endCoordinate;
  const targetCoordinate = anchorIsStart
    ? edge.endCoordinate
    : edge.startCoordinate;
  const anchorPointECEF = anchorIsStart ? startPointECEF : endPointECEF;
  const targetPointECEF = anchorIsStart ? endPointECEF : startPointECEF;
  const anchorScreenPosition = anchorIsStart
    ? startScreenPosition
    : endScreenPosition;
  const targetScreenPosition = anchorIsStart
    ? endScreenPosition
    : startScreenPosition;
  const auxiliaryPointECEF = buildAuxiliaryPoint({
    scene,
    anchorPointECEF,
    targetPointECEF,
    scratch,
  });
  if (!auxiliaryPointECEF) {
    return null;
  }

  const auxiliaryCanvasPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    auxiliaryPointECEF,
    scratch.auxiliaryScreen
  );
  if (!defined(auxiliaryCanvasPosition)) {
    return null;
  }

  const auxiliaryScreenPosition = toCssPixelPosition(
    auxiliaryCanvasPosition.x,
    auxiliaryCanvasPosition.y
  );
  const labelReferences = buildPreviewDistanceTriangleLabelReferences({
    anchor: anchorScreenPosition,
    target: targetScreenPosition,
    aux: auxiliaryScreenPosition,
    anchorAltitudeMeters: anchorCoordinate.altitude,
    targetAltitudeMeters: targetCoordinate.altitude,
    previousVerticalOutsideSign,
  });
  const directLabelText = formatLengthMeters(
    Cartesian3.distance(anchorPointECEF, targetPointECEF),
    formatOptions.lengthMeters
  );
  const verticalDistanceMeters = Cartesian3.distance(
    anchorPointECEF,
    auxiliaryPointECEF
  );
  const horizontalDistanceMeters = Cartesian3.distance(
    auxiliaryPointECEF,
    targetPointECEF
  );
  const verticalLabelText =
    verticalDistanceMeters > previewControllerDefaults.geometryEpsilonMeters
      ? formatLengthMeters(verticalDistanceMeters, formatOptions.lengthMeters)
      : null;
  const horizontalLabelText =
    horizontalDistanceMeters > previewControllerDefaults.geometryEpsilonMeters
      ? formatLengthMeters(horizontalDistanceMeters, formatOptions.lengthMeters)
      : null;
  const componentLabelVisibility =
    resolvePreviewDistanceTriangleComponentLabelVisibility({
      directLabelText,
      verticalLabelText,
      horizontalLabelText,
    });

  return {
    anchorPointECEF,
    targetPointECEF,
    auxiliaryPointECEF,
    anchorScreenPosition,
    targetScreenPosition,
    auxiliaryScreenPosition,
    directLabelText,
    verticalLabelText,
    horizontalLabelText,
    showVerticalLabel: componentLabelVisibility.showVerticalLabel,
    showHorizontalLabel: componentLabelVisibility.showHorizontalLabel,
    directOutsideReferencePoint: labelReferences.directOutsideReferencePoint,
    verticalOutsideReferencePoint:
      labelReferences.verticalOutsideReferencePoint,
    horizontalOutsideReferencePoint:
      labelReferences.horizontalOutsideReferencePoint,
    nextVerticalOutsideSign: labelReferences.nextVerticalOutsideSign,
  };
};

const createDistanceTriangleLabelHandle = (
  overlayLayer: HTMLElement,
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>
): DistanceTriangleLabelHandle => {
  const lineLabels = createSegmentLineLabels(previewLineLabelVisualOptions);
  overlayLayer.append(
    lineLabels.direct,
    lineLabels.vertical,
    lineLabels.horizontal
  );

  return {
    lineLabels,
    scratch: createPreviewSegmentScratch(),
  };
};

const createEdgeSegmentLabelHandle = (
  overlayLayer: HTMLElement,
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>
): EdgeSegmentLabelHandle => {
  const element = createLineLabel(
    measurementVisualDefaults.colors.componentLabelAccents.direct,
    previewLineLabelVisualOptions
  );
  overlayLayer.appendChild(element);

  return {
    element,
  };
};

const destroyDistanceTriangleLabelHandle = (
  handle: DistanceTriangleLabelHandle
) => {
  hideLineLabels(handle.lineLabels);
  handle.lineLabels.direct.remove();
  handle.lineLabels.vertical.remove();
  handle.lineLabels.horizontal.remove();
};

const destroyEdgeSegmentLabelHandle = (handle: EdgeSegmentLabelHandle) => {
  handle.element.style.display = "none";
  handle.element.remove();
};

const destroyDistanceTriangleLabelHandles = (
  handles: Map<string, DistanceTriangleLabelHandle>
) => {
  handles.forEach((handle) => {
    destroyDistanceTriangleLabelHandle(handle);
  });
  handles.clear();
};

const destroyEdgeSegmentLabelHandles = (
  handles: Map<string, EdgeSegmentLabelHandle>
) => {
  handles.forEach((handle) => {
    destroyEdgeSegmentLabelHandle(handle);
  });
  handles.clear();
};

const createDistanceTriangleCornerHandle = (
  overlayLayer: HTMLElement
): DistanceTriangleCornerHandle => {
  const root = document.createElement("div");
  root.style.position = "absolute";
  root.style.display = "none";
  root.style.pointerEvents = "none";
  root.style.userSelect = "none";
  root.style.webkitUserSelect = "none";
  root.style.cursor = "default";
  root.style.zIndex = "0";

  const svg = document.createElementNS(
    measurementEdgeDefaults.svgNamespace,
    "svg"
  );
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";

  const path = document.createElementNS(
    measurementEdgeDefaults.svgNamespace,
    "path"
  );
  path.setAttribute("fill", "none");
  path.setAttribute(
    "stroke",
    distanceTriangleVisualDefaults.cornerOverlay.color
  );
  path.setAttribute(
    "stroke-width",
    `${distanceTriangleVisualDefaults.cornerOverlay.strokeWidthPx}`
  );
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  const dot = document.createElementNS(
    measurementEdgeDefaults.svgNamespace,
    "circle"
  );
  dot.setAttribute(
    "r",
    `${measurementEdgeDefaults.distanceTriangle.cornerDotRadiusPx}`
  );
  dot.setAttribute("fill", distanceTriangleVisualDefaults.cornerOverlay.color);

  svg.append(path, dot);
  root.appendChild(svg);
  overlayLayer.appendChild(root);

  return {
    root,
    svg,
    path,
    dot,
  };
};

const destroyDistanceTriangleCornerHandle = (
  handle: DistanceTriangleCornerHandle
) => {
  handle.root.remove();
};

const destroyDistanceTriangleCornerHandles = (
  handles: Map<string, DistanceTriangleCornerHandle>
) => {
  handles.forEach((handle) => {
    destroyDistanceTriangleCornerHandle(handle);
  });
  handles.clear();
};

const hideDistanceTriangleCornerHandle = (
  handle: DistanceTriangleCornerHandle
) => {
  handle.root.style.display = "none";
  handle.root.onclick = null;
};

const applyDistanceTriangleCornerHandleLayout = ({
  handle,
  pathData,
  dotScreen,
  minX,
  minY,
  width,
  height,
  clickable,
  onClick,
}: {
  handle: DistanceTriangleCornerHandle;
  pathData: string;
  dotScreen: CssPixelPosition;
  minX: number;
  minY: number;
  width: number;
  height: number;
  clickable: boolean;
  onClick?: (() => void) | null;
}) => {
  handle.path.setAttribute("d", pathData);
  handle.path.style.display = "block";
  handle.svg.style.display = "block";
  handle.dot.setAttribute(
    "cx",
    `${
      dotScreen.x -
      minX +
      distanceTriangleVisualDefaults.cornerOverlay.paddingPx
    }`
  );
  handle.dot.setAttribute(
    "cy",
    `${
      dotScreen.y -
      minY +
      distanceTriangleVisualDefaults.cornerOverlay.paddingPx
    }`
  );
  handle.root.style.left = `${
    minX - distanceTriangleVisualDefaults.cornerOverlay.paddingPx
  }px`;
  handle.root.style.top = `${
    minY - distanceTriangleVisualDefaults.cornerOverlay.paddingPx
  }px`;
  handle.root.style.width = `${width}px`;
  handle.root.style.height = `${height}px`;
  handle.root.style.transform = "none";
  handle.root.style.display = "block";
  handle.root.style.pointerEvents = clickable ? "auto" : "none";
  handle.root.style.cursor = clickable ? "pointer" : "default";
  handle.root.onclick = clickable && onClick ? onClick : null;
};

const applyDistanceTriangleStraightCornerHandleLayout = ({
  handle,
  center,
  clickable,
  onClick,
}: {
  handle: DistanceTriangleCornerHandle;
  center: CssPixelPosition;
  clickable: boolean;
  onClick?: (() => void) | null;
}) => {
  const hitTargetPx =
    distanceTriangleVisualDefaults.cornerOverlay.straightHitTargetPx;
  const centerPx = hitTargetPx / 2;

  handle.path.style.display = "none";
  handle.svg.style.display = "block";
  handle.dot.setAttribute("cx", `${centerPx}`);
  handle.dot.setAttribute("cy", `${centerPx}`);
  handle.root.style.left = `${center.x - centerPx}px`;
  handle.root.style.top = `${center.y - centerPx}px`;
  handle.root.style.width = `${hitTargetPx}px`;
  handle.root.style.height = `${hitTargetPx}px`;
  handle.root.style.transform = "none";
  handle.root.style.display = "block";
  handle.root.style.pointerEvents = clickable ? "auto" : "none";
  handle.root.style.cursor = clickable ? "pointer" : "default";
  handle.root.onclick = clickable && onClick ? onClick : null;
};

const createEdgeMidpointHandle = (
  overlayLayer: HTMLElement
): EdgeMidpointHandle => {
  const root = document.createElement("div");
  root.style.position = "absolute";
  root.style.display = "none";
  root.style.pointerEvents = "none";
  root.style.userSelect = "none";
  root.style.webkitUserSelect = "none";
  root.style.cursor = "default";

  const tick = document.createElement("div");
  tick.style.position = "absolute";
  tick.style.left = "50%";
  tick.style.top = "50%";
  tick.style.width = `${measurementEdgeDefaults.midpointMarker.tickLengthPx}px`;
  tick.style.height = `${measurementEdgeDefaults.midpointMarker.tickWidthPx}px`;
  tick.style.borderRadius = "999px";
  tick.style.background = measurementEdgeDefaults.midpointMarker.tickColor;
  tick.style.transform = "translate(-50%, -50%)";
  tick.style.pointerEvents = "none";
  tick.style.transition = buildOverlayHoverTransitionCss();

  root.appendChild(tick);
  overlayLayer.appendChild(root);

  return {
    root,
    tick,
  };
};

const destroyEdgeMidpointHandle = (handle: EdgeMidpointHandle) => {
  handle.root.remove();
};

const destroyEdgeMidpointHandles = (
  handles: Map<string, EdgeMidpointHandle>
) => {
  handles.forEach((handle) => {
    destroyEdgeMidpointHandle(handle);
  });
  handles.clear();
};

const hideEdgeMidpointHandle = (handle: EdgeMidpointHandle) => {
  handle.root.style.display = "none";
  handle.root.onclick = null;
  handle.root.onmouseenter = null;
  handle.root.onmouseleave = null;
  handle.tick.style.transform = "translate(-50%, -50%)";
  handle.tick.style.boxShadow = "none";
  handle.tick.style.filter = "none";
};

const setEdgeMidpointHandleHovered = (
  handle: EdgeMidpointHandle,
  hovered: boolean
) => {
  handle.tick.style.transform = hovered
    ? `translate(-50%, -50%) scale(${labelOverlayAffordanceDefaults.hover.scale})`
    : "translate(-50%, -50%)";
  handle.tick.style.boxShadow = hovered
    ? buildOverlayRingBoxShadowCss()
    : "none";
  handle.tick.style.filter = hovered ? buildOverlayHoverFilterCss() : "none";
};

const applyEdgeMidpointHandleLayout = ({
  handle,
  center,
  angleRad,
  zIndex,
  clickable,
  onClick,
}: {
  handle: EdgeMidpointHandle;
  center: CssPixelPosition;
  angleRad: number;
  zIndex: number;
  clickable: boolean;
  onClick?: (() => void) | null;
}) => {
  handle.root.style.left = `${center.x}px`;
  handle.root.style.top = `${center.y}px`;
  handle.root.style.width = `${measurementEdgeDefaults.midpointMarker.hitTargetPx}px`;
  handle.root.style.height = `${measurementEdgeDefaults.midpointMarker.hitTargetPx}px`;
  handle.root.style.transform = `translate(-50%, -50%) rotate(${angleRad}rad)`;
  handle.root.style.transformOrigin = "50% 50%";
  handle.root.style.zIndex = `${Math.max(
    zIndex,
    measurementEdgeDefaults.midpointMarker.minOverlayZIndex
  )}`;
  handle.root.style.display = "block";
  handle.root.style.pointerEvents = clickable ? "auto" : "none";
  handle.root.style.cursor = clickable ? "pointer" : "default";
  handle.root.onclick = clickable && onClick ? onClick : null;
  handle.root.onmouseenter = clickable
    ? () => {
        setEdgeMidpointHandleHovered(handle, true);
      }
    : null;
  handle.root.onmouseleave = clickable
    ? () => {
        setEdgeMidpointHandleHovered(handle, false);
      }
    : null;
  setEdgeMidpointHandleHovered(handle, false);
};

export const useMeasurementEdgesController = (
  scene: Scene | null,
  {
    edges,
    formatOptions,
    previewLineLabelVisualOptions,
    surfaceKey = "committed",
    activeMoveGizmoNodeId,
    blockEdgeInteractions,
    onMeasurementSelect,
    onEdgeClick,
    insertNodeTargetMeasurementIds = [],
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
  }: UseRuntimeMeasurementEdgesControllerArgs
) => {
  const sceneLineHandleByIdRef = useRef<Map<string, SceneLineHandle>>(
    new Map()
  );
  const distanceTriangleLabelHandleByIdRef = useRef<
    Map<string, DistanceTriangleLabelHandle>
  >(new Map());
  const edgeSegmentLabelHandleByIdRef = useRef<
    Map<string, EdgeSegmentLabelHandle>
  >(new Map());
  const distanceTriangleCornerHandleByIdRef = useRef<
    Map<string, DistanceTriangleCornerHandle>
  >(new Map());
  const edgeMidpointHandleByIdRef = useRef<Map<string, EdgeMidpointHandle>>(
    new Map()
  );
  const resolvedPreviewLineLabelVisualOptions = useMemo(
    () => resolvePreviewLineLabelVisualOptions(previewLineLabelVisualOptions),
    [previewLineLabelVisualOptions]
  );
  const insertNodeTargetMeasurementIdSet = useMemo(
    () => new Set(insertNodeTargetMeasurementIds),
    [insertNodeTargetMeasurementIds]
  );

  const edgeSegments = useMemo<readonly EdgeSegment[]>(
    () =>
      edges.flatMap((edge) => {
        const segments: EdgeSegment[] = [];
        const strokeWidth = Number.isFinite(edge.strokeWidth)
          ? edge.strokeWidth
          : measurementVisualDefaults.sizes.edgeStrokeWidth;
        const overlayDashPattern =
          edge.overlayDashPattern ??
          measurementVisualDefaults.patterns.edgeDashPattern;

        for (let index = 0; index < edge.coordinates.length - 1; index += 1) {
          const startCoordinate = edge.coordinates[index];
          const endCoordinate = edge.coordinates[index + 1];

          if (!startCoordinate || !endCoordinate) {
            continue;
          }

          const startNodeId = edge.nodeIds?.[index];
          const endNodeId =
            edge.nodeIds?.[index + 1] ??
            (edge.nodeIds &&
            edge.coordinates.length === edge.nodeIds.length + 1 &&
            index === edge.nodeIds.length - 1
              ? edge.nodeIds[0]
              : undefined);

          segments.push({
            id: `${edge.id}-${index}`,
            measurementId: edge.measurementId,
            startNodeId,
            endNodeId,
            startCoordinate,
            endCoordinate,
            stroke: edge.stroke,
            strokeWidth,
            overlayDashPattern,
            ...(edge.overlayDashed || edge.dashed
              ? { overlayDashed: true as const }
              : {}),
            ...(edge.showSegmentLengthLabels
              ? { showSegmentLengthLabels: true as const }
              : {}),
            distanceTriangleOverlay:
              index === 0 ? edge.distanceTriangleOverlay : undefined,
          });
        }

        return segments;
      }),
    [edges]
  );

  const insertNodeTargetSegments = useMemo(
    () =>
      edgeSegments.filter(
        (edge) =>
          edge.measurementId !== undefined &&
          insertNodeTargetMeasurementIdSet.has(edge.measurementId) &&
          edge.startNodeId !== undefined &&
          edge.endNodeId !== undefined
      ),
    [edgeSegments, insertNodeTargetMeasurementIdSet]
  );

  const sceneLines = useMemo<readonly EdgeSceneLine[]>(
    () =>
      edgeSegments.flatMap((edge) => {
        const directLine: EdgeSceneLine = {
          id: edge.id,
          start: cartesian3FromGeographicCoordinate(edge.startCoordinate),
          end: cartesian3FromGeographicCoordinate(edge.endCoordinate),
          stroke: edge.stroke,
          strokeWidth: edge.strokeWidth,
        };

        if (!scene || scene.isDestroyed() || !edge.distanceTriangleOverlay) {
          return [directLine];
        }

        const componentScratch = createPreviewSegmentScratch();
        const screenData = resolveDistanceTriangleOverlayScreenData({
          scene,
          edge,
          scratch: componentScratch,
          formatOptions,
        });
        if (!screenData) {
          return [directLine];
        }

        const componentLines: EdgeSceneLine[] = [];

        if (screenData.showVerticalLabel && screenData.verticalLabelText) {
          componentLines.push({
            id: `${edge.id}-vertical`,
            start: screenData.anchorPointECEF,
            end: screenData.auxiliaryPointECEF,
            stroke: previewControllerDefaults.verticalLineColor,
            strokeWidth: edge.strokeWidth,
          });
        }

        if (screenData.showHorizontalLabel && screenData.horizontalLabelText) {
          componentLines.push({
            id: `${edge.id}-horizontal`,
            start: screenData.auxiliaryPointECEF,
            end: screenData.targetPointECEF,
            stroke: previewControllerDefaults.horizontalLineColor,
            strokeWidth: edge.strokeWidth,
          });
        }

        return [directLine, ...componentLines];
      }),
    [edgeSegments, formatOptions, scene]
  );

  const overlayLines = useMemo<readonly LineVisualizerData[]>(
    () =>
      edgeSegments.flatMap((edge) => {
        const referenceEdgeClickHandler =
          activeMoveGizmoNodeId &&
          edge.startNodeId &&
          edge.endNodeId &&
          onEdgeClick
            ? () => onEdgeClick(edge.startNodeId!, edge.endNodeId!)
            : undefined;
        const selectionEdgeClickHandler =
          !blockEdgeInteractions &&
          onMeasurementSelect &&
          edge.distanceTriangleOverlay?.measurementId
            ? () =>
                onMeasurementSelect(
                  edge.distanceTriangleOverlay!.measurementId!
                )
            : undefined;
        const lineClickHandler =
          referenceEdgeClickHandler ?? selectionEdgeClickHandler;
        const baseLines = createSvgLineVisualizers({
          id: `${surfaceKey}-runtime-edge-overlay-${edge.id}`,
          getSvgLine: () => {
            if (!scene || scene.isDestroyed()) {
              return null;
            }

            const start = SceneTransforms.worldToWindowCoordinates(
              scene,
              cartesian3FromGeographicCoordinate(edge.startCoordinate)
            );
            const end = SceneTransforms.worldToWindowCoordinates(
              scene,
              cartesian3FromGeographicCoordinate(edge.endCoordinate)
            );
            if (!defined(start) || !defined(end)) {
              return null;
            }

            return {
              start: toCssPixelPosition(start.x, start.y),
              end: toCssPixelPosition(end.x, end.y),
            };
          },
          stroke: edge.stroke,
          strokeWidth: edge.strokeWidth,
          dashed: edge.overlayDashed,
          dashPattern: edge.overlayDashPattern,
          hitTargetStrokeWidth: 10,
          onLineClick: lineClickHandler,
        });

        if (!edge.distanceTriangleOverlay || !scene || scene.isDestroyed()) {
          return baseLines;
        }

        const componentScratch = createPreviewSegmentScratch();
        const getScreenData = () =>
          resolveDistanceTriangleOverlayScreenData({
            scene,
            edge,
            scratch: componentScratch,
            formatOptions,
          });

        return [
          ...baseLines,
          ...createSvgLineVisualizers({
            id: `${surfaceKey}-runtime-edge-overlay-${edge.id}-vertical`,
            getSvgLine: () => {
              const screenData = getScreenData();
              if (!screenData || !screenData.verticalLabelText) {
                return null;
              }

              return {
                start: screenData.anchorScreenPosition,
                end: screenData.auxiliaryScreenPosition,
              };
            },
            stroke: previewControllerDefaults.verticalLineColor,
            strokeWidth: edge.strokeWidth,
            dashed: true,
            dashPattern: edge.overlayDashPattern,
            hitTargetStrokeWidth: 8,
            onLineClick: lineClickHandler,
          }),
          ...createSvgLineVisualizers({
            id: `${surfaceKey}-runtime-edge-overlay-${edge.id}-horizontal`,
            getSvgLine: () => {
              const screenData = getScreenData();
              if (!screenData || !screenData.horizontalLabelText) {
                return null;
              }

              return {
                start: screenData.auxiliaryScreenPosition,
                end: screenData.targetScreenPosition,
              };
            },
            stroke: previewControllerDefaults.horizontalLineColor,
            strokeWidth: edge.strokeWidth,
            dashed: true,
            dashPattern: edge.overlayDashPattern,
            hitTargetStrokeWidth: 8,
            onLineClick: lineClickHandler,
          }),
        ];
      }),
    [
      activeMoveGizmoNodeId,
      blockEdgeInteractions,
      edgeSegments,
      formatOptions,
      onEdgeClick,
      onMeasurementSelect,
      scene,
      surfaceKey,
    ]
  );

  useLineVisualizers([...overlayLines], overlayLines.length > 0);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      return;
    }

    const reconcileSceneLines = (lines: readonly EdgeSceneLine[]) => {
      const nextIds = new Set(lines.map((line) => line.id));

      sceneLineHandleByIdRef.current.forEach((handle, id) => {
        if (nextIds.has(id)) {
          return;
        }

        handle.destroy();
        sceneLineHandleByIdRef.current.delete(id);
      });

      lines.forEach((line) => {
        const nextSignature = buildSceneLineSignature(line);
        const existingHandle = sceneLineHandleByIdRef.current.get(line.id);
        if (existingHandle?.signature === nextSignature) {
          return;
        }

        existingHandle?.destroy();
        sceneLineHandleByIdRef.current.set(
          line.id,
          createSceneLineHandle(scene, line)
        );
      });

      scene.requestRender();
    };

    reconcileSceneLines(sceneLines);

    return () => {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [scene, sceneLines]);

  useEffect(() => {
    destroyEdgeMidpointHandles(edgeMidpointHandleByIdRef.current);

    if (
      !scene ||
      scene.isDestroyed() ||
      blockEdgeInteractions ||
      activeMoveGizmoNodeId !== null ||
      insertNodeTargetSegments.length === 0
    ) {
      return;
    }

    const overlayLayer = createPreviewOverlayLayers(scene, {
      [PREVIEW_OVERLAY_GROUP.VISUALIZER]: `${resolveDistanceTriangleLabelLayerId(
        surfaceKey
      )}-midpoint-targets`,
    })[PREVIEW_OVERLAY_GROUP.VISUALIZER];
    if (!overlayLayer) {
      return;
    }

    insertNodeTargetSegments.forEach((edge) => {
      edgeMidpointHandleByIdRef.current.set(
        edge.id,
        createEdgeMidpointHandle(overlayLayer)
      );
    });

    const updateEdgeMidpointHandles = () => {
      insertNodeTargetSegments.forEach((edge) => {
        const handle = edgeMidpointHandleByIdRef.current.get(edge.id);
        if (!handle) {
          return;
        }

        const startWorld = cartesian3FromGeographicCoordinate(
          edge.startCoordinate
        );
        const endWorld = cartesian3FromGeographicCoordinate(edge.endCoordinate);
        const startScreen = SceneTransforms.worldToWindowCoordinates(
          scene,
          startWorld
        );
        const endScreen = SceneTransforms.worldToWindowCoordinates(
          scene,
          endWorld
        );
        const midpointScreen = SceneTransforms.worldToWindowCoordinates(
          scene,
          Cartesian3.midpoint(startWorld, endWorld, new Cartesian3())
        );

        if (
          !defined(startScreen) ||
          !defined(endScreen) ||
          !defined(midpointScreen) ||
          !edge.measurementId ||
          !edge.startNodeId ||
          !edge.endNodeId
        ) {
          hideEdgeMidpointHandle(handle);
          return;
        }

        applyEdgeMidpointHandleLayout({
          handle,
          center: toCssPixelPosition(midpointScreen.x, midpointScreen.y),
          angleRad:
            Math.atan2(
              endScreen.y - startScreen.y,
              endScreen.x - startScreen.x
            ) +
            Math.PI / 2,
          zIndex: resolveOverlayZIndexBetweenWorldPositions(
            scene,
            startWorld,
            endWorld
          ),
          clickable: Boolean(onInsertNodeTargetClick),
          onClick: onInsertNodeTargetClick
            ? () =>
                onInsertNodeTargetClick(
                  edge.measurementId!,
                  edge.startNodeId!,
                  edge.endNodeId!
                )
            : undefined,
        });
      });
    };

    updateEdgeMidpointHandles();
    const removePostRenderListener = scene.postRender.addEventListener(() => {
      updateEdgeMidpointHandles();
    });
    scene.requestRender();

    return () => {
      removePostRenderListener?.();
      destroyEdgeMidpointHandles(edgeMidpointHandleByIdRef.current);
      destroyPreviewOverlayLayer(overlayLayer);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [
    activeMoveGizmoNodeId,
    blockEdgeInteractions,
    insertNodeTargetSegments,
    onInsertNodeTargetClick,
    scene,
    surfaceKey,
  ]);

  useEffect(() => {
    destroyDistanceTriangleLabelHandles(
      distanceTriangleLabelHandleByIdRef.current
    );
    destroyEdgeSegmentLabelHandles(edgeSegmentLabelHandleByIdRef.current);
    destroyDistanceTriangleCornerHandles(
      distanceTriangleCornerHandleByIdRef.current
    );

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const distanceTriangleEdges = edgeSegments.filter(
      (edge) => edge.distanceTriangleOverlay !== undefined
    );
    const edgeSegmentLabelEdges = edgeSegments.filter(
      (edge) => edge.showSegmentLengthLabels === true
    );
    if (
      distanceTriangleEdges.length === 0 &&
      edgeSegmentLabelEdges.length === 0
    ) {
      return;
    }

    const {
      [PREVIEW_OVERLAY_GROUP.LABEL]: labelOverlayLayer,
      [PREVIEW_OVERLAY_GROUP.VISUALIZER]: visualizerOverlayLayer,
    } = createPreviewOverlayLayers(scene, {
      [PREVIEW_OVERLAY_GROUP.LABEL]:
        resolveDistanceTriangleLabelLayerId(surfaceKey),
      [PREVIEW_OVERLAY_GROUP.VISUALIZER]: `${resolveDistanceTriangleLabelLayerId(
        surfaceKey
      )}-visualizer`,
    });
    if (!labelOverlayLayer || !visualizerOverlayLayer) {
      return;
    }

    const reconcileLabelHandles = () => {
      const nextIds = new Set([
        ...distanceTriangleEdges.map((edge) => edge.id),
        ...edgeSegmentLabelEdges.map((edge) => edge.id),
      ]);

      distanceTriangleLabelHandleByIdRef.current.forEach((handle, id) => {
        if (nextIds.has(id)) {
          return;
        }

        destroyDistanceTriangleLabelHandle(handle);
        distanceTriangleLabelHandleByIdRef.current.delete(id);
        const cornerHandle =
          distanceTriangleCornerHandleByIdRef.current.get(id);
        if (cornerHandle) {
          destroyDistanceTriangleCornerHandle(cornerHandle);
          distanceTriangleCornerHandleByIdRef.current.delete(id);
        }
      });

      distanceTriangleEdges.forEach((edge) => {
        if (distanceTriangleLabelHandleByIdRef.current.has(edge.id)) {
          return;
        }

        distanceTriangleLabelHandleByIdRef.current.set(
          edge.id,
          createDistanceTriangleLabelHandle(
            labelOverlayLayer,
            resolvedPreviewLineLabelVisualOptions
          )
        );
        distanceTriangleCornerHandleByIdRef.current.set(
          edge.id,
          createDistanceTriangleCornerHandle(visualizerOverlayLayer)
        );
      });
      edgeSegmentLabelHandleByIdRef.current.forEach((handle, id) => {
        if (nextIds.has(id)) {
          return;
        }

        destroyEdgeSegmentLabelHandle(handle);
        edgeSegmentLabelHandleByIdRef.current.delete(id);
      });
      edgeSegmentLabelEdges.forEach((edge) => {
        if (edgeSegmentLabelHandleByIdRef.current.has(edge.id)) {
          return;
        }

        edgeSegmentLabelHandleByIdRef.current.set(
          edge.id,
          createEdgeSegmentLabelHandle(
            labelOverlayLayer,
            resolvedPreviewLineLabelVisualOptions
          )
        );
      });
    };

    let previousSceneSnapshot: OverlayVisibilitySceneSnapshot | null = null;

    const updateEdgeLabels = ({
      force = false,
    }: {
      force?: boolean;
    } = {}) => {
      const nextSceneSnapshot = captureOverlayVisibilitySceneSnapshot(scene);
      if (
        !force &&
        areOverlayVisibilitySceneSnapshotsEqual(
          previousSceneSnapshot,
          nextSceneSnapshot
        )
      ) {
        return;
      }

      previousSceneSnapshot = nextSceneSnapshot;
      const occupiedPointLabelRects = resolveVisiblePointLabelRects(scene);
      const secondaryLineLabelCandidates: SecondaryLineLabelConflictCandidate[] =
        [];

      distanceTriangleEdges.forEach((edge) => {
        const labelHandle = distanceTriangleLabelHandleByIdRef.current.get(
          edge.id
        );
        if (!labelHandle) {
          return;
        }

        const screenData = resolveDistanceTriangleOverlayScreenData({
          scene,
          edge,
          scratch: labelHandle.scratch,
          previousVerticalOutsideSign: labelHandle.previousVerticalOutsideSign,
          formatOptions,
        });
        if (!screenData) {
          hideLineLabels(labelHandle.lineLabels);
          const cornerHandle = distanceTriangleCornerHandleByIdRef.current.get(
            edge.id
          );
          if (cornerHandle) {
            hideDistanceTriangleCornerHandle(cornerHandle);
          }
          labelHandle.previousVerticalOutsideSign = undefined;
          return;
        }

        labelHandle.previousVerticalOutsideSign =
          screenData.nextVerticalOutsideSign;

        const directOverlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
          scene,
          screenData.anchorPointECEF,
          screenData.targetPointECEF
        );
        const verticalOverlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
          scene,
          screenData.anchorPointECEF,
          screenData.auxiliaryPointECEF
        );
        const horizontalOverlayZIndex =
          resolveOverlayZIndexBetweenWorldPositions(
            scene,
            screenData.auxiliaryPointECEF,
            screenData.targetPointECEF
          );
        const cornerOverlayZIndex = resolveOverlayZIndexAtWorldPosition(
          scene,
          screenData.auxiliaryPointECEF
        );
        const measurementId = resolveDistanceTriangleMeasurementId(edge);
        const directLengthMeters = Cartesian3.distance(
          screenData.anchorPointECEF,
          screenData.targetPointECEF
        );
        const verticalLengthMeters = Cartesian3.distance(
          screenData.anchorPointECEF,
          screenData.auxiliaryPointECEF
        );
        const horizontalLengthMeters = Cartesian3.distance(
          screenData.auxiliaryPointECEF,
          screenData.targetPointECEF
        );

        labelHandle.lineLabels.direct.style.zIndex = `${directOverlayZIndex}`;
        secondaryLineLabelCandidates.push({
          element: labelHandle.lineLabels.direct,
          zIndex: directOverlayZIndex,
          measurementId,
          metricValueMeters: directLengthMeters,
          text: screenData.directLabelText,
          start: screenData.anchorScreenPosition,
          end: screenData.targetScreenPosition,
          outsideReferencePoint: screenData.directOutsideReferencePoint,
        });

        if (screenData.showVerticalLabel && screenData.verticalLabelText) {
          labelHandle.lineLabels.vertical.style.zIndex = `${verticalOverlayZIndex}`;
          secondaryLineLabelCandidates.push({
            element: labelHandle.lineLabels.vertical,
            zIndex: verticalOverlayZIndex,
            measurementId,
            metricValueMeters: verticalLengthMeters,
            text: screenData.verticalLabelText,
            start: screenData.anchorScreenPosition,
            end: screenData.auxiliaryScreenPosition,
            outsideReferencePoint: screenData.verticalOutsideReferencePoint,
            flipReadingDirection: true,
          });
        } else {
          labelHandle.lineLabels.vertical.style.display = "none";
        }

        if (screenData.showHorizontalLabel && screenData.horizontalLabelText) {
          labelHandle.lineLabels.horizontal.style.zIndex = `${horizontalOverlayZIndex}`;
          secondaryLineLabelCandidates.push({
            element: labelHandle.lineLabels.horizontal,
            zIndex: horizontalOverlayZIndex,
            measurementId,
            metricValueMeters: horizontalLengthMeters,
            text: screenData.horizontalLabelText,
            start: screenData.auxiliaryScreenPosition,
            end: screenData.targetScreenPosition,
            outsideReferencePoint: screenData.horizontalOutsideReferencePoint,
          });
        } else {
          labelHandle.lineLabels.horizontal.style.display = "none";
        }

        const cornerHandle = distanceTriangleCornerHandleByIdRef.current.get(
          edge.id
        );
        if (!cornerHandle) {
          return;
        }
        cornerHandle.root.style.zIndex = `${cornerOverlayZIndex}`;

        if (
          verticalLengthMeters <=
            distanceVisualizationDefaults.referenceLineEpsilonMeters ||
          horizontalLengthMeters <=
            distanceVisualizationDefaults.referenceLineEpsilonMeters
        ) {
          if (
            directLengthMeters <=
            distanceVisualizationDefaults.referenceLineEpsilonMeters
          ) {
            hideDistanceTriangleCornerHandle(cornerHandle);
            return;
          }

          const straightCenter = toCssPixelPosition(
            (screenData.anchorScreenPosition.x +
              screenData.targetScreenPosition.x) /
              2,
            (screenData.anchorScreenPosition.y +
              screenData.targetScreenPosition.y) /
              2
          );
          applyDistanceTriangleStraightCornerHandleLayout({
            handle: cornerHandle,
            center: straightCenter,
            clickable:
              !blockEdgeInteractions &&
              activeMoveGizmoNodeId === null &&
              Boolean(onDistanceTriangleCornerClick),
            onClick: onDistanceTriangleCornerClick
              ? () =>
                  onDistanceTriangleCornerClick(
                    resolveDistanceTriangleMeasurementId(edge)
                  )
              : undefined,
          });
          return;
        }

        const drawingBufferWidth = scene.drawingBufferWidth;
        const drawingBufferHeight = scene.drawingBufferHeight;
        if (drawingBufferWidth <= 0 || drawingBufferHeight <= 0) {
          hideDistanceTriangleCornerHandle(cornerHandle);
          return;
        }

        let metersPerPixel = Number.NaN;
        try {
          metersPerPixel = scene.camera.getPixelSize(
            new BoundingSphere(screenData.auxiliaryPointECEF, 1),
            drawingBufferWidth,
            drawingBufferHeight
          );
        } catch {
          metersPerPixel = Number.NaN;
        }

        if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
          const cameraDistanceMeters = Math.max(
            Cartesian3.distance(
              scene.camera.position,
              screenData.auxiliaryPointECEF
            ),
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

        const arcPointsWorld = getArcPointsInSpannedPlane(
          screenData.auxiliaryPointECEF,
          screenData.anchorPointECEF,
          screenData.targetPointECEF,
          distanceTriangleVisualDefaults.cornerOverlay.targetRadiusPx *
            metersPerPixel,
          distanceTriangleVisualDefaults.cornerOverlay.segments
        );
        if (!arcPointsWorld || arcPointsWorld.length < 2) {
          hideDistanceTriangleCornerHandle(cornerHandle);
          return;
        }

        const arcMidpointWorld =
          arcPointsWorld[Math.floor(arcPointsWorld.length / 2)];
        if (!arcMidpointWorld) {
          hideDistanceTriangleCornerHandle(cornerHandle);
          return;
        }

        const dotWorld = Cartesian3.midpoint(
          screenData.auxiliaryPointECEF,
          arcMidpointWorld,
          new Cartesian3()
        );
        const dotScreen = SceneTransforms.worldToWindowCoordinates(
          scene,
          dotWorld
        );
        if (!defined(dotScreen)) {
          hideDistanceTriangleCornerHandle(cornerHandle);
          return;
        }

        const arcPointsScreen = arcPointsWorld
          .map((worldPoint) =>
            SceneTransforms.worldToWindowCoordinates(scene, worldPoint)
          )
          .filter(defined);
        if (arcPointsScreen.length < 2) {
          hideDistanceTriangleCornerHandle(cornerHandle);
          return;
        }

        const minX = Math.min(...arcPointsScreen.map((point) => point.x));
        const maxX = Math.max(...arcPointsScreen.map((point) => point.x));
        const minY = Math.min(...arcPointsScreen.map((point) => point.y));
        const maxY = Math.max(...arcPointsScreen.map((point) => point.y));
        const width = Math.max(
          distanceTriangleVisualDefaults.cornerOverlay.minBoxPx,
          maxX -
            minX +
            distanceTriangleVisualDefaults.cornerOverlay.paddingPx * 2
        );
        const height = Math.max(
          distanceTriangleVisualDefaults.cornerOverlay.minBoxPx,
          maxY -
            minY +
            distanceTriangleVisualDefaults.cornerOverlay.paddingPx * 2
        );
        const pathData = arcPointsScreen
          .map((point, index) => {
            const x =
              point.x -
              minX +
              distanceTriangleVisualDefaults.cornerOverlay.paddingPx;
            const y =
              point.y -
              minY +
              distanceTriangleVisualDefaults.cornerOverlay.paddingPx;
            return `${index === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ");
        const onClick = onDistanceTriangleCornerClick
          ? () =>
              onDistanceTriangleCornerClick(
                resolveDistanceTriangleMeasurementId(edge)
              )
          : undefined;
        const cornerHandleClickable =
          !blockEdgeInteractions &&
          activeMoveGizmoNodeId === null &&
          Boolean(onDistanceTriangleCornerClick);

        applyDistanceTriangleCornerHandleLayout({
          handle: cornerHandle,
          pathData,
          dotScreen: toCssPixelPosition(dotScreen.x, dotScreen.y),
          minX,
          minY,
          width,
          height,
          clickable: cornerHandleClickable,
          onClick,
        });
      });

      edgeSegmentLabelEdges.forEach((edge) => {
        const labelHandle = edgeSegmentLabelHandleByIdRef.current.get(edge.id);
        if (!labelHandle) {
          return;
        }

        const startPointECEF = cartesian3FromGeographicCoordinate(
          edge.startCoordinate
        );
        const endPointECEF = cartesian3FromGeographicCoordinate(
          edge.endCoordinate
        );
        const startScreenPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          startPointECEF
        );
        const endScreenPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          endPointECEF
        );
        const segmentLengthMeters = Cartesian3.distance(
          startPointECEF,
          endPointECEF
        );

        if (
          !defined(startScreenPosition) ||
          !defined(endScreenPosition) ||
          segmentLengthMeters <=
            distanceVisualizationDefaults.referenceLineEpsilonMeters
        ) {
          labelHandle.element.style.display = "none";
          return;
        }

        const overlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
          scene,
          startPointECEF,
          endPointECEF
        );
        labelHandle.element.style.zIndex = `${overlayZIndex}`;
        secondaryLineLabelCandidates.push({
          element: labelHandle.element,
          zIndex: overlayZIndex,
          measurementId: edge.measurementId ?? edge.id,
          metricValueMeters: segmentLengthMeters,
          text: formatLengthMeters(
            segmentLengthMeters,
            formatOptions.lengthMeters
          ),
          start: toCssPixelPosition(
            startScreenPosition.x,
            startScreenPosition.y
          ),
          end: toCssPixelPosition(endScreenPosition.x, endScreenPosition.y),
        });
      });

      reconcileSecondaryLineLabelVisibility({
        candidates: secondaryLineLabelCandidates,
        occupiedLabelRects: occupiedPointLabelRects,
        allowEarlyRemoval:
          resolvedPreviewLineLabelVisualOptions.allowEarlyRemoval,
        collisionResolutionStrategy:
          resolvedPreviewLineLabelVisualOptions.collisionResolutionStrategy,
        anchorSlideStepRatio:
          resolvedPreviewLineLabelVisualOptions.anchorSlideStepRatio,
        maxAnchorSlideDeltaRatio:
          resolvedPreviewLineLabelVisualOptions.maxAnchorSlideDeltaRatio,
      });
    };

    reconcileLabelHandles();
    updateEdgeLabels({
      force: true,
    });
    const removePostRenderListener = scene.postRender.addEventListener(() => {
      updateEdgeLabels();
    });
    scene.requestRender();

    return () => {
      removePostRenderListener?.();
      destroyDistanceTriangleLabelHandles(
        distanceTriangleLabelHandleByIdRef.current
      );
      destroyEdgeSegmentLabelHandles(edgeSegmentLabelHandleByIdRef.current);
      destroyDistanceTriangleCornerHandles(
        distanceTriangleCornerHandleByIdRef.current
      );
      destroyPreviewOverlayLayer(labelOverlayLayer);
      destroyPreviewOverlayLayer(visualizerOverlayLayer);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [
    activeMoveGizmoNodeId,
    blockEdgeInteractions,
    edgeSegments,
    edgeSegmentLabelHandleByIdRef,
    formatOptions,
    onDistanceTriangleCornerClick,
    resolvedPreviewLineLabelVisualOptions,
    scene,
    surfaceKey,
  ]);
};
