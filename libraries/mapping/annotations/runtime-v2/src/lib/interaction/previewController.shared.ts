import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Material,
  PolylineCollection,
  SceneTransforms,
  defined,
  type Polyline,
} from "@carma-cesium";
import {
  buildDistanceTriangleInsidePoint2D,
  buildVerticalRectangleCornerFromDiagonal,
  normalizeLabelAngleDeg,
  type DistanceScreenTriangle,
} from "@carma-mapping/annotations/core";
import {
  cartesian3FromGeographicCoordinate,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";
import {
  formatLengthMeters,
  LENGTH_UNIT_MODE,
  type CssPixelPosition,
} from "@carma-units";

import { runtimeMeasurementVisualDefaults } from "../config/measurementVisualDefaults";
import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";

export type PreviewLineRuntime = {
  polyline: Polyline;
};

export type PreviewPointMarker = HTMLDivElement;

export type PreviewSegmentLineLabelElements = {
  direct: HTMLDivElement;
  vertical: HTMLDivElement;
  horizontal: HTMLDivElement;
};

export type PreviewSegmentScratch = {
  cartographicA: Cartographic;
  cartographicB: Cartographic;
  auxiliaryPoint: Cartesian3;
  auxiliaryScreen: Cartesian2;
};

export type PreviewDistanceTriangleLabelReferences = {
  directOutsideReferencePoint: CssPixelPosition | null;
  verticalOutsideReferencePoint: CssPixelPosition | null;
  horizontalOutsideReferencePoint: CssPixelPosition | null;
  nextVerticalOutsideSign: -1 | 1 | undefined;
};

type ScreenPointLike = {
  x: number;
  y: number;
};

export const PREVIEW_LINE_STROKE_WIDTH_PX = 1;
export const PREVIEW_LAYER_Z_INDEX = "1650";
export const PREVIEW_LINE_LABEL_OFFSET_PX = 18;
export const PREVIEW_LINE_LABEL_MIN_LENGTH_PX = 44;
export const PREVIEW_GEOMETRY_EPSILON_METERS = 0.01;
export const PREVIEW_LABEL_REFERENCE_MIN_DISTANCE_PX = 24;
export const PREVIEW_LABEL_REFERENCE_MAX_DISTANCE_PX = 48;
export const PREVIEW_LABEL_REFERENCE_INSIDE_BLEND_FACTOR = 0.35;
export const PREVIEW_LABEL_SIDE_SWITCH_THRESHOLD_PX = 4;
export const DIRECT_LINE_COLOR = "rgba(255, 255, 255, 1)";
export const VERTICAL_LINE_COLOR = "rgba(111, 168, 255, 0.96)";
export const HORIZONTAL_LINE_COLOR = "rgba(188, 194, 102, 0.95)";
export const DRAFT_CHAIN_COLOR = runtimeMeasurementVisualDefaults.colors.preview;

export const formatMeters = (value: number): string =>
  formatLengthMeters(value, {
    locale: "de-DE",
    unitMode: LENGTH_UNIT_MODE.METERS,
  });

export const applyStyles = (
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) => {
  Object.assign(element.style, styles);
};

export const resolvePreviewContainer = (scene: RuntimeScene) => {
  const widgetContainer = scene.canvas.parentElement?.parentElement;
  if (widgetContainer instanceof HTMLElement) {
    return widgetContainer;
  }

  return scene.canvas.parentElement;
};

export const createPreviewOverlayLayer = (
  scene: RuntimeScene,
  layerId: string
) => {
  const container = resolvePreviewContainer(scene);
  if (!container) {
    return null;
  }

  const overlayLayer = document.createElement("div");
  overlayLayer.id = layerId;
  applyStyles(overlayLayer, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: PREVIEW_LAYER_Z_INDEX,
  });
  container.appendChild(overlayLayer);
  return overlayLayer;
};

export const destroyPreviewOverlayLayer = (overlayLayer: HTMLElement | null) => {
  overlayLayer?.remove();
};

export const createLineCollection = (scene: RuntimeScene) => {
  const collection = new PolylineCollection();
  scene.primitives.add(collection);
  return collection;
};

export const destroyLineCollection = (
  scene: RuntimeScene,
  collection: PolylineCollection | null
) => {
  if (!collection || !isValidScene(scene)) {
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
  } catch {
    // Scene teardown can race with cleanup.
  }
};

export const createLineRuntime = (
  collection: PolylineCollection,
  id: string,
  colorCss: string
): PreviewLineRuntime => ({
  polyline: collection.add({
    id,
    positions: [Cartesian3.ZERO, Cartesian3.ZERO],
    width: PREVIEW_LINE_STROKE_WIDTH_PX,
    material: Material.fromType("Color", {
      color: Color.fromCssColorString(colorCss) ?? Color.WHITE,
    }),
    show: false,
  }),
});

export const clearLineRuntime = (lineRuntime: PreviewLineRuntime) => {
  lineRuntime.polyline.show = false;
};

export const applyLineRuntime = (
  lineRuntime: PreviewLineRuntime,
  positions: readonly Cartesian3[]
) => {
  lineRuntime.polyline.positions = [...positions];
  lineRuntime.polyline.show = positions.length >= 2;
};

export const createLineLabel = (accentColor: string) => {
  const element = document.createElement("div");
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    pointerEvents: "none",
    transform: "translate(-50%, -50%)",
    willChange: "transform",
  });

  const frame = document.createElement("div");
  applyStyles(frame, {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    whiteSpace: "nowrap",
  });

  const blurBackdrop = document.createElement("div");
  applyStyles(blurBackdrop, {
    position: "absolute",
    inset: "-12px -20px",
    background: `radial-gradient(ellipse at center, ${accentColor} 0%, rgba(20, 24, 31, 0.24) 38%, rgba(20, 24, 31, 0.08) 68%, rgba(20, 24, 31, 0) 100%)`,
    backdropFilter: "blur(10px) saturate(1.08) brightness(1.14)",
    maskImage:
      "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.98) 0%, rgba(0, 0, 0, 0.72) 46%, rgba(0, 0, 0, 0.18) 76%, rgba(0, 0, 0, 0) 100%)",
    pointerEvents: "none",
  });
  blurBackdrop.style.setProperty(
    "-webkit-backdrop-filter",
    "blur(10px) saturate(1.08) brightness(1.14)"
  );
  blurBackdrop.style.setProperty(
    "-webkit-mask-image",
    "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.98) 0%, rgba(0, 0, 0, 0.72) 46%, rgba(0, 0, 0, 0.18) 76%, rgba(0, 0, 0, 0) 100%)"
  );

  const text = document.createElement("span");
  text.dataset.previewLineLabelText = "true";
  applyStyles(text, {
    position: "relative",
    color: "rgba(255, 255, 255, 0.98)",
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "1",
    letterSpacing: "0.01em",
    whiteSpace: "nowrap",
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.72), 0 0 10px rgba(0, 0, 0, 0.22)",
  });

  frame.append(blurBackdrop, text);
  element.appendChild(frame);
  return element;
};

export const createSegmentLineLabels = (): PreviewSegmentLineLabelElements => ({
  direct: createLineLabel("rgba(255, 255, 255, 0.34)"),
  vertical: createLineLabel("rgba(111, 168, 255, 0.54)"),
  horizontal: createLineLabel("rgba(188, 194, 102, 0.5)"),
});

export const hideLineLabels = (
  lineLabels: PreviewSegmentLineLabelElements
) => {
  lineLabels.direct.style.display = "none";
  lineLabels.vertical.style.display = "none";
  lineLabels.horizontal.style.display = "none";
};

export const createPointMarker = () => {
  const marker = document.createElement("div");
  applyStyles(marker, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    width: `${runtimeMeasurementVisualDefaults.sizes.previewPointPixelSize}px`,
    height: `${runtimeMeasurementVisualDefaults.sizes.previewPointPixelSize}px`,
    borderRadius: "999px",
    border: `${runtimeMeasurementVisualDefaults.sizes.pointOutlineWidth}px solid ${runtimeMeasurementVisualDefaults.colors.surface}`,
    background: runtimeMeasurementVisualDefaults.colors.preview,
    transform: "translate(-50%, -50%)",
    boxSizing: "border-box",
    pointerEvents: "none",
    willChange: "transform",
  });
  return marker;
};

export const ensurePointMarkerCount = ({
  overlayLayer,
  pointMarkers,
  count,
}: {
  overlayLayer: HTMLElement;
  pointMarkers: PreviewPointMarker[];
  count: number;
}) => {
  while (pointMarkers.length < count) {
    const marker = createPointMarker();
    pointMarkers.push(marker);
    overlayLayer.appendChild(marker);
  }
};

export const hidePointMarkers = (
  pointMarkers: readonly PreviewPointMarker[]
) => {
  pointMarkers.forEach((pointMarker) => {
    pointMarker.style.display = "none";
  });
};

export const placePointMarkers = ({
  scene,
  overlayLayer,
  pointMarkers,
  coordinates,
}: {
  scene: RuntimeScene;
  overlayLayer: HTMLElement;
  pointMarkers: PreviewPointMarker[];
  coordinates: readonly RuntimeCoordinate[];
}) => {
  ensurePointMarkerCount({
    overlayLayer,
    pointMarkers,
    count: coordinates.length,
  });

  coordinates.forEach((coordinate, index) => {
    const marker = pointMarkers[index];
    if (!marker) {
      return;
    }

    const screenPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      cartesian3FromGeographicCoordinate(coordinate)
    );
    if (!defined(screenPosition)) {
      marker.style.display = "none";
      return;
    }

    marker.style.display = "block";
    marker.style.transform = `translate(${Math.round(
      screenPosition.x
    )}px, ${Math.round(screenPosition.y)}px) translate(-50%, -50%)`;
  });

  pointMarkers.slice(coordinates.length).forEach((marker) => {
    marker.style.display = "none";
  });
};

export const coordinatesEqual = (
  left: readonly RuntimeCoordinate[],
  right: readonly RuntimeCoordinate[]
) =>
  left.length === right.length &&
  left.every((coordinate, index) => {
    const otherCoordinate = right[index];
    return (
      otherCoordinate !== undefined &&
      coordinate.longitude === otherCoordinate.longitude &&
      coordinate.latitude === otherCoordinate.latitude &&
      coordinate.altitude === otherCoordinate.altitude
    );
  });

const resolveLabelOffsetPosition = ({
  start,
  end,
  outsideReferencePoint,
}: {
  start: ScreenPointLike;
  end: ScreenPointLike;
  outsideReferencePoint?: ScreenPointLike | null;
}) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distancePx = Math.hypot(deltaX, deltaY);
  if (
    !Number.isFinite(distancePx) ||
    distancePx < PREVIEW_LINE_LABEL_MIN_LENGTH_PX
  ) {
    return null;
  }

  const midX = (start.x + end.x) * 0.5;
  const midY = (start.y + end.y) * 0.5;
  let normalX = -deltaY / distancePx;
  let normalY = deltaX / distancePx;

  if (outsideReferencePoint) {
    const dotWithNormal =
      (outsideReferencePoint.x - midX) * normalX +
      (outsideReferencePoint.y - midY) * normalY;
    if (dotWithNormal < 0) {
      normalX = -normalX;
      normalY = -normalY;
    }
  }

  return {
    x: midX + normalX * PREVIEW_LINE_LABEL_OFFSET_PX,
    y: midY + normalY * PREVIEW_LINE_LABEL_OFFSET_PX,
    angleDeg: normalizeLabelAngleDeg((Math.atan2(deltaY, deltaX) * 180) / Math.PI),
  };
};

export const applyLineLabel = ({
  element,
  text,
  start,
  end,
  outsideReferencePoint,
}: {
  element: HTMLDivElement;
  text: string;
  start: ScreenPointLike;
  end: ScreenPointLike;
  outsideReferencePoint?: ScreenPointLike | null;
}) => {
  const labelPosition = resolveLabelOffsetPosition({
    start,
    end,
    outsideReferencePoint,
  });
  if (!labelPosition) {
    element.style.display = "none";
    return;
  }

  const textElement = element.querySelector(
    '[data-preview-line-label-text="true"]'
  );
  if (textElement instanceof HTMLSpanElement) {
    textElement.textContent = text;
  } else {
    element.textContent = text;
  }
  element.style.display = "block";
  element.style.transform = `translate(${Math.round(
    labelPosition.x
  )}px, ${Math.round(labelPosition.y)}px) translate(-50%, -50%) rotate(${labelPosition.angleDeg}deg)`;
};

const clampPreviewReferenceDistance = (value: number) =>
  Math.min(
    PREVIEW_LABEL_REFERENCE_MAX_DISTANCE_PX,
    Math.max(PREVIEW_LABEL_REFERENCE_MIN_DISTANCE_PX, value)
  );

const resolveOutsideReferencePoint = ({
  start,
  end,
  insidePoint,
  previousOutsideSign,
}: {
  start: ScreenPointLike;
  end: ScreenPointLike;
  insidePoint: ScreenPointLike;
  previousOutsideSign?: -1 | 1;
}) => {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lineLength = Math.hypot(deltaX, deltaY);
  if (!Number.isFinite(lineLength) || lineLength <= 1e-3) {
    return null;
  }

  const midX = (start.x + end.x) * 0.5;
  const midY = (start.y + end.y) * 0.5;
  const normalX = -deltaY / lineLength;
  const normalY = deltaX / lineLength;
  const insideDot =
    (insidePoint.x - midX) * normalX + (insidePoint.y - midY) * normalY;
  const suggestedOutsideSign: -1 | 1 = insideDot >= 0 ? -1 : 1;
  const outsideSign =
    previousOutsideSign &&
    previousOutsideSign !== suggestedOutsideSign &&
    Math.abs(insideDot) < PREVIEW_LABEL_SIDE_SWITCH_THRESHOLD_PX
      ? previousOutsideSign
      : suggestedOutsideSign;
  const referenceDistancePx = clampPreviewReferenceDistance(lineLength * 0.2);

  return {
    outsideSign,
    referencePoint: {
      x: midX + normalX * outsideSign * referenceDistancePx,
      y: midY + normalY * outsideSign * referenceDistancePx,
    } as CssPixelPosition,
  };
};

export const buildPreviewDistanceTriangleLabelReferences = ({
  anchor,
  target,
  aux,
  anchorAltitudeMeters,
  targetAltitudeMeters,
  previousVerticalOutsideSign,
}: {
  anchor: ScreenPointLike;
  target: ScreenPointLike;
  aux: ScreenPointLike;
  anchorAltitudeMeters: number;
  targetAltitudeMeters: number;
  previousVerticalOutsideSign?: -1 | 1;
}): PreviewDistanceTriangleLabelReferences => {
  const anchorPosition = { x: anchor.x, y: anchor.y } as CssPixelPosition;
  const targetPosition = { x: target.x, y: target.y } as CssPixelPosition;
  const auxPosition = { x: aux.x, y: aux.y } as CssPixelPosition;
  const highest =
    anchorAltitudeMeters >= targetAltitudeMeters ? anchorPosition : targetPosition;
  const triangle: DistanceScreenTriangle = {
    anchor: anchorPosition,
    target: targetPosition,
    aux: auxPosition,
    highest,
    centroid: {
      x: (anchorPosition.x + targetPosition.x + auxPosition.x) / 3,
      y: (anchorPosition.y + targetPosition.y + auxPosition.y) / 3,
    } as CssPixelPosition,
  };
  const insidePoint = buildDistanceTriangleInsidePoint2D({
    triangle,
    auxiliaryAltitudeMeters: targetAltitudeMeters,
    highestAltitudeMeters: Math.max(anchorAltitudeMeters, targetAltitudeMeters),
    insideBlendFactor: PREVIEW_LABEL_REFERENCE_INSIDE_BLEND_FACTOR,
  });
  const directReference = resolveOutsideReferencePoint({
    start: anchorPosition,
    end: targetPosition,
    insidePoint,
  });
  const horizontalReference = resolveOutsideReferencePoint({
    start: auxPosition,
    end: targetPosition,
    insidePoint,
  });
  const verticalReference = resolveOutsideReferencePoint({
    start: anchorPosition,
    end: auxPosition,
    insidePoint: targetPosition,
    previousOutsideSign: previousVerticalOutsideSign,
  });

  return {
    directOutsideReferencePoint: directReference?.referencePoint ?? null,
    verticalOutsideReferencePoint: verticalReference?.referencePoint ?? null,
    horizontalOutsideReferencePoint: horizontalReference?.referencePoint ?? null,
    nextVerticalOutsideSign: verticalReference?.outsideSign,
  };
};

export const createPreviewSegmentScratch = (): PreviewSegmentScratch => ({
  cartographicA: new Cartographic(),
  cartographicB: new Cartographic(),
  auxiliaryPoint: new Cartesian3(),
  auxiliaryScreen: new Cartesian2(),
});

export const buildAuxiliaryPoint = ({
  scene,
  anchorPointECEF,
  targetPointECEF,
  scratch,
}: {
  scene: RuntimeScene;
  anchorPointECEF: Cartesian3;
  targetPointECEF: Cartesian3;
  scratch: PreviewSegmentScratch;
}) => {
  const ellipsoid = scene.globe.ellipsoid;
  const anchorCartographic = ellipsoid.cartesianToCartographic(
    anchorPointECEF,
    scratch.cartographicA
  );
  const targetCartographic = ellipsoid.cartesianToCartographic(
    targetPointECEF,
    scratch.cartographicB
  );
  if (!anchorCartographic || !targetCartographic) {
    return null;
  }

  return Cartesian3.fromRadians(
    anchorCartographic.longitude,
    anchorCartographic.latitude,
    targetCartographic.height ?? 0,
    ellipsoid,
    scratch.auxiliaryPoint
  );
};

export const runtimeCoordinateFromCartesian = (
  coordinateECEF: Cartesian3
): RuntimeCoordinate => {
  const coordinateWgs84 = getDegreesFromCartesian(coordinateECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

export const buildVerticalAreaLoopCoordinates = ({
  firstCorner,
  oppositeCorner,
}: {
  firstCorner: RuntimeCoordinate;
  oppositeCorner: RuntimeCoordinate;
}) => {
  const firstCornerECEF = cartesian3FromGeographicCoordinate(firstCorner);
  const oppositeCornerECEF = cartesian3FromGeographicCoordinate(oppositeCorner);
  const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
    firstCornerECEF,
    oppositeCornerECEF
  );
  if (!verticalCorners) {
    return null;
  }

  return [
    firstCornerECEF,
    verticalCorners.adjacentHorizontalCorner,
    oppositeCornerECEF,
    verticalCorners.adjacentVerticalCorner,
    firstCornerECEF,
  ] as const;
};
