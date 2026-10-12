import { getArcPointsInSpannedPlane } from "@carma-commons/math";
import { Vector3 } from "three";

import {
  distanceVisualizationDefaults,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import type { CssPixelPosition } from "@carma-units";

import {
  annotationEdgeDefaults,
  distanceTriangleVisualDefaults,
} from "./edge-defaults";
import {
  cameraPositionScratch,
  toCssPixelPosition,
  type DistanceTriangleOverlayScreenData,
} from "./edge-geometry";

export type DistanceTriangleCornerHandle = {
  root: HTMLDivElement;
  svg: SVGSVGElement;
  path: SVGPathElement;
  dot: SVGCircleElement;
};

export const createDistanceTriangleCornerHandle = (
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

export const destroyDistanceTriangleCornerHandle = (
  handle: DistanceTriangleCornerHandle
) => {
  handle.root.remove();
};

export const destroyDistanceTriangleCornerHandles = (
  handles: Map<string, DistanceTriangleCornerHandle>
) => {
  handles.forEach((handle) => {
    destroyDistanceTriangleCornerHandle(handle);
  });
  handles.clear();
};

export const hideDistanceTriangleCornerHandle = (
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

type CornerHandleLengths = {
  directLengthMeters: number;
  verticalLengthMeters: number;
  horizontalLengthMeters: number;
};

/** Lays the right-angle arc (or a plain dot for a degenerate triangle) over the corner. */
export const updateDistanceTriangleCornerHandle = ({
  engine,
  cornerHandle,
  screenData,
  lengths: { directLengthMeters, verticalLengthMeters, horizontalLengthMeters },
  clickable,
  onClick,
}: {
  engine: AnnotationEngine;
  cornerHandle: DistanceTriangleCornerHandle;
  screenData: DistanceTriangleOverlayScreenData;
  lengths: CornerHandleLengths;
  clickable: boolean;
  onClick?: () => void;
}) => {
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
      (screenData.anchorScreenPosition.x + screenData.targetScreenPosition.x) /
        2,
      (screenData.anchorScreenPosition.y + screenData.targetScreenPosition.y) /
        2
    );
    applyDistanceTriangleStraightCornerHandleLayout({
      handle: cornerHandle,
      center: straightCenter,
      clickable,
      onClick,
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
    const fovRad = distanceTriangleVisualDefaults.cornerOverlay.fallbackFovRad;
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
    maxX - minX + distanceTriangleVisualDefaults.cornerOverlay.paddingPx * 2
  );
  const height = Math.max(
    distanceTriangleVisualDefaults.cornerOverlay.minBoxPx,
    maxY - minY + distanceTriangleVisualDefaults.cornerOverlay.paddingPx * 2
  );
  const pathData = arcPointsScreen
    .map((point, index) => {
      const x =
        point.x - minX + distanceTriangleVisualDefaults.cornerOverlay.paddingPx;
      const y =
        point.y - minY + distanceTriangleVisualDefaults.cornerOverlay.paddingPx;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
  applyDistanceTriangleCornerHandleLayout({
    handle: cornerHandle,
    pathData,
    dotScreen: toCssPixelPosition(dotScreen.x, dotScreen.y),
    minX,
    minY,
    width,
    height,
    clickable,
    onClick,
  });
};
