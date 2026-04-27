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
  type DistanceScreenTriangle,
} from "@carma-mapping/annotations/core";
import { SVG_LINE_LABEL_ROTATION_MODE } from "@carma-commons/svg";
import {
  resolveOverlayLineLabelPlacement,
  type LineLabelPlacementOptions,
} from "@carma-providers/label-overlay";
import {
  cartesian3FromGeographicCoordinate,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";
import {
  clampUnitRangeRatio,
  negativePiToPi,
  PI,
  PI_OVER_TWO,
  type CssPixels,
  type CssPixelPosition,
  type Ratio,
  type Radians,
} from "@carma-units";

import {
  measurementVisualDefaults,
  measurementVisualStyles,
  type PointMarkerVisualStyle,
} from "../config/measurement-visual-defaults";
import {
  previewLineLabelPlacementDefaults,
  previewLineLabelVisualDefaults,
  resolvePreviewLineLabelVisualOptions,
  type PreviewLineLabelVisualOptions,
} from "../config/preview-line-label-visual-defaults";
import {
  previewControllerDefaults,
  type PreviewControllerOptions,
} from "../config/preview-controller-defaults";
import type { CesiumGeographicCoordinate } from "../store";
import type { Scene } from "@carma-cesium";
import {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayContainer,
  type AnnotationOverlayGroup,
} from "./preview-overlay-mount.shared";

import "./annotation-overlay-line-label.css";

export {
  previewControllerDefaults,
  type PreviewControllerOptions,
} from "../config/preview-controller-defaults";
export {
  ANNOTATION_OVERLAY_GROUP,
  PREVIEW_OVERLAY_GROUP,
  resolveAnnotationOverlayContainer,
  resolvePreviewContainer,
  type AnnotationOverlayGroup,
  type PreviewOverlayGroup,
} from "./preview-overlay-mount.shared";

export type PreviewLineRuntime = {
  polyline: Polyline;
  colorCss: string;
};

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

export type PreviewDistanceTriangleComponentLabelVisibility = {
  showVerticalLabel: boolean;
  showHorizontalLabel: boolean;
};

type ScreenPointLike = {
  x: number;
  y: number;
};

type PreviewLineLabelAnchor = "center" | "left" | "right";
type PreviewLineLabelKind = "direct" | "vertical" | "horizontal";

type PreviewLineLabelPlacement = {
  x: CssPixels;
  y: CssPixels;
  angleRad: Radians;
  anchor: PreviewLineLabelAnchor;
  anchorRatio: Ratio;
  isShortEdge: boolean;
  shouldFlip: boolean;
  normalX: number;
  normalY: number;
};

type PreviewLineCollectionFrameState = {
  passes: {
    pick: boolean;
    render: boolean;
  };
};

export const applyStyles = (
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) => {
  Object.assign(element.style, styles);
};

const previewLineLabelDomDefaults = Object.freeze({
  className: "carma-annotation-overlay-line-label",
  frameClassName: "carma-annotation-overlay-line-label__frame",
  backdropClassName: "carma-annotation-overlay-line-label__backdrop",
  textClassName: "carma-annotation-overlay-line-label__text",
});
const PREVIEW_LINE_LABEL_PLACEMENT_OPTIONS_BY_KIND: Record<
  PreviewLineLabelKind,
  LineLabelPlacementOptions
> = Object.freeze({
  direct: {},
  vertical: {
    labelOffsetPx: previewControllerDefaults.lineLabelOffsetPx,
    labelFlippedBaselineOffsetPx:
      previewLineLabelPlacementDefaults.verticalFlippedBaselineOffsetPx,
    labelRotationMode: SVG_LINE_LABEL_ROTATION_MODE.CLOCKWISE,
  },
  horizontal: {},
});

const createHtmlElement = <T extends keyof HTMLElementTagNameMap>(
  tagName: T,
  className: string
) => {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
};

const applyPreviewLineLabelVisualOptions = ({
  element,
  backdrop,
  accentColor,
  visualOptions,
}: {
  element: HTMLDivElement;
  backdrop: HTMLDivElement;
  accentColor: string;
  visualOptions: PreviewLineLabelVisualOptions;
}) => {
  element.style.setProperty(
    "--carma-annotation-overlay-line-label-font-family",
    visualOptions.fontFamily
  );
  element.style.setProperty(
    "--carma-annotation-overlay-line-label-font-weight",
    String(visualOptions.fontWeight)
  );
  element.style.setProperty(
    "--carma-annotation-overlay-line-label-glow-color",
    accentColor
  );
  element.dataset.annotationOverlayLineLabelShortEdgeOffsetPx = String(
    visualOptions.shortEdgeOffsetPx
  );
  element.dataset.annotationOverlayLineLabelTheme = visualOptions.theme;
  backdrop.dataset.annotationOverlayLineLabelBackgroundStyle =
    visualOptions.backgroundStyle;
};

const resolvePreviewLineLabelTextElement = (element: HTMLDivElement) =>
  element.querySelector(
    '[data-annotation-overlay-line-label-text="true"]'
  ) as HTMLSpanElement | null;

const resolvePreviewLineLabelFrameElement = (element: HTMLDivElement) =>
  element.querySelector(
    `.${previewLineLabelDomDefaults.frameClassName}`
  ) as HTMLDivElement | null;

const resolvePreviewLineLabelShortEdgeOffsetPx = (
  element: HTMLDivElement
): number => {
  const rawValue = element.dataset.annotationOverlayLineLabelShortEdgeOffsetPx;
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;

  return Number.isFinite(parsedValue)
    ? parsedValue
    : previewLineLabelVisualDefaults.shortEdgeOffsetPx;
};

const resolvePreviewLineLabelKind = (
  element: HTMLDivElement
): PreviewLineLabelKind =>
  element.dataset.annotationOverlayLineLabelKind === "vertical" ||
  element.dataset.annotationOverlayLineLabelKind === "horizontal"
    ? element.dataset.annotationOverlayLineLabelKind
    : "direct";

const resolvePreviewLineLabelUsesShortEdgeRules = (element: HTMLDivElement) =>
  resolvePreviewLineLabelKind(element) === "vertical";

const resolvePreviewLineLabelPlacementOptions = ({
  kind,
  outsideReferencePoint,
  anchorRatio,
}: {
  kind: PreviewLineLabelKind;
  outsideReferencePoint?: ScreenPointLike | null;
  anchorRatio?: number;
}): LineLabelPlacementOptions => ({
  ...PREVIEW_LINE_LABEL_PLACEMENT_OPTIONS_BY_KIND[kind],
  anchorRatio:
    anchorRatio === undefined ? undefined : clampUnitRangeRatio(anchorRatio),
  getLabelOutsideReferencePoint: outsideReferencePoint
    ? () => ({
        x: outsideReferencePoint.x as CssPixelPosition["x"],
        y: outsideReferencePoint.y as CssPixelPosition["y"],
      })
    : undefined,
});

const resolvePreviewLineLabelTransform = ({
  x,
  y,
  angleRad,
  anchor,
}: PreviewLineLabelPlacement) =>
  `translate(${Math.round(x)}px, ${Math.round(y)}px) ${
    anchor === "left"
      ? "translate(0%, -50%)"
      : anchor === "right"
      ? "translate(-100%, -50%)"
      : "translate(-50%, -50%)"
  } rotate(${angleRad}rad)`;

export const createAnnotationOverlayLayer = (
  scene: Scene,
  layerId: string,
  group: AnnotationOverlayGroup = ANNOTATION_OVERLAY_GROUP.LABEL
) => {
  const container = resolveAnnotationOverlayContainer(scene, group);
  if (!container) {
    return null;
  }

  const overlayLayer = document.createElement("div");
  overlayLayer.id = layerId;
  overlayLayer.dataset.annotationOverlayLayer = "true";
  applyStyles(overlayLayer, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    pointerEvents: "none",
    userSelect: "none",
    webkitUserSelect: "none",
    zIndex: "auto",
  });
  container.appendChild(overlayLayer);
  return overlayLayer;
};

export const createPreviewOverlayLayer = createAnnotationOverlayLayer;

export const createAnnotationOverlayLayers = (
  scene: Scene,
  layerIdByGroup: Partial<Record<AnnotationOverlayGroup, string>>
): Partial<Record<AnnotationOverlayGroup, HTMLDivElement | null>> =>
  Object.fromEntries(
    Object.entries(layerIdByGroup).map(([group, layerId]) => [
      group,
      layerId
        ? createAnnotationOverlayLayer(
            scene,
            layerId,
            group as AnnotationOverlayGroup
          )
        : null,
    ])
  ) as Partial<Record<AnnotationOverlayGroup, HTMLDivElement | null>>;

export const createPreviewOverlayLayers = createAnnotationOverlayLayers;

export const destroyAnnotationOverlayLayer = (
  overlayLayer: HTMLElement | null
) => {
  overlayLayer?.remove();
};

export const destroyPreviewOverlayLayer = destroyAnnotationOverlayLayer;

export const createLineCollection = (scene: Scene) => {
  const collection = new PolylineCollection();
  const originalUpdate = collection.update.bind(collection) as (
    frameState: PreviewLineCollectionFrameState
  ) => void;
  collection.update = ((frameState: PreviewLineCollectionFrameState) => {
    if (frameState.passes.pick && !frameState.passes.render) {
      return;
    }

    return originalUpdate(frameState);
  }) as typeof collection.update;
  scene.primitives.add(collection);
  return collection;
};

export const destroyLineCollection = (
  scene: Scene,
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

const createLineRuntimeMaterial = (colorCss: string) =>
  Material.fromType("Color", {
    color: Color.fromCssColorString(colorCss) ?? Color.WHITE,
  });

export const createLineRuntime = (
  collection: PolylineCollection,
  id: string,
  colorCss: string,
  options?: {
    width?: number;
  }
): PreviewLineRuntime => ({
  polyline: collection.add({
    id,
    positions: [Cartesian3.ZERO, Cartesian3.ZERO],
    width: options?.width ?? previewControllerDefaults.lineStrokeWidthPx,
    material: createLineRuntimeMaterial(colorCss),
    show: false,
  }),
  colorCss,
});

export const setLineRuntimeColor = (
  lineRuntime: PreviewLineRuntime,
  colorCss: string
) => {
  if (lineRuntime.colorCss === colorCss) {
    return;
  }

  lineRuntime.polyline.material = createLineRuntimeMaterial(colorCss);
  lineRuntime.colorCss = colorCss;
};

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

export const createLineLabel = (
  accentColor: string,
  visualOptions?: Partial<PreviewLineLabelVisualOptions>
) => {
  const resolvedVisualOptions =
    resolvePreviewLineLabelVisualOptions(visualOptions);
  const element = createHtmlElement(
    "div",
    previewLineLabelDomDefaults.className
  );
  const frame = createHtmlElement(
    "div",
    previewLineLabelDomDefaults.frameClassName
  );
  const blurBackdrop = createHtmlElement(
    "div",
    previewLineLabelDomDefaults.backdropClassName
  );
  const text = createHtmlElement(
    "span",
    previewLineLabelDomDefaults.textClassName
  );
  text.dataset.annotationOverlayLineLabelText = "true";
  applyPreviewLineLabelVisualOptions({
    element,
    backdrop: blurBackdrop,
    accentColor,
    visualOptions: resolvedVisualOptions,
  });
  frame.append(blurBackdrop, text);
  element.appendChild(frame);
  return element;
};

export const createSegmentLineLabels = (
  visualOptions?: Partial<PreviewLineLabelVisualOptions>
): PreviewSegmentLineLabelElements => {
  const resolvedVisualOptions =
    resolvePreviewLineLabelVisualOptions(visualOptions);

  const direct = createLineLabel(
    measurementVisualDefaults.colors.componentLabelAccents.direct,
    resolvedVisualOptions
  );
  direct.dataset.annotationOverlayLineLabelKind = "direct";

  const vertical = createLineLabel(
    measurementVisualDefaults.colors.componentLabelAccents.vertical,
    resolvedVisualOptions
  );
  vertical.dataset.annotationOverlayLineLabelKind = "vertical";

  const horizontal = createLineLabel(
    measurementVisualDefaults.colors.componentLabelAccents.horizontal,
    resolvedVisualOptions
  );
  horizontal.dataset.annotationOverlayLineLabelKind = "horizontal";

  return {
    direct,
    vertical,
    horizontal,
  };
};

export const hideLineLabels = (lineLabels: PreviewSegmentLineLabelElements) => {
  lineLabels.direct.style.display = "none";
  lineLabels.vertical.style.display = "none";
  lineLabels.horizontal.style.display = "none";
};

const applyPointMarkerVisualStyle = (
  marker: HTMLDivElement,
  style: PointMarkerVisualStyle
) => {
  applyStyles(marker, {
    width: `${style.pixelSize}px`,
    height: `${style.pixelSize}px`,
    border: `${style.outlineWidth}px solid ${style.outline}`,
    background: style.fill,
  });
};

export const createPointMarker = (
  style: PointMarkerVisualStyle = measurementVisualStyles.point
) => {
  const marker = document.createElement("div");
  applyStyles(marker, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    borderRadius: "999px",
    transform: "translate(-50%, -50%)",
    boxSizing: "border-box",
    pointerEvents: "none",
    userSelect: "none",
    webkitUserSelect: "none",
    willChange: "transform",
  });
  applyPointMarkerVisualStyle(marker, style);
  return marker;
};

export const ensurePointMarkerCount = ({
  overlayLayer,
  pointMarkers,
  count,
  style,
}: {
  overlayLayer: HTMLElement;
  pointMarkers: HTMLDivElement[];
  count: number;
  style: PointMarkerVisualStyle;
}) => {
  while (pointMarkers.length < count) {
    const marker = createPointMarker(style);
    pointMarkers.push(marker);
    overlayLayer.appendChild(marker);
  }
};

export const hidePointMarkers = (pointMarkers: readonly HTMLDivElement[]) => {
  pointMarkers.forEach((pointMarker) => {
    pointMarker.style.display = "none";
  });
};

export const placePointMarkers = ({
  scene,
  overlayLayer,
  pointMarkers,
  coordinates,
  style = measurementVisualStyles.point,
}: {
  scene: Scene;
  overlayLayer: HTMLElement;
  pointMarkers: HTMLDivElement[];
  coordinates: readonly CesiumGeographicCoordinate[];
  style?: PointMarkerVisualStyle;
}) => {
  ensurePointMarkerCount({
    overlayLayer,
    pointMarkers,
    count: coordinates.length,
    style,
  });

  coordinates.forEach((coordinate, index) => {
    const marker = pointMarkers[index];
    if (!marker) {
      return;
    }

    applyPointMarkerVisualStyle(marker, style);
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
  left: readonly CesiumGeographicCoordinate[],
  right: readonly CesiumGeographicCoordinate[]
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

const normalizeLabelAngleRad = (angleRad: Radians): Radians =>
  negativePiToPi(
    (angleRad > PI_OVER_TWO || angleRad < -PI_OVER_TWO
      ? angleRad + PI
      : angleRad) as Radians
  );

const normalizeReadablePreviewLineLabelAngleRad = (
  angleRad: Radians
): Radians => {
  let normalizedAngleRad = negativePiToPi(angleRad);

  if (normalizedAngleRad > PI_OVER_TWO) {
    normalizedAngleRad = (normalizedAngleRad - PI) as Radians;
  } else if (normalizedAngleRad < -PI_OVER_TWO) {
    normalizedAngleRad = (normalizedAngleRad + PI) as Radians;
  }

  return normalizedAngleRad;
};

const resolvePreviewLineLabelVerticalBaselineAngleRad = ({
  angleRad,
  lineSide,
}: {
  angleRad: Radians;
  lineSide: "left" | "right";
}): Radians => {
  if (
    Math.abs(Math.abs(angleRad) - PI_OVER_TWO) >
    previewLineLabelPlacementDefaults.verticalBaselineAngleEpsilonRad
  ) {
    return angleRad;
  }

  return (lineSide === "left" ? PI_OVER_TWO : -PI_OVER_TWO) as Radians;
};

const resolvePreviewLineLabelAngleRad = ({
  deltaX,
  deltaY,
  lineSide,
  flipReadingDirection,
  forceHorizontal,
}: {
  deltaX: number;
  deltaY: number;
  lineSide: "left" | "right";
  flipReadingDirection: boolean;
  forceHorizontal: boolean;
}): Radians => {
  if (forceHorizontal) {
    return 0 as Radians;
  }

  const baseAngleRad = normalizeLabelAngleRad(
    Math.atan2(deltaY, deltaX) as Radians
  );
  const preferredAngleRad = flipReadingDirection
    ? ((baseAngleRad >= 0 ? baseAngleRad - PI : baseAngleRad + PI) as Radians)
    : baseAngleRad;

  return resolvePreviewLineLabelVerticalBaselineAngleRad({
    angleRad: normalizeReadablePreviewLineLabelAngleRad(preferredAngleRad),
    lineSide,
  });
};

const resolveLabelOffsetPosition = ({
  start,
  end,
  kind,
  outsideReferencePoint,
  shortEdgeOffsetPx = previewLineLabelVisualDefaults.shortEdgeOffsetPx,
  useShortEdgeRules = true,
  flipReadingDirection = false,
  previousShouldFlip = false,
  anchorRatio,
}: {
  start: ScreenPointLike;
  end: ScreenPointLike;
  kind: PreviewLineLabelKind;
  outsideReferencePoint?: ScreenPointLike | null;
  shortEdgeOffsetPx?: number;
  useShortEdgeRules?: boolean;
  flipReadingDirection?: boolean;
  previousShouldFlip?: boolean;
  anchorRatio?: number;
}): PreviewLineLabelPlacement | null => {
  const sharedPlacement = resolveOverlayLineLabelPlacement({
    svgLine: {
      start: {
        x: start.x as CssPixelPosition["x"],
        y: start.y as CssPixelPosition["y"],
      },
      end: {
        x: end.x as CssPixelPosition["x"],
        y: end.y as CssPixelPosition["y"],
      },
    },
    options: resolvePreviewLineLabelPlacementOptions({
      kind,
      outsideReferencePoint,
      anchorRatio,
    }),
    previousShouldFlip,
    sideSwitchThresholdPx: previewLineLabelPlacementDefaults.sideHysteresisPx,
  });
  if (!sharedPlacement) {
    return null;
  }

  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  if (
    useShortEdgeRules &&
    sharedPlacement.lineLengthPx <
      previewControllerDefaults.lineLabelMinLengthPx
  ) {
    const labelIsPlacedRightOfSegment = sharedPlacement.normalX >= 0;
    const lineSide = labelIsPlacedRightOfSegment ? "left" : "right";

    return {
      x: (sharedPlacement.midX +
        sharedPlacement.normalX * shortEdgeOffsetPx) as CssPixels,
      y: (sharedPlacement.midY +
        sharedPlacement.normalY * shortEdgeOffsetPx) as CssPixels,
      angleRad: resolvePreviewLineLabelAngleRad({
        deltaX,
        deltaY,
        lineSide,
        flipReadingDirection,
        forceHorizontal: true,
      }),
      anchor: labelIsPlacedRightOfSegment ? "left" : "right",
      anchorRatio: sharedPlacement.anchorRatio,
      isShortEdge: true,
      shouldFlip: sharedPlacement.shouldFlip,
      normalX: sharedPlacement.normalX,
      normalY: sharedPlacement.normalY,
    };
  }

  return {
    x: sharedPlacement.textX,
    y: sharedPlacement.textY,
    angleRad: sharedPlacement.angleRad,
    anchor: "center",
    anchorRatio: sharedPlacement.anchorRatio,
    isShortEdge: false,
    shouldFlip: sharedPlacement.shouldFlip,
    normalX: sharedPlacement.normalX,
    normalY: sharedPlacement.normalY,
  };
};

export const applyLineLabel = ({
  element,
  text,
  start,
  end,
  outsideReferencePoint,
  flipReadingDirection = false,
  anchorRatio,
}: {
  element: HTMLDivElement;
  text: string;
  start: ScreenPointLike;
  end: ScreenPointLike;
  outsideReferencePoint?: ScreenPointLike | null;
  flipReadingDirection?: boolean;
  anchorRatio?: number;
}) => {
  const labelPosition = resolveLabelOffsetPosition({
    start,
    end,
    kind: resolvePreviewLineLabelKind(element),
    outsideReferencePoint,
    shortEdgeOffsetPx: resolvePreviewLineLabelShortEdgeOffsetPx(element),
    useShortEdgeRules: resolvePreviewLineLabelUsesShortEdgeRules(element),
    flipReadingDirection,
    anchorRatio,
    previousShouldFlip:
      element.dataset.annotationOverlayLineLabelNormalFlip === "1",
  });
  if (!labelPosition) {
    element.style.display = "none";
    return;
  }

  const textElement = resolvePreviewLineLabelTextElement(element);
  if (textElement instanceof HTMLSpanElement) {
    textElement.textContent = text;
  } else {
    element.textContent = text;
  }

  const frameElement = resolvePreviewLineLabelFrameElement(element);
  const upperSideGapBoostPx =
    !labelPosition.isShortEdge &&
    labelPosition.normalY <
      -previewLineLabelPlacementDefaults.upperSideGapNormalYEpsilon &&
    frameElement
      ? frameElement.getBoundingClientRect().height *
        previewLineLabelPlacementDefaults.upperSideGapFactor
      : 0;

  const adjustedX = (labelPosition.x +
    labelPosition.normalX * upperSideGapBoostPx) as CssPixels;
  const adjustedY = (labelPosition.y +
    labelPosition.normalY * upperSideGapBoostPx) as CssPixels;

  element.dataset.annotationOverlayLineLabelShortEdge =
    labelPosition.isShortEdge ? "true" : "false";
  element.dataset.annotationOverlayLineLabelAnchorRatio = `${labelPosition.anchorRatio}`;
  element.dataset.annotationOverlayLineLabelNormalFlip =
    labelPosition.shouldFlip ? "1" : "0";
  element.style.display = "block";
  element.style.transform = resolvePreviewLineLabelTransform({
    ...labelPosition,
    x: adjustedX,
    y: adjustedY,
  });
};

const clampPreviewReferenceDistance = (value: number) =>
  Math.min(
    previewControllerDefaults.labelReferenceMaxDistancePx,
    Math.max(previewControllerDefaults.labelReferenceMinDistancePx, value)
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
  if (
    !Number.isFinite(lineLength) ||
    lineLength <= previewControllerDefaults.labelReferenceLineLengthEpsilonPx
  ) {
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
    Math.abs(insideDot) < previewControllerDefaults.labelSideSwitchThresholdPx
      ? previousOutsideSign
      : suggestedOutsideSign;
  const referenceDistancePx = clampPreviewReferenceDistance(
    lineLength * previewControllerDefaults.labelReferenceDistanceFactor
  );

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
    anchorAltitudeMeters >= targetAltitudeMeters
      ? anchorPosition
      : targetPosition;
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
    insideBlendFactor:
      previewControllerDefaults.labelReferenceInsideBlendFactor,
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
    horizontalOutsideReferencePoint:
      horizontalReference?.referencePoint ?? null,
    nextVerticalOutsideSign: verticalReference?.outsideSign,
  };
};

export const resolvePreviewDistanceTriangleComponentLabelVisibility = ({
  directLabelText,
  verticalLabelText,
  horizontalLabelText,
}: {
  directLabelText: string;
  verticalLabelText: string | null;
  horizontalLabelText: string | null;
}): PreviewDistanceTriangleComponentLabelVisibility => ({
  showVerticalLabel:
    verticalLabelText !== null && verticalLabelText !== directLabelText,
  showHorizontalLabel:
    horizontalLabelText !== null && horizontalLabelText !== directLabelText,
});

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
  scene: Scene;
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
): CesiumGeographicCoordinate => {
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
  firstCorner: CesiumGeographicCoordinate;
  oppositeCorner: CesiumGeographicCoordinate;
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
