import { useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";

import { createSvgLineVisualizers } from "@carma-commons/svg";
import {
  buildDistanceTriangleLineLabelReferences,
  type DistanceTriangleLineLabelOutsideSigns,
  distanceVisualizationDefaults,
  ecefFromGeographicCoordinate,
  getAnnotationSurfaceAccentCssColor,
  getArcPointsInSpannedPlane,
  type AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";
import {
  degToRadNumeric,
  formatLengthMeters,
  type CssPixelPosition,
} from "@carma-units";
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

import {
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationSceneLineCollection,
  type AnnotationSceneLineHandle,
} from "../engine";
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
  start: Vector3;
  end: Vector3;
  stroke: string;
  strokeWidth: number;
  // The engine draws the depth-occluded part of this line itself (dashed, on
  // top) instead of the SVG overlay trace.
  occludedDashed: boolean;
  // World-scale dashes at the engine's grid pitch, counting metres along the line.
  ruler: boolean;
  // A darkening halo beside the line; off for the legs of a distance.
  halo?: boolean;
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
  ) => readonly [Vector3, Vector3] | null;
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
  ruler?: true;
  showSegmentLengthLabels?: true;
  distanceTriangleOverlay?: RuntimeDistanceTriangleOverlayRenderModel;
};

const resolveDistanceTriangleAnnotationId = (edge: EdgeSegment) =>
  edge.distanceTriangleOverlay?.annotationId ?? edge.id;

const cameraPositionScratch = new Vector3();

const resolveOverlayZIndexAtWorldPosition = (
  engine: AnnotationEngine,
  worldPosition: Vector3
) => {
  const cameraPositionECEF = engine.getCameraPositionECEF(
    cameraPositionScratch
  );
  return resolveRuntimeOverlayDistanceZIndex(
    cameraPositionECEF
      ? cameraPositionECEF.distanceTo(worldPosition)
      : Number.NaN
  );
};

const resolveOverlayZIndexBetweenWorldPositions = (
  engine: AnnotationEngine,
  start: Vector3,
  end: Vector3
) =>
  Math.round(
    (resolveOverlayZIndexAtWorldPosition(engine, start) +
      resolveOverlayZIndexAtWorldPosition(engine, end)) /
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
    // Vertical field of view assumed when the engine cannot report a pixel
    // scale at the corner (the Cesium default frustum fov).
    fallbackFovRad: degToRadNumeric(60),
  }),
});

const toLayoutRect = (domRect: DOMRect): Rect => ({
  left: domRect.left,
  top: domRect.top,
  right: domRect.right,
  bottom: domRect.bottom,
});

const resolveVisiblePointLabelRects = (engine: AnnotationEngine): Rect[] => {
  const container = resolveAnnotationOverlayContainer(engine);
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

// Two engine line collections per controller: the gizmo must not sample lines
// incident to the edited node (or to linked nodes with live anchors) while
// dragging along a surface, so those lines live in the collection created with
// `excludeFromDragSamples`; foreign lines stay snappable in the plain one.
type SceneLineCollections = {
  snappable: AnnotationSceneLineCollection;
  excludedFromDragSamples: AnnotationSceneLineCollection;
};

type SceneLineHandle = {
  signature: string;
  line: EdgeSceneLine;
  // The engine line handle, kept for in-place position patching.
  sceneLine: AnnotationSceneLineHandle;
  // Which collection currently owns `sceneLine`.
  excludedFromDragSamples: boolean;
  // Endpoint node ids + the React-fed base positions, so the preRender patch can
  // swap to live drag anchors and restore the base when the drag clears.
  startNodeId?: string;
  endNodeId?: string;
  baseStart: Vector3;
  baseEnd: Vector3;
  recompute?: (
    liveAnchors: LiveAnnotationAnchors
  ) => readonly [Vector3, Vector3] | null;
  overridden: boolean;
  destroy: () => void;
};

type DistanceTriangleOverlayScreenData = {
  anchorPointECEF: Vector3;
  targetPointECEF: Vector3;
  auxiliaryPointECEF: Vector3;
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
    line.occludedDashed,
    line.ruler,
    line.halo !== false,
  ].join(":");

const createSceneLineCollections = (
  engine: AnnotationEngine
): SceneLineCollections => ({
  snappable: engine.createLineCollection(),
  excludedFromDragSamples: engine.createLineCollection({
    excludeFromDragSamples: true,
  }),
});

const destroySceneLineCollections = (collections: SceneLineCollections) => {
  collections.snappable.destroy();
  collections.excludedFromDragSamples.destroy();
};

const resolveSceneLineCollection = (
  collections: SceneLineCollections,
  excludedFromDragSamples: boolean
) =>
  excludedFromDragSamples
    ? collections.excludedFromDragSamples
    : collections.snappable;

const createSceneLineHandle = (
  engine: AnnotationEngine,
  collections: SceneLineCollections,
  line: EdgeSceneLine,
  excludedFromDragSamples: boolean
): SceneLineHandle => {
  const sceneLine = resolveSceneLineCollection(
    collections,
    excludedFromDragSamples
  ).addLine({
    id: line.id,
    positions: [line.start, line.end],
    color: line.stroke,
    width: line.strokeWidth,
    occludedDashed: line.occludedDashed,
    ruler: line.ruler,
    halo: line.halo !== false,
    visible: true,
  });

  const destroy = () => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    try {
      sceneLine.destroy();
    } catch (error) {
      console.warn(
        "[annotations/runtime] Ignoring committed edge destroy error.",
        error
      );
    }
  };

  return {
    signature: buildSceneLineSignature(line),
    line,
    sceneLine,
    excludedFromDragSamples,
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
    let nextPositions: readonly [Vector3, Vector3] | null = null;
    if (handle.recompute) {
      // Component (height-leg) lines re-derive both endpoints from the live edge.
      nextPositions = hasAnchors ? handle.recompute(liveAnchors) : null;
    } else {
      const liveStart = handle.startNodeId
        ? liveAnchors.get(handle.startNodeId)
        : undefined;
      const liveEnd = handle.endNodeId
        ? liveAnchors.get(handle.endNodeId)
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
    handle.sceneLine.setPositions(
      nextPositions
        ? [nextPositions[0], nextPositions[1]]
        : [handle.baseStart, handle.baseEnd]
    );
    handle.overridden = nextPositions !== null && hasAnchors;
  });
};

// Let a drag tool (the point-move gizmo) exclude this annotation's own lines
// from depth sampling while a node is being dragged. The active node covers the
// first sample; live anchors additionally cover linked nodes moved in the same
// scope. Foreign lines stay snappable. Membership is re-evaluated every frame
// (with the live-anchor patch) and a line whose verdict changed is re-created in
// the other collection, keeping its patched positions.
const applyDragSampleExclusionsToSceneLines = (
  engine: AnnotationEngine,
  collections: SceneLineCollections,
  handles: Map<string, SceneLineHandle>,
  activeEditedNodeId: string | null,
  liveAnchors: LiveAnnotationAnchors
) => {
  handles.forEach((handle, id) => {
    const excludedFromDragSamples =
      shouldExcludeAnnotationSceneLineFromDragSample(
        handle,
        activeEditedNodeId,
        (nodeId) => liveAnchors.get(nodeId) !== undefined
      );
    if (excludedFromDragSamples === handle.excludedFromDragSamples) {
      return;
    }

    handle.destroy();
    const nextHandle = createSceneLineHandle(
      engine,
      collections,
      handle.line,
      excludedFromDragSamples
    );
    nextHandle.overridden = false;
    handles.set(id, nextHandle);
  });
};

// Resolve an edge endpoint to ECEF, preferring the live drag anchor for its node
// over the React-fed coordinate, so the SVG overlay lines and every label track
// the drag in the same frame (the engine scene lines are patched separately in
// preRender). Returns a fresh Vector3 so callers may mutate it.
const resolveEdgePointECEF = (
  liveAnchors: LiveAnnotationAnchors,
  nodeId: string | undefined,
  coordinate: AnnotationGeographicCoordinate
): Vector3 => {
  const liveAnchor = nodeId ? liveAnchors.get(nodeId) : undefined;
  return liveAnchor
    ? liveAnchor.clone()
    : ecefFromGeographicCoordinate(coordinate);
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
// fresh Vector3s the caller may keep.
const resolveDistanceTriangleComponentEndpointsECEF = (
  engine: AnnotationEngine,
  edge: EdgeSegment,
  liveAnchors: LiveAnnotationAnchors,
  scratch: AnnotationGeometryScratch
): {
  anchorECEF: Vector3;
  auxiliaryECEF: Vector3;
  targetECEF: Vector3;
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
    engine,
    anchorPointECEF: anchorECEF,
    targetPointECEF: targetECEF,
    scratch,
  });
  if (!auxiliaryECEF) {
    return null;
  }
  return {
    anchorECEF,
    auxiliaryECEF: auxiliaryECEF.clone(),
    targetECEF,
  };
};

const resolveDistanceTriangleOverlayScreenData = ({
  engine,
  edge,
  scratch,
  previousOutsideSigns,
  formatOptions,
  liveAnchors,
}: {
  engine: AnnotationEngine;
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
  const startCanvasPosition = engine.worldToScreen(startPointECEF);
  const endCanvasPosition = engine.worldToScreen(endPointECEF);
  if (startCanvasPosition === null || endCanvasPosition === null) {
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
    engine,
    anchorPointECEF,
    targetPointECEF,
    scratch,
  });
  if (!auxiliaryPointECEF) {
    return null;
  }

  const auxiliaryCanvasPosition = engine.worldToScreen(
    auxiliaryPointECEF,
    scratch.auxiliaryScreen
  );
  if (auxiliaryCanvasPosition === null) {
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
    anchorPointECEF.distanceTo(targetPointECEF),
    formatOptions.lengthMeters
  );
  const verticalDistanceMeters = anchorPointECEF.distanceTo(auxiliaryPointECEF);
  const horizontalDistanceMeters =
    auxiliaryPointECEF.distanceTo(targetPointECEF);
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
  engine: AnnotationEngine | null,
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
  const sceneLineCollectionsRef = useRef<SceneLineCollections | null>(null);
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
            ...(edge.ruler ? { ruler: true as const } : {}),
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

  // The engine draws the depth-occluded part of its scene lines itself (dashed,
  // on top), so the SVG overlay trace for those edges is skipped and the scene
  // line carries `occludedDashed` instead.
  const occludedLinesInScene =
    engine?.capabilities.occludedLinesInScene === true;

  const sceneLines = useMemo<readonly EdgeSceneLine[]>(
    () =>
      edgeSegments.flatMap((edge) => {
        const directLine: EdgeSceneLine = {
          id: edge.id,
          start: ecefFromGeographicCoordinate(edge.startCoordinate),
          end: ecefFromGeographicCoordinate(edge.endCoordinate),
          stroke: edge.stroke,
          strokeWidth: edge.strokeWidth,
          occludedDashed: occludedLinesInScene && edge.overlayDashed === true,
          ruler: edge.ruler === true,
          startNodeId: edge.startNodeId,
          endNodeId: edge.endNodeId,
        };

        if (!isValidAnnotationEngine(engine) || !edge.distanceTriangleOverlay) {
          return [directLine];
        }

        // The legs exist by geometry alone, like in the Cesium view: deciding
        // them from a screen projection here (this memo runs once, not per
        // frame) dropped them for every measurement that was off screen or
        // not yet projectable when it ran, while their labels showed later.
        const componentScratch = createAnnotationGeometryScratch();
        const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
          engine,
          edge,
          liveAnchors,
          componentScratch
        );
        if (!endpoints) {
          return [directLine];
        }
        const legLabelText = (meters: number) =>
          meters > annotationOverlayDefaults.geometryEpsilonMeters
            ? formatLengthMeters(meters, formatOptions.lengthMeters)
            : null;
        const verticalLabelText = legLabelText(
          endpoints.anchorECEF.distanceTo(endpoints.auxiliaryECEF)
        );
        const horizontalLabelText = legLabelText(
          endpoints.auxiliaryECEF.distanceTo(endpoints.targetECEF)
        );
        const legVisibility = resolveDistanceTriangleComponentLabelVisibility({
          directLabelText: formatLengthMeters(
            endpoints.anchorECEF.distanceTo(endpoints.targetECEF),
            formatOptions.lengthMeters
          ),
          verticalLabelText,
          horizontalLabelText,
        });
        const screenData = {
          anchorPointECEF: endpoints.anchorECEF,
          auxiliaryPointECEF: endpoints.auxiliaryECEF,
          targetPointECEF: endpoints.targetECEF,
          verticalLabelText,
          horizontalLabelText,
          showVerticalLabel: legVisibility.showVerticalLabel,
          showHorizontalLabel: legVisibility.showHorizontalLabel,
        };

        const componentLines: EdgeSceneLine[] = [];

        if (screenData.showVerticalLabel && screenData.verticalLabelText) {
          // Persistent scratch so the per-frame recompute does not allocate.
          const verticalRecomputeScratch = createAnnotationGeometryScratch();
          componentLines.push({
            id: `${edge.id}-vertical`,
            halo: false,
            start: screenData.anchorPointECEF,
            end: screenData.auxiliaryPointECEF,
            stroke: annotationOverlayDefaults.verticalLineColor,
            strokeWidth: edge.strokeWidth,
            occludedDashed: occludedLinesInScene,
            ruler: edge.ruler === true,
            recompute: (currentLiveAnchors) => {
              if (!edgeSegmentHasLiveAnchor(edge, currentLiveAnchors)) {
                return null;
              }
              const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
                engine,
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
            halo: false,
            start: screenData.auxiliaryPointECEF,
            end: screenData.targetPointECEF,
            stroke: annotationOverlayDefaults.horizontalLineColor,
            strokeWidth: edge.strokeWidth,
            occludedDashed: occludedLinesInScene,
            ruler: edge.ruler === true,
            recompute: (currentLiveAnchors) => {
              if (!edgeSegmentHasLiveAnchor(edge, currentLiveAnchors)) {
                return null;
              }
              const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
                engine,
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
    [edgeSegments, engine, formatOptions, liveAnchors, occludedLinesInScene]
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
        // The dashed overlay trace duplicates a scene line; the engine draws
        // the occluded part itself when it can.
        const baseLines =
          occludedLinesInScene && edge.overlayDashed
            ? []
            : createSvgLineVisualizers({
                id: `${surfaceKey}-runtime-edge-overlay-${edge.id}`,
                getSvgLine: () => {
                  if (!isValidAnnotationEngine(engine)) {
                    return null;
                  }

                  const start = engine.worldToScreen(
                    resolveEdgePointECEF(
                      liveAnchors,
                      edge.startNodeId,
                      edge.startCoordinate
                    )
                  );
                  const end = engine.worldToScreen(
                    resolveEdgePointECEF(
                      liveAnchors,
                      edge.endNodeId,
                      edge.endCoordinate
                    )
                  );
                  if (start === null || end === null) {
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

        if (
          !edge.distanceTriangleOverlay ||
          !isValidAnnotationEngine(engine) ||
          occludedLinesInScene
        ) {
          return baseLines;
        }

        const componentScratch = createAnnotationGeometryScratch();
        const getScreenData = () =>
          resolveDistanceTriangleOverlayScreenData({
            engine,
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
      engine,
      formatOptions,
      liveAnchors,
      occludedLinesInScene,
      onEdgeClick,
      onAnnotationSelect,
      surfaceKey,
    ]
  );

  useLineVisualizers([...overlayLines], overlayLines.length > 0);

  // One pair of engine line collections per engine; the handles below live in
  // one of them depending on their drag-sample exclusion verdict.
  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }

    const collections = createSceneLineCollections(engine);
    sceneLineCollectionsRef.current = collections;

    return () => {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      if (sceneLineCollectionsRef.current === collections) {
        sceneLineCollectionsRef.current = null;
      }
      if (isValidAnnotationEngine(engine)) {
        destroySceneLineCollections(collections);
      }
    };
  }, [engine]);

  // Keep the latest exclusion inputs readable from the reconcile effect without
  // rebuilding every line when only the edited node changes.
  const activeEditedNodeIdRef = useRef(activeEditedNodeId);
  activeEditedNodeIdRef.current = activeEditedNodeId;

  useEffect(() => {
    const collections = sceneLineCollectionsRef.current;
    if (!isValidAnnotationEngine(engine) || !collections) {
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
          createSceneLineHandle(
            engine,
            collections,
            line,
            shouldExcludeAnnotationSceneLineFromDragSample(
              line,
              activeEditedNodeIdRef.current,
              (nodeId) => liveAnchors.get(nodeId) !== undefined
            )
          )
        );
      });

      engine.requestRender();
    };

    reconcileSceneLines(sceneLines);

    return () => {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      if (isValidAnnotationEngine(engine)) {
        engine.requestRender();
      }
    };
  }, [engine, liveAnchors, sceneLines]);

  // Patch polyline endpoints from live drag anchors every frame, before the draw,
  // so the lines move in lockstep with the gizmo disc instead of waiting for the
  // React rebuild above. Stable listener (keyed on engine) reading the handle ref.
  // The same pass moves lines between the snappable and the drag-sample-excluded
  // collection as the edited node and the live anchors change.
  useEffect(() => {
    if (!isValidAnnotationEngine(engine)) {
      return;
    }
    const applyDragSampleExclusions = () => {
      const collections = sceneLineCollectionsRef.current;
      if (!collections) {
        return;
      }
      applyDragSampleExclusionsToSceneLines(
        engine,
        collections,
        sceneLineHandleByIdRef.current,
        activeEditedNodeId,
        liveAnchors
      );
    };
    applyDragSampleExclusions();
    const removePreRenderListener = engine.subscribePreRender(() => {
      try {
        applyDragSampleExclusions();
        applyLiveAnchorsToSceneLines(
          sceneLineHandleByIdRef.current,
          liveAnchors
        );
      } catch {
        // Ignore frame races during teardown.
      }
    });
    return () => {
      removePreRenderListener();
    };
  }, [activeEditedNodeId, engine, liveAnchors]);

  useEffect(() => {
    destroyEdgeMidpointHandles(edgeMidpointHandleByIdRef.current);

    if (
      !isValidAnnotationEngine(engine) ||
      blockEdgeInteractions ||
      activeEditedNodeId !== null ||
      insertNodeTargetSegments.length === 0
    ) {
      return;
    }

    const overlayLayer = createAnnotationOverlayLayers(engine, {
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
        const startScreen = engine.worldToScreen(startWorld);
        const endScreen = engine.worldToScreen(endWorld);
        const midpointScreen = engine.worldToScreen(
          new Vector3().addVectors(startWorld, endWorld).multiplyScalar(0.5)
        );

        if (
          startScreen === null ||
          endScreen === null ||
          midpointScreen === null ||
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
            engine,
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
    const removePostRenderListener = engine.subscribePostRender(() => {
      updateEdgeMidpointHandles();
    });
    engine.requestRender();

    return () => {
      removePostRenderListener();
      destroyEdgeMidpointHandles(edgeMidpointHandleByIdRef.current);
      destroyAnnotationOverlayLayer(overlayLayer);
      if (isValidAnnotationEngine(engine)) {
        engine.requestRender();
      }
    };
  }, [
    activeEditedNodeId,
    blockEdgeInteractions,
    engine,
    insertNodeTargetSegments,
    liveAnchors,
    onInsertNodeTargetClick,
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

    if (!isValidAnnotationEngine(engine)) {
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
    } = createAnnotationOverlayLayers(engine, {
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
      const nextSceneSnapshot = captureOverlayVisibilitySceneSnapshot(engine);
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
      const occupiedPointLabelRects = resolveVisiblePointLabelRects(engine);
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
          engine,
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
          engine,
          screenData.anchorPointECEF,
          screenData.targetPointECEF
        );
        const verticalOverlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
          engine,
          screenData.anchorPointECEF,
          screenData.auxiliaryPointECEF
        );
        const horizontalOverlayZIndex =
          resolveOverlayZIndexBetweenWorldPositions(
            engine,
            screenData.auxiliaryPointECEF,
            screenData.targetPointECEF
          );
        const cornerOverlayZIndex = resolveOverlayZIndexAtWorldPosition(
          engine,
          screenData.auxiliaryPointECEF
        );
        const annotationId = resolveDistanceTriangleAnnotationId(edge);
        const directLengthMeters = screenData.anchorPointECEF.distanceTo(
          screenData.targetPointECEF
        );
        const verticalLengthMeters = screenData.anchorPointECEF.distanceTo(
          screenData.auxiliaryPointECEF
        );
        const horizontalLengthMeters = screenData.auxiliaryPointECEF.distanceTo(
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

        const viewportWidth = engine.canvas.clientWidth;
        const viewportHeight = engine.canvas.clientHeight;
        if (viewportWidth <= 0 || viewportHeight <= 0) {
          hideDistanceTriangleCornerHandle(cornerHandle);
          return;
        }

        let metersPerPixel = Number.NaN;
        try {
          const pixelsPerMeter = engine.getScreenPixelsPerMeterAt(
            screenData.auxiliaryPointECEF
          );
          metersPerPixel =
            Number.isFinite(pixelsPerMeter) && pixelsPerMeter > 0
              ? 1 / pixelsPerMeter
              : Number.NaN;
        } catch {
          metersPerPixel = Number.NaN;
        }

        if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) {
          const cameraPositionECEF = engine.getCameraPositionECEF(
            cameraPositionScratch
          );
          const cameraDistanceMeters = Math.max(
            cameraPositionECEF
              ? cameraPositionECEF.distanceTo(screenData.auxiliaryPointECEF)
              : Number.NaN,
            1
          );
          const fovRad =
            distanceTriangleVisualDefaults.cornerOverlay.fallbackFovRad;
          metersPerPixel = Math.max(
            (cameraDistanceMeters * Math.tan(fovRad / 2) * 2) /
              Math.max(viewportHeight, 1),
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

        const dotWorld = new Vector3()
          .addVectors(screenData.auxiliaryPointECEF, arcMidpointWorld)
          .multiplyScalar(0.5);
        const dotScreen = engine.worldToScreen(dotWorld);
        if (dotScreen === null) {
          hideDistanceTriangleCornerHandle(cornerHandle);
          return;
        }

        const arcPointsScreen = arcPointsWorld
          .map((worldPoint) => engine.worldToScreen(worldPoint))
          .filter((screenPoint) => screenPoint !== null);
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
        const startScreenPosition = engine.worldToScreen(startPointECEF);
        const endScreenPosition = engine.worldToScreen(endPointECEF);
        const segmentLengthMeters = startPointECEF.distanceTo(endPointECEF);

        if (
          startScreenPosition === null ||
          endScreenPosition === null ||
          segmentLengthMeters <=
            distanceVisualizationDefaults.referenceLineEpsilonMeters
        ) {
          labelHandle.element.style.display = "none";
          return;
        }

        const overlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
          engine,
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
    const removePostRenderListener = engine.subscribePostRender(() => {
      updateEdgeLabels();
    });
    engine.requestRender();

    return () => {
      removePostRenderListener();
      destroyDistanceTriangleLabelHandles(
        distanceTriangleLabelHandleByIdRef.current
      );
      destroyEdgeSegmentLabelHandles(edgeSegmentLabelHandleByIdRef.current);
      destroyDistanceTriangleCornerHandles(
        distanceTriangleCornerHandleByIdRef.current
      );
      destroyAnnotationOverlayLayer(labelOverlayLayer);
      destroyAnnotationOverlayLayer(visualizerOverlayLayer);
      if (isValidAnnotationEngine(engine)) {
        engine.requestRender();
      }
    };
  }, [
    activeEditedNodeId,
    blockEdgeInteractions,
    edgeSegments,
    edgeSegmentLabelHandleByIdRef,
    engine,
    formatOptions,
    liveAnchors,
    onDistanceTriangleCornerClick,
    resolvedAnnotationLineLabelOptions,
    surfaceKey,
  ]);
};
