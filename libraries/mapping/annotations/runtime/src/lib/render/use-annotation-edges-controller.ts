import { useEffect, useMemo, useRef } from "react";

import { createSvgLineVisualizers } from "@carma-commons/svg";
import {
  buildDistanceTriangleLineLabelReferences,
  type DistanceTriangleLineLabelOutsideSigns,
  distanceVisualizationDefaults,
  getAnnotationSurfaceAccentCssColor,
} from "@carma-mapping/annotations/core";
import {
  cartesian3FromGeographicCoordinate,
  getArcPointsInSpannedPlane,
  isValidScene,
  registerCesiumSceneDragSampleExclusionResolver,
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
  ANNOTATION_OVERLAY_GROUP,
  buildAuxiliaryPoint,
  createAnnotationOverlayLayers,
  createLineLabel,
  createAnnotationGeometryScratch,
  createSegmentLineLabels,
  destroyAnnotationOverlayLayer,
  hideLineLabels,
  annotationOverlayDefaults,
  resolveAnnotationOverlayContainer,
  resolveDistanceTriangleComponentLabelVisibility,
  type AuthoringSegmentLineLabels,
  type AnnotationGeometryScratch,
} from "../interaction/authoring-visual-runtime";
import {
  RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE,
  resolveRuntimeOverlayDistanceZIndex,
  type RuntimeDistanceTriangleOverlayRenderModel,
  type RuntimeEdgeRenderModel,
} from "./annotation-render-models";
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
  resolveAnnotationLineLabelOptions,
  type PartialAnnotationLineLabelOptions,
  type AnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import { annotationVisualDefaults } from "../config/annotation-visual-defaults";
import { shouldExcludeAnnotationSceneLineFromDragSample } from "./annotation-edge-drag-sample-exclusions";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";

type UseRuntimeAnnotationEdgesControllerArgs = {
  edges: readonly RuntimeEdgeRenderModel[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions?: PartialAnnotationLineLabelOptions;
  surfaceKey?: string;
  activeEditedNodeId: string | null;
  blockEdgeInteractions: boolean;
  onAnnotationSelect?: (annotationId: string) => void;
  onEdgeClick?: (startNodeId: string, endNodeId: string) => boolean;
  insertNodeTargetAnnotationIds?: readonly string[];
  onInsertNodeTargetClick?: (
    annotationId: string,
    startNodeId: string,
    endNodeId: string
  ) => boolean;
  onDistanceTriangleCornerClick?: (annotationId: string) => void;
  liveAnchors: LiveAnnotationAnchors;
};

type EdgeSceneLine = {
  id: string;
  start: Cartesian3;
  end: Cartesian3;
  stroke: string;
  strokeWidth: number;
  // Node ids of the endpoints, when this line maps directly to a node-to-node
  // segment. Lets the preRender patch override endpoints from live drag anchors
  // so the polyline tracks the gizmo in the same frame.
  startNodeId?: string;
  endNodeId?: string;
  // Re-derive both endpoints from the live drag anchors. Used by distance-
  // triangle component (height-leg) lines whose geometry depends on both edge
  // endpoints (anchor/auxiliary/target), not a single node. Returns null when no
  // relevant anchor is overridden, so the base geometry is kept.
  recompute?: (
    liveAnchors: LiveAnnotationAnchors
  ) => readonly [Cartesian3, Cartesian3] | null;
};

type EdgeSegment = {
  id: string;
  annotationId?: string;
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

const resolveDistanceTriangleAnnotationId = (edge: EdgeSegment) =>
  edge.distanceTriangleOverlay?.annotationId ?? edge.id;

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

const annotationEdgeMidpointMarkerDefaults = Object.freeze({
  ...resolveOverlayMidpointTickMetrics({
    markerDiameterPx: annotationVisualDefaults.sizes.pointPixelSize,
    markerStrokeWidthPx: annotationVisualDefaults.sizes.pointOutlineWidth,
  }),
  tickColor: labelOverlayAffordanceDefaults.colors.surfaceStrong,
  minOverlayZIndex: labelOverlayLayerDefaults.zIndex.interactionHandleFloor,
});

const annotationEdgeDefaults = Object.freeze({
  pointLabelCollisionSelector:
    '[data-pillbutton-root="true"], [data-point-label-content-root="true"]',
  svgNamespace: "http://www.w3.org/2000/svg",
  distanceTriangle: Object.freeze({
    cornerDotRadiusPx: 1.25 / 2,
  }),
  midpointMarker: annotationEdgeMidpointMarkerDefaults,
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
  const container = resolveAnnotationOverlayContainer(scene);
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      annotationEdgeDefaults.pointLabelCollisionSelector
    )
  )
    .map((element) => toLayoutRect(element.getBoundingClientRect()))
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
};

type ScenePolyline = ReturnType<PolylineCollection["add"]>;

type SceneLineHandle = {
  signature: string;
  collection: PolylineCollection;
  // The single polyline in `collection`, kept for in-place position patching.
  polyline: ScenePolyline;
  // Endpoint node ids + the React-fed base positions, so the preRender patch can
  // swap to live drag anchors and restore the base when the drag clears.
  startNodeId?: string;
  endNodeId?: string;
  baseStart: Cartesian3;
  baseEnd: Cartesian3;
  recompute?: (
    liveAnchors: LiveAnnotationAnchors
  ) => readonly [Cartesian3, Cartesian3] | null;
  overridden: boolean;
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
  nextOutsideSigns: DistanceTriangleLineLabelOutsideSigns | undefined;
};

type DistanceTriangleLabelHandle = {
  lineLabels: AuthoringSegmentLineLabels;
  scratch: AnnotationGeometryScratch;
  previousOutsideSigns?: DistanceTriangleLineLabelOutsideSigns;
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

  const polyline = collection.add({
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
    polyline,
    startNodeId: line.startNodeId,
    endNodeId: line.endNodeId,
    baseStart: line.start,
    baseEnd: line.end,
    recompute: line.recompute,
    overridden: false,
    destroy,
  };
};

const destroySceneLineHandles = (handles: Map<string, SceneLineHandle>) => {
  handles.forEach((handle) => {
    handle.destroy();
  });
  handles.clear();
};

// Patch polyline endpoints from the shared live-drag anchors so the lines track
// the gizmo in the same frame, bypassing the React rebuild. Runs in preRender
// (before the draw). Restores the React-fed base positions once an anchor
// clears. Cheap no-op when nothing is/was overridden.
const applyLiveAnchorsToSceneLines = (
  handles: Map<string, SceneLineHandle>,
  liveAnchors: LiveAnnotationAnchors
) => {
  const hasAnchors = liveAnchors.size > 0;
  handles.forEach((handle) => {
    let nextPositions: readonly [Cartesian3, Cartesian3] | null = null;
    if (handle.recompute) {
      // Component (height-leg) lines re-derive both endpoints from the live edge.
      nextPositions = hasAnchors ? handle.recompute(liveAnchors) : null;
    } else {
      const liveStart = handle.startNodeId
        ? (liveAnchors.get(handle.startNodeId) as Cartesian3 | undefined)
        : undefined;
      const liveEnd = handle.endNodeId
        ? (liveAnchors.get(handle.endNodeId) as Cartesian3 | undefined)
        : undefined;
      if (liveStart !== undefined || liveEnd !== undefined) {
        nextPositions = [
          liveStart ?? handle.baseStart,
          liveEnd ?? handle.baseEnd,
        ];
      }
    }
    if (nextPositions === null && !handle.overridden) {
      return;
    }
    handle.polyline.positions = nextPositions
      ? [nextPositions[0], nextPositions[1]]
      : [handle.baseStart, handle.baseEnd];
    handle.overridden = nextPositions !== null && hasAnchors;
  });
};

// Resolve an edge endpoint to ECEF, preferring the live drag anchor for its node
// over the React-fed coordinate, so the SVG overlay lines and every label track
// the drag in the same frame (the Cesium 3D polylines are patched separately in
// preRender). Returns a fresh Cartesian3 so callers may mutate it.
const resolveEdgePointECEF = (
  liveAnchors: LiveAnnotationAnchors,
  nodeId: string | undefined,
  coordinate: Parameters<typeof cartesian3FromGeographicCoordinate>[0]
): Cartesian3 => {
  const liveAnchor = nodeId
    ? (liveAnchors.get(nodeId) as Cartesian3 | undefined)
    : undefined;
  return liveAnchor
    ? Cartesian3.clone(liveAnchor, new Cartesian3())
    : cartesian3FromGeographicCoordinate(coordinate);
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

const edgeSegmentHasLiveAnchor = (
  edge: EdgeSegment,
  liveAnchors: LiveAnnotationAnchors
): boolean =>
  (edge.startNodeId !== undefined &&
    liveAnchors.get(edge.startNodeId) !== undefined) ||
  (edge.endNodeId !== undefined &&
    liveAnchors.get(edge.endNodeId) !== undefined);

// ECEF anchor/auxiliary/target points of a distance-triangle, re-derived from
// the live drag anchors. The component (height-leg) scene lines use this to track
// a dragged node every frame in preRender, without the React rebuild. Returns
// fresh Cartesian3s the caller may keep.
const resolveDistanceTriangleComponentEndpointsECEF = (
  scene: Scene,
  edge: EdgeSegment,
  liveAnchors: LiveAnnotationAnchors,
  scratch: AnnotationGeometryScratch
): {
  anchorECEF: Cartesian3;
  auxiliaryECEF: Cartesian3;
  targetECEF: Cartesian3;
} | null => {
  const overlay = edge.distanceTriangleOverlay;
  if (!overlay || !edge.startCoordinate || !edge.endCoordinate) {
    return null;
  }
  const startECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.startNodeId,
    edge.startCoordinate
  );
  const endECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.endNodeId,
    edge.endCoordinate
  );
  const anchorIsStart = resolveDistanceTriangleAnchorSelection({ overlay });
  const anchorECEF = anchorIsStart ? startECEF : endECEF;
  const targetECEF = anchorIsStart ? endECEF : startECEF;
  const auxiliaryECEF = buildAuxiliaryPoint({
    scene,
    anchorPointECEF: anchorECEF,
    targetPointECEF: targetECEF,
    scratch,
  });
  if (!auxiliaryECEF) {
    return null;
  }
  return {
    anchorECEF,
    auxiliaryECEF: Cartesian3.clone(auxiliaryECEF, new Cartesian3()),
    targetECEF,
  };
};

const resolveDistanceTriangleOverlayScreenData = ({
  scene,
  edge,
  scratch,
  previousOutsideSigns,
  formatOptions,
  liveAnchors,
}: {
  scene: Scene;
  edge: EdgeSegment;
  scratch: AnnotationGeometryScratch;
  previousOutsideSigns?: DistanceTriangleLineLabelOutsideSigns;
  formatOptions: AnnotationsRuntimeFormatOptions;
  liveAnchors: LiveAnnotationAnchors;
}): DistanceTriangleOverlayScreenData | null => {
  const overlay = edge.distanceTriangleOverlay;
  if (!overlay || !edge.startCoordinate || !edge.endCoordinate) {
    return null;
  }

  const startPointECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.startNodeId,
    edge.startCoordinate
  );
  const endPointECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.endNodeId,
    edge.endCoordinate
  );
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
  const labelReferences = buildDistanceTriangleLineLabelReferences({
    anchor: anchorScreenPosition,
    target: targetScreenPosition,
    aux: auxiliaryScreenPosition,
    anchorAltitudeMeters: anchorCoordinate.altitude,
    targetAltitudeMeters: targetCoordinate.altitude,
    previousOutsideSigns,
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
    verticalDistanceMeters > annotationOverlayDefaults.geometryEpsilonMeters
      ? formatLengthMeters(verticalDistanceMeters, formatOptions.lengthMeters)
      : null;
  const horizontalLabelText =
    horizontalDistanceMeters > annotationOverlayDefaults.geometryEpsilonMeters
      ? formatLengthMeters(horizontalDistanceMeters, formatOptions.lengthMeters)
      : null;
  const componentLabelVisibility =
    resolveDistanceTriangleComponentLabelVisibility({
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
    nextOutsideSigns: labelReferences.nextOutsideSigns,
  };
};

const createDistanceTriangleLabelHandle = (
  overlayLayer: HTMLElement,
  lineLabelOptions?: PartialAnnotationLineLabelOptions
): DistanceTriangleLabelHandle => {
  const lineLabels = createSegmentLineLabels(lineLabelOptions);
  overlayLayer.append(
    lineLabels.direct,
    lineLabels.vertical,
    lineLabels.horizontal
  );

  return {
    lineLabels,
    scratch: createAnnotationGeometryScratch(),
  };
};

const createEdgeSegmentLabelHandle = (
  overlayLayer: HTMLElement,
  lineLabelOptions?: PartialAnnotationLineLabelOptions
): EdgeSegmentLabelHandle => {
  const element = createLineLabel(
    annotationVisualDefaults.colors.componentLabelAccents.direct,
    lineLabelOptions
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
    annotationEdgeDefaults.svgNamespace,
    "svg"
  );
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";

  const path = document.createElementNS(
    annotationEdgeDefaults.svgNamespace,
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
    annotationEdgeDefaults.svgNamespace,
    "circle"
  );
  dot.setAttribute(
    "r",
    `${annotationEdgeDefaults.distanceTriangle.cornerDotRadiusPx}`
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
  tick.style.width = `${annotationEdgeDefaults.midpointMarker.tickLengthPx}px`;
  tick.style.height = `${annotationEdgeDefaults.midpointMarker.tickWidthPx}px`;
  tick.style.borderRadius = "999px";
  tick.style.background = annotationEdgeDefaults.midpointMarker.tickColor;
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
  handle.root.style.width = `${annotationEdgeDefaults.midpointMarker.hitTargetPx}px`;
  handle.root.style.height = `${annotationEdgeDefaults.midpointMarker.hitTargetPx}px`;
  handle.root.style.transform = `translate(-50%, -50%) rotate(${angleRad}rad)`;
  handle.root.style.transformOrigin = "50% 50%";
  handle.root.style.zIndex = `${Math.max(
    zIndex,
    annotationEdgeDefaults.midpointMarker.minOverlayZIndex
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

export const useAnnotationEdgesController = (
  scene: Scene | null,
  {
    edges,
    formatOptions,
    lineLabelOptions,
    surfaceKey = "committed",
    activeEditedNodeId,
    blockEdgeInteractions,
    onAnnotationSelect,
    onEdgeClick,
    insertNodeTargetAnnotationIds = [],
    onInsertNodeTargetClick,
    onDistanceTriangleCornerClick,
    liveAnchors,
  }: UseRuntimeAnnotationEdgesControllerArgs
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
  const resolvedAnnotationLineLabelOptions = useMemo(
    () => resolveAnnotationLineLabelOptions(lineLabelOptions),
    [lineLabelOptions]
  );
  const insertNodeTargetAnnotationIdSet = useMemo(
    () => new Set(insertNodeTargetAnnotationIds),
    [insertNodeTargetAnnotationIds]
  );

  const edgeSegments = useMemo<readonly EdgeSegment[]>(
    () =>
      edges.flatMap((edge) => {
        const segments: EdgeSegment[] = [];
        const strokeWidth = Number.isFinite(edge.strokeWidth)
          ? edge.strokeWidth
          : annotationVisualDefaults.sizes.edgeStrokeWidth;
        const overlayDashPattern =
          edge.overlayDashPattern ??
          annotationVisualDefaults.patterns.edgeDashPattern;

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
            annotationId: edge.annotationId,
            startNodeId,
            endNodeId,
            startCoordinate,
            endCoordinate,
            stroke: edge.stroke,
            strokeWidth,
            overlayDashPattern,
            ...(edge.overlayDashed ? { overlayDashed: true as const } : {}),
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
          edge.annotationId !== undefined &&
          insertNodeTargetAnnotationIdSet.has(edge.annotationId) &&
          edge.startNodeId !== undefined &&
          edge.endNodeId !== undefined
      ),
    [edgeSegments, insertNodeTargetAnnotationIdSet]
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
          startNodeId: edge.startNodeId,
          endNodeId: edge.endNodeId,
        };

        if (!scene || scene.isDestroyed() || !edge.distanceTriangleOverlay) {
          return [directLine];
        }

        const componentScratch = createAnnotationGeometryScratch();
        const screenData = resolveDistanceTriangleOverlayScreenData({
          scene,
          edge,
          scratch: componentScratch,
          formatOptions,
          liveAnchors,
        });
        if (!screenData) {
          return [directLine];
        }

        const componentLines: EdgeSceneLine[] = [];

        if (screenData.showVerticalLabel && screenData.verticalLabelText) {
          // Persistent scratch so the per-frame recompute does not allocate.
          const verticalRecomputeScratch = createAnnotationGeometryScratch();
          componentLines.push({
            id: `${edge.id}-vertical`,
            start: screenData.anchorPointECEF,
            end: screenData.auxiliaryPointECEF,
            stroke: annotationOverlayDefaults.verticalLineColor,
            strokeWidth: edge.strokeWidth,
            recompute: (currentLiveAnchors) => {
              if (!edgeSegmentHasLiveAnchor(edge, currentLiveAnchors)) {
                return null;
              }
              const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
                scene,
                edge,
                currentLiveAnchors,
                verticalRecomputeScratch
              );
              return endpoints
                ? [endpoints.anchorECEF, endpoints.auxiliaryECEF]
                : null;
            },
          });
        }

        if (screenData.showHorizontalLabel && screenData.horizontalLabelText) {
          const horizontalRecomputeScratch = createAnnotationGeometryScratch();
          componentLines.push({
            id: `${edge.id}-horizontal`,
            start: screenData.auxiliaryPointECEF,
            end: screenData.targetPointECEF,
            stroke: annotationOverlayDefaults.horizontalLineColor,
            strokeWidth: edge.strokeWidth,
            recompute: (currentLiveAnchors) => {
              if (!edgeSegmentHasLiveAnchor(edge, currentLiveAnchors)) {
                return null;
              }
              const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
                scene,
                edge,
                currentLiveAnchors,
                horizontalRecomputeScratch
              );
              return endpoints
                ? [endpoints.auxiliaryECEF, endpoints.targetECEF]
                : null;
            },
          });
        }

        return [directLine, ...componentLines];
      }),
    [edgeSegments, formatOptions, liveAnchors, scene]
  );

  const overlayLines = useMemo<readonly LineVisualizerData[]>(
    () =>
      edgeSegments.flatMap((edge) => {
        const referenceEdgeClickHandler =
          activeEditedNodeId &&
          edge.startNodeId &&
          edge.endNodeId &&
          onEdgeClick
            ? () => onEdgeClick(edge.startNodeId!, edge.endNodeId!)
            : undefined;
        const selectionEdgeClickHandler =
          !blockEdgeInteractions &&
          onAnnotationSelect &&
          edge.distanceTriangleOverlay?.annotationId
            ? () =>
                onAnnotationSelect(edge.distanceTriangleOverlay!.annotationId!)
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
              resolveEdgePointECEF(
                liveAnchors,
                edge.startNodeId,
                edge.startCoordinate
              )
            );
            const end = SceneTransforms.worldToWindowCoordinates(
              scene,
              resolveEdgePointECEF(
                liveAnchors,
                edge.endNodeId,
                edge.endCoordinate
              )
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

        const componentScratch = createAnnotationGeometryScratch();
        const getScreenData = () =>
          resolveDistanceTriangleOverlayScreenData({
            scene,
            edge,
            scratch: componentScratch,
            formatOptions,
            liveAnchors,
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
            stroke: annotationOverlayDefaults.verticalLineColor,
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
            stroke: annotationOverlayDefaults.horizontalLineColor,
            strokeWidth: edge.strokeWidth,
            dashed: true,
            dashPattern: edge.overlayDashPattern,
            hitTargetStrokeWidth: 8,
            onLineClick: lineClickHandler,
          }),
        ];
      }),
    [
      activeEditedNodeId,
      blockEdgeInteractions,
      edgeSegments,
      formatOptions,
      liveAnchors,
      onEdgeClick,
      onAnnotationSelect,
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

  // Patch polyline endpoints from live drag anchors every frame, before the draw,
  // so the lines move in lockstep with the gizmo disc instead of waiting for the
  // React rebuild above. Stable listener (keyed on scene) reading the handle ref.
  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      return;
    }
    const removePreRenderListener = scene.preRender.addEventListener(() => {
      try {
        applyLiveAnchorsToSceneLines(
          sceneLineHandleByIdRef.current,
          liveAnchors
        );
      } catch {
        // Ignore frame races during teardown.
      }
    });
    // Let a drag tool (the point-move gizmo) exclude this annotation's own lines
    // from depth sampling while a node is being dragged. The active node covers
    // the first sample; live anchors additionally cover linked nodes moved in
    // the same scope. Foreign lines stay snappable.
    const unregisterDragSampleOccluders =
      registerCesiumSceneDragSampleExclusionResolver(scene, () => {
        const occluders: Array<{ show: boolean }> = [];
        sceneLineHandleByIdRef.current.forEach((handle) => {
          if (
            shouldExcludeAnnotationSceneLineFromDragSample(
              handle,
              activeEditedNodeId,
              (nodeId) => liveAnchors.get(nodeId) !== undefined
            )
          ) {
            occluders.push(handle.collection);
          }
        });
        return occluders;
      });
    return () => {
      removePreRenderListener?.();
      unregisterDragSampleOccluders();
    };
  }, [activeEditedNodeId, liveAnchors, scene]);

  useEffect(() => {
    destroyEdgeMidpointHandles(edgeMidpointHandleByIdRef.current);

    if (
      !scene ||
      scene.isDestroyed() ||
      blockEdgeInteractions ||
      activeEditedNodeId !== null ||
      insertNodeTargetSegments.length === 0
    ) {
      return;
    }

    const overlayLayer = createAnnotationOverlayLayers(scene, {
      [ANNOTATION_OVERLAY_GROUP.VISUALIZER]: `${resolveDistanceTriangleLabelLayerId(
        surfaceKey
      )}-midpoint-targets`,
    })[ANNOTATION_OVERLAY_GROUP.VISUALIZER];
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

        // Track live drag anchors so an edge's insert-node handle follows the
        // dragged endpoint in lockstep with the patched line.
        const startWorld = resolveEdgePointECEF(
          liveAnchors,
          edge.startNodeId,
          edge.startCoordinate
        );
        const endWorld = resolveEdgePointECEF(
          liveAnchors,
          edge.endNodeId,
          edge.endCoordinate
        );
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
          !edge.annotationId ||
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
                  edge.annotationId!,
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
      destroyAnnotationOverlayLayer(overlayLayer);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [
    activeEditedNodeId,
    blockEdgeInteractions,
    insertNodeTargetSegments,
    liveAnchors,
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
      [ANNOTATION_OVERLAY_GROUP.LABEL]: labelOverlayLayer,
      [ANNOTATION_OVERLAY_GROUP.VISUALIZER]: visualizerOverlayLayer,
    } = createAnnotationOverlayLayers(scene, {
      [ANNOTATION_OVERLAY_GROUP.LABEL]:
        resolveDistanceTriangleLabelLayerId(surfaceKey),
      [ANNOTATION_OVERLAY_GROUP.VISUALIZER]: `${resolveDistanceTriangleLabelLayerId(
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
            resolvedAnnotationLineLabelOptions
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
            resolvedAnnotationLineLabelOptions
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
      // While a drag is live (anchors present) the camera is usually static, so
      // the snapshot compares equal — but the dragged node IS moving. Don't skip
      // then, or the labels freeze while the lines/disc track.
      if (
        !force &&
        liveAnchors.size === 0 &&
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
          previousOutsideSigns: labelHandle.previousOutsideSigns,
          formatOptions,
          liveAnchors,
        });
        if (!screenData) {
          hideLineLabels(labelHandle.lineLabels);
          const cornerHandle = distanceTriangleCornerHandleByIdRef.current.get(
            edge.id
          );
          if (cornerHandle) {
            hideDistanceTriangleCornerHandle(cornerHandle);
          }
          labelHandle.previousOutsideSigns = undefined;
          return;
        }

        labelHandle.previousOutsideSigns = screenData.nextOutsideSigns;

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
        const annotationId = resolveDistanceTriangleAnnotationId(edge);
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
          annotationId,
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
            annotationId,
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
            annotationId,
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
              activeEditedNodeId === null &&
              Boolean(onDistanceTriangleCornerClick),
            onClick: onDistanceTriangleCornerClick
              ? () =>
                  onDistanceTriangleCornerClick(
                    resolveDistanceTriangleAnnotationId(edge)
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
                resolveDistanceTriangleAnnotationId(edge)
              )
          : undefined;
        const cornerHandleClickable =
          !blockEdgeInteractions &&
          activeEditedNodeId === null &&
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

        const startPointECEF = resolveEdgePointECEF(
          liveAnchors,
          edge.startNodeId,
          edge.startCoordinate
        );
        const endPointECEF = resolveEdgePointECEF(
          liveAnchors,
          edge.endNodeId,
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
          annotationId: edge.annotationId ?? edge.id,
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
          resolvedAnnotationLineLabelOptions.collision.allowEarlyRemoval,
        collisionResolutionStrategy:
          resolvedAnnotationLineLabelOptions.collision.resolutionStrategy,
        anchorSlideStepRatio:
          resolvedAnnotationLineLabelOptions.collision.anchorSlideStepRatio,
        maxAnchorSlideDeltaRatio:
          resolvedAnnotationLineLabelOptions.collision.maxAnchorSlideDeltaRatio,
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
      destroyAnnotationOverlayLayer(labelOverlayLayer);
      destroyAnnotationOverlayLayer(visualizerOverlayLayer);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [
    activeEditedNodeId,
    blockEdgeInteractions,
    edgeSegments,
    edgeSegmentLabelHandleByIdRef,
    formatOptions,
    liveAnchors,
    onDistanceTriangleCornerClick,
    resolvedAnnotationLineLabelOptions,
    scene,
    surfaceKey,
  ]);
};
