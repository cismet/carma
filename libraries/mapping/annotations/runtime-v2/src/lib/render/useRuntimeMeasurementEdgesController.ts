import { useEffect, useMemo, useRef } from "react";

import { createSvgLineVisualizers } from "@carma-commons/svg";
import {
  cartesian3FromGeographicCoordinate,
  getArcPointsInSpannedPlane,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";
import { REFERENCE_LINE_EPSILON_METERS } from "@carma-mapping/annotations/core";
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
  useLineVisualizers,
  type LineVisualizerData,
} from "@carma-providers/label-overlay";

import type { RuntimeScene } from "../types/runtimeScene.types";
import {
  applyLineLabel,
  buildAuxiliaryPoint,
  buildPreviewDistanceTriangleLabelReferences,
  createPreviewOverlayLayer,
  createPreviewSegmentScratch,
  createSegmentLineLabels,
  destroyPreviewOverlayLayer,
  hideLineLabels,
  previewControllerDefaults,
  resolvePreviewDistanceTriangleComponentLabelVisibility,
  type PreviewSegmentLineLabelElements,
  type PreviewSegmentScratch,
} from "../interaction/previewController.shared";
import {
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  resolveRuntimeOverlayDistanceZIndex,
  type RuntimeDistanceTriangleOverlayRenderModel,
  type RuntimeEdgeRenderModel,
} from "./measurementRenderModels";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotationsRuntimeFormatOptions";
import type { PreviewLineLabelVisualOptions } from "../config/previewLineLabelVisualDefaults";
import { distanceToolVisualDefaults } from "../tools/distance/distanceToolVisualDefaults";

type UseRuntimeMeasurementEdgesControllerArgs = {
  scene: RuntimeScene | null;
  edges: readonly RuntimeEdgeRenderModel[];
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  onDistanceTriangleCornerClick: (measurementId: string) => void;
};

type RuntimeEdgeSceneLine = {
  id: string;
  start: Cartesian3;
  end: Cartesian3;
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
};

type RuntimeEdgeSegment = {
  id: string;
  startCoordinate: RuntimeEdgeRenderModel["coordinates"][number];
  endCoordinate: RuntimeEdgeRenderModel["coordinates"][number];
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
  distanceTriangleOverlay?: RuntimeDistanceTriangleOverlayRenderModel;
};

const resolveDistanceTriangleMeasurementId = (edge: RuntimeEdgeSegment) =>
  edge.distanceTriangleOverlay?.measurementId ?? edge.id;

const resolveOverlayZIndexAtWorldPosition = (
  scene: RuntimeScene,
  worldPosition: Cartesian3
) =>
  resolveRuntimeOverlayDistanceZIndex(
    Cartesian3.distance(scene.camera.positionWC, worldPosition)
  );

const resolveOverlayZIndexBetweenWorldPositions = (
  scene: RuntimeScene,
  start: Cartesian3,
  end: Cartesian3
) =>
  resolveOverlayZIndexAtWorldPosition(
    scene,
    Cartesian3.midpoint(start, end, new Cartesian3())
  );

type SceneLineHandle = {
  signature: string;
  collection: PolylineCollection;
  dashed: boolean;
  destroy: () => void;
};

type RuntimeDistanceTriangleOverlayScreenData = {
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

type DistanceTriangleCornerHandle = {
  root: HTMLDivElement;
  svg: SVGSVGElement;
  path: SVGPathElement;
  dot: SVGCircleElement;
};

const DEFAULT_DASH_LENGTH_METERS = 1.5;
const DEFAULT_GAP_LENGTH_METERS = 1.5;
const DEFAULT_DASH_LENGTH_PX = 6;
const DEFAULT_GAP_LENGTH_PX = 8;
const MIN_SEGMENT_LENGTH_METERS = 0.01;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DISTANCE_TRIANGLE_CORNER_DOT_RADIUS_PX =
  distanceToolVisualDefaults.cornerOverlay.strokeWidthPx / 2;

const buildSceneLineSignature = (line: RuntimeEdgeSceneLine) =>
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
    line.dashed,
  ].join(":");

const estimateMetersPerPixel = (
  scene: RuntimeScene,
  start: Cartesian3,
  end: Cartesian3
): number => {
  const midpoint = Cartesian3.midpoint(start, end, new Cartesian3());
  const radius = Math.max(Cartesian3.distance(start, end) * 0.5, 1);
  const boundingSphere = new BoundingSphere(midpoint, radius);
  const metersPerPixel = scene.camera.getPixelSize(
    boundingSphere,
    scene.drawingBufferWidth,
    scene.drawingBufferHeight
  );

  if (Number.isFinite(metersPerPixel) && metersPerPixel > 0) {
    return metersPerPixel;
  }

  const fallbackLength = Math.max(Cartesian3.distance(start, end), 1);
  const fallbackPixels = Math.max(
    Math.hypot(scene.drawingBufferWidth, scene.drawingBufferHeight),
    1
  );
  return fallbackLength / fallbackPixels;
};

const buildLineSegments = (
  start: Cartesian3,
  end: Cartesian3,
  dashed: boolean,
  dashLength: number,
  gapLength: number,
  capLength: number
): Array<[Cartesian3, Cartesian3]> => {
  const totalLength = Cartesian3.distance(start, end);
  if (totalLength <= MIN_SEGMENT_LENGTH_METERS) {
    return [];
  }

  if (!dashed) {
    return [[start, end]];
  }

  const safeDashLength = Math.max(dashLength, MIN_SEGMENT_LENGTH_METERS);
  const safeGapLength = Math.max(gapLength, 0);
  const safeCapLength = Math.min(
    Math.max(capLength, 0),
    totalLength * 0.5 - MIN_SEGMENT_LENGTH_METERS * 0.5
  );
  const step = Math.max(
    safeDashLength + safeGapLength,
    MIN_SEGMENT_LENGTH_METERS
  );

  if (safeCapLength <= MIN_SEGMENT_LENGTH_METERS) {
    const segments: Array<[Cartesian3, Cartesian3]> = [];
    for (let distance = 0; distance < totalLength; distance += step) {
      const endDistance = Math.min(distance + safeDashLength, totalLength);
      if (endDistance - distance <= MIN_SEGMENT_LENGTH_METERS * 0.5) {
        continue;
      }

      segments.push([
        Cartesian3.lerp(start, end, distance / totalLength, new Cartesian3()),
        Cartesian3.lerp(
          start,
          end,
          endDistance / totalLength,
          new Cartesian3()
        ),
      ]);
    }
    return segments;
  }

  if (totalLength <= safeCapLength * 2 + MIN_SEGMENT_LENGTH_METERS) {
    return [[start, end]];
  }

  const segments: Array<[Cartesian3, Cartesian3]> = [];
  const pushSegment = (startDistance: number, endDistance: number) => {
    if (endDistance - startDistance <= MIN_SEGMENT_LENGTH_METERS * 0.5) {
      return;
    }

    segments.push([
      Cartesian3.lerp(
        start,
        end,
        startDistance / totalLength,
        new Cartesian3()
      ),
      Cartesian3.lerp(start, end, endDistance / totalLength, new Cartesian3()),
    ]);
  };

  pushSegment(0, safeCapLength);

  const dashedStart = safeCapLength;
  const dashedEnd = totalLength - safeCapLength;
  for (let distance = dashedStart; distance < dashedEnd; distance += step) {
    const endDistance = Math.min(distance + safeDashLength, dashedEnd);
    if (endDistance - distance <= MIN_SEGMENT_LENGTH_METERS * 0.5) {
      continue;
    }

    segments.push([
      Cartesian3.lerp(start, end, distance / totalLength, new Cartesian3()),
      Cartesian3.lerp(start, end, endDistance / totalLength, new Cartesian3()),
    ]);
  }

  pushSegment(dashedEnd, totalLength);
  return segments;
};

const createSceneLineHandle = (
  scene: RuntimeScene,
  line: RuntimeEdgeSceneLine
): SceneLineHandle => {
  const metersPerPixel = estimateMetersPerPixel(scene, line.start, line.end);
  const dashLengthMeters = line.dashed
    ? Math.max(
        DEFAULT_DASH_LENGTH_PX * metersPerPixel,
        MIN_SEGMENT_LENGTH_METERS
      )
    : DEFAULT_DASH_LENGTH_METERS;
  const gapLengthMeters = line.dashed
    ? Math.max(DEFAULT_GAP_LENGTH_PX * metersPerPixel, 0)
    : DEFAULT_GAP_LENGTH_METERS;
  const capLengthMeters = line.dashed
    ? Math.max(line.strokeWidth * metersPerPixel, MIN_SEGMENT_LENGTH_METERS * 2)
    : 0;

  const segments = buildLineSegments(
    line.start,
    line.end,
    line.dashed,
    dashLengthMeters,
    gapLengthMeters,
    capLengthMeters
  );
  const collection = new PolylineCollection();

  if (segments.length > 0) {
    const material = Material.fromType("Color", {
      color: Color.fromCssColorString(line.stroke),
    });

    segments.forEach(([segmentStart, segmentEnd], index) => {
      collection.add({
        id: `${line.id}-${index}`,
        positions: [segmentStart, segmentEnd],
        width: line.strokeWidth,
        material,
        show: true,
      });
    });
  }

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
        "[annotations/runtime-v2] Ignoring committed edge destroy error.",
        error
      );
    }
  };

  return {
    signature: buildSceneLineSignature(line),
    collection,
    dashed: line.dashed,
    destroy,
  };
};

const destroySceneLineHandles = (handles: Map<string, SceneLineHandle>) => {
  handles.forEach((handle) => {
    handle.destroy();
  });
  handles.clear();
};

const DISTANCE_TRIANGLE_LABEL_LAYER_ID =
  "annotation-v2-distance-triangle-label-layer";

const toCssPixelPosition = (x: number, y: number): CssPixelPosition =>
  ({
    x: x as CssPixelPosition["x"],
    y: y as CssPixelPosition["y"],
  } as CssPixelPosition);

const resolveDistanceTriangleAnchorSelection = ({
  overlay,
  startScreenPosition,
  endScreenPosition,
}: {
  overlay: RuntimeDistanceTriangleOverlayRenderModel;
  startScreenPosition: CssPixelPosition;
  endScreenPosition: CssPixelPosition;
}) =>
  overlay.anchorCoordinateSelection ===
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
    ? startScreenPosition.x <= endScreenPosition.x
    : startScreenPosition.x > endScreenPosition.x;

const resolveDistanceTriangleOverlayScreenData = ({
  scene,
  edge,
  scratch,
  previousVerticalOutsideSign,
  formatOptions,
}: {
  scene: RuntimeScene;
  edge: RuntimeEdgeSegment;
  scratch: PreviewSegmentScratch;
  previousVerticalOutsideSign?: -1 | 1;
  formatOptions: AnnotationsRuntimeFormatOptions;
}): RuntimeDistanceTriangleOverlayScreenData | null => {
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
    startScreenPosition,
    endScreenPosition,
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

const destroyDistanceTriangleLabelHandle = (
  handle: DistanceTriangleLabelHandle
) => {
  hideLineLabels(handle.lineLabels);
  handle.lineLabels.direct.remove();
  handle.lineLabels.vertical.remove();
  handle.lineLabels.horizontal.remove();
};

const destroyDistanceTriangleLabelHandles = (
  handles: Map<string, DistanceTriangleLabelHandle>
) => {
  handles.forEach((handle) => {
    destroyDistanceTriangleLabelHandle(handle);
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

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";

  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", distanceToolVisualDefaults.cornerOverlay.color);
  path.setAttribute(
    "stroke-width",
    `${distanceToolVisualDefaults.cornerOverlay.strokeWidthPx}`
  );
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  const dot = document.createElementNS(SVG_NAMESPACE, "circle");
  dot.setAttribute("r", `${DISTANCE_TRIANGLE_CORNER_DOT_RADIUS_PX}`);
  dot.setAttribute("fill", distanceToolVisualDefaults.cornerOverlay.color);

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
    `${dotScreen.x - minX + distanceToolVisualDefaults.cornerOverlay.paddingPx}`
  );
  handle.dot.setAttribute(
    "cy",
    `${dotScreen.y - minY + distanceToolVisualDefaults.cornerOverlay.paddingPx}`
  );
  handle.root.style.left = `${
    minX - distanceToolVisualDefaults.cornerOverlay.paddingPx
  }px`;
  handle.root.style.top = `${
    minY - distanceToolVisualDefaults.cornerOverlay.paddingPx
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
    distanceToolVisualDefaults.cornerOverlay.straightHitTargetPx;
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

export const useRuntimeMeasurementEdgesController = ({
  scene,
  edges,
  formatOptions,
  previewLineLabelVisualOptions,
  onDistanceTriangleCornerClick,
}: UseRuntimeMeasurementEdgesControllerArgs) => {
  const sceneLineHandleByIdRef = useRef<Map<string, SceneLineHandle>>(
    new Map()
  );
  const distanceTriangleLabelHandleByIdRef = useRef<
    Map<string, DistanceTriangleLabelHandle>
  >(new Map());
  const distanceTriangleCornerHandleByIdRef = useRef<
    Map<string, DistanceTriangleCornerHandle>
  >(new Map());

  const edgeSegments = useMemo<readonly RuntimeEdgeSegment[]>(
    () =>
      edges.flatMap((edge) => {
        const segments: RuntimeEdgeSegment[] = [];

        for (let index = 0; index < edge.coordinates.length - 1; index += 1) {
          const startCoordinate = edge.coordinates[index];
          const endCoordinate = edge.coordinates[index + 1];

          if (!startCoordinate || !endCoordinate) {
            continue;
          }

          segments.push({
            id: `${edge.id}-${index}`,
            startCoordinate,
            endCoordinate,
            stroke: edge.stroke,
            strokeWidth: edge.strokeWidth,
            dashed: edge.dashed ?? false,
            distanceTriangleOverlay:
              index === 0 ? edge.distanceTriangleOverlay : undefined,
          });
        }

        return segments;
      }),
    [edges]
  );

  const sceneLines = useMemo<readonly RuntimeEdgeSceneLine[]>(
    () =>
      edgeSegments.flatMap((edge) => {
        const renderDistanceDashesInScene =
          !edge.distanceTriangleOverlay ||
          distanceToolVisualDefaults.dashedLine.renderInScene;
        const directLine: RuntimeEdgeSceneLine = {
          id: edge.id,
          start: cartesian3FromGeographicCoordinate(edge.startCoordinate),
          end: cartesian3FromGeographicCoordinate(edge.endCoordinate),
          stroke: edge.stroke,
          strokeWidth: edge.strokeWidth,
          dashed: renderDistanceDashesInScene ? edge.dashed : false,
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

        const componentLines: RuntimeEdgeSceneLine[] = [];

        if (screenData.showVerticalLabel && screenData.verticalLabelText) {
          componentLines.push({
            id: `${edge.id}-vertical`,
            start: screenData.anchorPointECEF,
            end: screenData.auxiliaryPointECEF,
            stroke: previewControllerDefaults.verticalLineColor,
            strokeWidth: edge.strokeWidth,
            dashed: renderDistanceDashesInScene,
          });
        }

        if (screenData.showHorizontalLabel && screenData.horizontalLabelText) {
          componentLines.push({
            id: `${edge.id}-horizontal`,
            start: screenData.auxiliaryPointECEF,
            end: screenData.targetPointECEF,
            stroke: previewControllerDefaults.horizontalLineColor,
            strokeWidth: edge.strokeWidth,
            dashed: renderDistanceDashesInScene,
          });
        }

        return [directLine, ...componentLines];
      }),
    [edgeSegments, formatOptions, scene]
  );

  const overlayLines = useMemo<readonly LineVisualizerData[]>(
    () =>
      edgeSegments.flatMap((edge) => {
        const baseLines = createSvgLineVisualizers({
          id: `runtime-edge-overlay-${edge.id}`,
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
          dashed: edge.dashed,
          hitTargetStrokeWidth: 10,
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
            id: `runtime-edge-overlay-${edge.id}-vertical`,
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
            hitTargetStrokeWidth: 8,
          }),
          ...createSvgLineVisualizers({
            id: `runtime-edge-overlay-${edge.id}-horizontal`,
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
            hitTargetStrokeWidth: 8,
          }),
        ];
      }),
    [edgeSegments, formatOptions, scene]
  );

  useLineVisualizers([...overlayLines], overlayLines.length > 0);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      destroySceneLineHandles(sceneLineHandleByIdRef.current);
      return;
    }

    const reconcileSceneLines = (lines: readonly RuntimeEdgeSceneLine[]) => {
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
    destroyDistanceTriangleLabelHandles(
      distanceTriangleLabelHandleByIdRef.current
    );
    destroyDistanceTriangleCornerHandles(
      distanceTriangleCornerHandleByIdRef.current
    );

    if (!scene || scene.isDestroyed()) {
      return;
    }

    const distanceTriangleEdges = edgeSegments.filter(
      (edge) => edge.distanceTriangleOverlay !== undefined
    );
    if (distanceTriangleEdges.length === 0) {
      return;
    }

    const overlayLayer = createPreviewOverlayLayer(
      scene,
      DISTANCE_TRIANGLE_LABEL_LAYER_ID
    );
    if (!overlayLayer) {
      return;
    }

    const reconcileLabelHandles = () => {
      const nextIds = new Set(distanceTriangleEdges.map((edge) => edge.id));

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
            overlayLayer,
            previewLineLabelVisualOptions
          )
        );
        distanceTriangleCornerHandleByIdRef.current.set(
          edge.id,
          createDistanceTriangleCornerHandle(overlayLayer)
        );
      });
    };

    const updateDistanceTriangleLabels = () => {
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

        labelHandle.lineLabels.direct.style.zIndex = `${directOverlayZIndex}`;

        applyLineLabel({
          element: labelHandle.lineLabels.direct,
          text: screenData.directLabelText,
          start: screenData.anchorScreenPosition,
          end: screenData.targetScreenPosition,
          outsideReferencePoint: screenData.directOutsideReferencePoint,
        });

        if (screenData.showVerticalLabel && screenData.verticalLabelText) {
          labelHandle.lineLabels.vertical.style.zIndex = `${verticalOverlayZIndex}`;
          applyLineLabel({
            element: labelHandle.lineLabels.vertical,
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
          applyLineLabel({
            element: labelHandle.lineLabels.horizontal,
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

        const verticalLengthMeters = Cartesian3.distance(
          screenData.anchorPointECEF,
          screenData.auxiliaryPointECEF
        );
        const horizontalLengthMeters = Cartesian3.distance(
          screenData.auxiliaryPointECEF,
          screenData.targetPointECEF
        );
        if (
          verticalLengthMeters <= REFERENCE_LINE_EPSILON_METERS ||
          horizontalLengthMeters <= REFERENCE_LINE_EPSILON_METERS
        ) {
          const directLengthMeters = Cartesian3.distance(
            screenData.anchorPointECEF,
            screenData.targetPointECEF
          );
          if (directLengthMeters <= REFERENCE_LINE_EPSILON_METERS) {
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
            clickable: true,
            onClick: () =>
              onDistanceTriangleCornerClick(
                resolveDistanceTriangleMeasurementId(edge)
              ),
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
          distanceToolVisualDefaults.cornerOverlay.targetRadiusPx *
            metersPerPixel,
          distanceToolVisualDefaults.cornerOverlay.segments
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
          distanceToolVisualDefaults.cornerOverlay.minBoxPx,
          maxX - minX + distanceToolVisualDefaults.cornerOverlay.paddingPx * 2
        );
        const height = Math.max(
          distanceToolVisualDefaults.cornerOverlay.minBoxPx,
          maxY - minY + distanceToolVisualDefaults.cornerOverlay.paddingPx * 2
        );
        const pathData = arcPointsScreen
          .map((point, index) => {
            const x =
              point.x -
              minX +
              distanceToolVisualDefaults.cornerOverlay.paddingPx;
            const y =
              point.y -
              minY +
              distanceToolVisualDefaults.cornerOverlay.paddingPx;
            return `${index === 0 ? "M" : "L"} ${x} ${y}`;
          })
          .join(" ");
        const onClick = () =>
          onDistanceTriangleCornerClick(
            resolveDistanceTriangleMeasurementId(edge)
          );

        applyDistanceTriangleCornerHandleLayout({
          handle: cornerHandle,
          pathData,
          dotScreen: toCssPixelPosition(dotScreen.x, dotScreen.y),
          minX,
          minY,
          width,
          height,
          clickable: true,
          onClick,
        });
      });
    };

    reconcileLabelHandles();
    updateDistanceTriangleLabels();
    const removePostRenderListener = scene.postRender.addEventListener(
      updateDistanceTriangleLabels
    );
    scene.requestRender();

    return () => {
      removePostRenderListener?.();
      destroyDistanceTriangleLabelHandles(
        distanceTriangleLabelHandleByIdRef.current
      );
      destroyDistanceTriangleCornerHandles(
        distanceTriangleCornerHandleByIdRef.current
      );
      destroyPreviewOverlayLayer(overlayLayer);
      if (!scene.isDestroyed()) {
        scene.requestRender();
      }
    };
  }, [
    edgeSegments,
    formatOptions,
    onDistanceTriangleCornerClick,
    previewLineLabelVisualOptions,
    scene,
  ]);
};
