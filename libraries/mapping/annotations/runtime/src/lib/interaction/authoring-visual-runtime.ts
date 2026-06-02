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
  annotationLineLabelPlacementDefaults,
  annotationLineLabelDefaults,
  resolveAnnotationLineLabelOptions,
  type PartialAnnotationLineLabelOptions,
  type AnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import {
  ANNOTATION_THEME_STYLE,
  type AnnotationThemeStyle,
} from "../config/annotation-theme-style";
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

type AnnotationLineLabelAnchor = "center" | "left" | "right";
type AnnotationLineLabelKind = "direct" | "vertical" | "horizontal";

type AnnotationLineLabelPlacement = {
  x: CssPixels;
  y: CssPixels;
  angleRad: Radians;
  anchor: AnnotationLineLabelAnchor;
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

const lineLabelDomDefaults = Object.freeze({
  className: "carma-annotation-overlay-line-label",
  frameClassName: "carma-annotation-overlay-line-label__frame",
  contentClassName: "carma-annotation-overlay-line-label__content",
  backdropClassName: "carma-annotation-overlay-line-label__backdrop",
  surfaceClassName: "carma-annotation-overlay-line-label__surface",
  textEchoClassName: "carma-annotation-overlay-line-label__text-echo",
  textClassName: "carma-annotation-overlay-line-label__text",
});
const ANNOTATION_LINE_LABEL_SHARED_STYLE_DEFAULTS = Object.freeze({
  framePaddingBlockEx: 0.25,
  framePaddingInlineEx: 0.65,
  backdropInsetBlockEx: -0.35,
  backdropInsetInlineEx: -0.75,
});
const ANNOTATION_THEME_STYLE_BACKDROP_RGB: Readonly<
  Record<AnnotationThemeStyle, string>
> = Object.freeze({
  [ANNOTATION_THEME_STYLE.BRIGHT_ON_DARK]: "15, 23, 42",
  [ANNOTATION_THEME_STYLE.DARK_ON_BRIGHT]: "255, 255, 255",
});
const ANNOTATION_LINE_LABEL_PLACEMENT_OPTIONS_BY_KIND: Record<
  AnnotationLineLabelKind,
  LineLabelPlacementOptions
> = Object.freeze({
  direct: {},
  vertical: {
    labelOffsetPx: previewControllerDefaults.lineLabelOffsetPx,
    labelFlippedBaselineOffsetPx:
      annotationLineLabelPlacementDefaults.verticalFlippedBaselineOffsetPx,
    labelRotationMode: SVG_LINE_LABEL_ROTATION_MODE.CLOCKWISE,
  },
  horizontal: {
    labelOffsetPx: annotationLineLabelPlacementDefaults.horizontalLabelOffsetPx,
  },
});

const createHtmlElement = <T extends keyof HTMLElementTagNameMap>(
  tagName: T,
  className: string
) => {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
};

const applyAnnotationLineLabelOptions = ({
  element,
  backdrop,
  surface,
  accentColor,
  visualOptions,
}: {
  element: HTMLDivElement;
  backdrop: HTMLDivElement;
  surface: HTMLDivElement;
  accentColor: string;
  visualOptions: AnnotationLineLabelOptions;
}) => {
  element.style.setProperty(
    "--carma-annotation-overlay-line-label-font-family",
    visualOptions.text.fontFamily
  );
  element.style.setProperty(
    "--carma-annotation-overlay-line-label-font-weight",
    String(visualOptions.text.fontWeight)
  );
  element.style.setProperty(
    "--carma-annotation-overlay-line-label-glow-color",
    accentColor
  );
  element.dataset.annotationOverlayLineLabelShortEdgeOffsetPx = String(
    visualOptions.layout.shortEdgeOffsetPx
  );
  element.dataset.annotationThemeStyle =
    visualOptions.appearance.themeStyle;
  element.dataset.annotationOverlayLineLabelBackgroundStyle =
    visualOptions.background.style;
  backdrop.dataset.annotationOverlayLineLabelBackgroundStyle =
    visualOptions.background.style;

  if (
    typeof visualOptions.background.surfaceAlpha === "number" &&
    Number.isFinite(visualOptions.background.surfaceAlpha) &&
    !(
      typeof visualOptions.background.color === "string" &&
      visualOptions.background.color.trim().length > 0
    )
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-backdrop-background",
      `rgba(${ANNOTATION_THEME_STYLE_BACKDROP_RGB[visualOptions.appearance.themeStyle]}, ${Math.min(
        Math.max(visualOptions.background.surfaceAlpha, 0),
        1
      )})`
    );
  }

  if (visualOptions.background.showBackdrop === false) {
    backdrop.style.display = "none";
    surface.style.display = "none";
  } else {
    backdrop.style.display = "block";
    surface.style.display = "block";
  }

  if (
    typeof visualOptions.text.color === "string" &&
    visualOptions.text.color.trim().length > 0
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-text-color",
      visualOptions.text.color
    );
  }

  if (
    typeof visualOptions.text.blendMode === "string" &&
    visualOptions.text.blendMode.trim().length > 0
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-text-blend-mode",
      visualOptions.text.blendMode
    );
  }

  if (
    typeof visualOptions.background.color === "string" &&
    visualOptions.background.color.trim().length > 0
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-backdrop-background",
      visualOptions.background.color
    );
  }

  if (
    typeof visualOptions.background.blendMode === "string" &&
    visualOptions.background.blendMode.trim().length > 0
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-backdrop-blend-mode",
      visualOptions.background.blendMode
    );
  }

  if (
    typeof visualOptions.surface.blendMode === "string" &&
    visualOptions.surface.blendMode.trim().length > 0
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-surface-blend-mode",
      visualOptions.surface.blendMode
    );
  }

  if (
    typeof visualOptions.text.echo?.color === "string" &&
    visualOptions.text.echo.color.trim().length > 0
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-text-echo-color",
      visualOptions.text.echo.color
    );
  }

  if (
    typeof visualOptions.text.echo?.blendMode === "string" &&
    visualOptions.text.echo.blendMode.trim().length > 0
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-text-echo-blend-mode",
      visualOptions.text.echo.blendMode
    );
  }

  if (
    typeof visualOptions.text.echo?.blurPx === "number" &&
    Number.isFinite(visualOptions.text.echo.blurPx)
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-text-echo-blur-px",
      `${Math.max(visualOptions.text.echo.blurPx, 0)}px`
    );
  }

  if (
    typeof visualOptions.text.echo?.opacity === "number" &&
    Number.isFinite(visualOptions.text.echo.opacity)
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-text-echo-opacity",
      `${Math.min(Math.max(visualOptions.text.echo.opacity, 0), 1)}`
    );
  }

  if (
    typeof visualOptions.background.blurPx === "number" &&
    Number.isFinite(visualOptions.background.blurPx)
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-surface-blur-px",
      `${Math.max(visualOptions.background.blurPx, 0)}px`
    );
  }

  if (
    typeof visualOptions.background.brightnessPct === "number" &&
    Number.isFinite(visualOptions.background.brightnessPct)
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-surface-brightness-pct",
      `${Math.max(visualOptions.background.brightnessPct, 0)}%`
    );
  }

  if (
    typeof visualOptions.background.saturatePct === "number" &&
    Number.isFinite(visualOptions.background.saturatePct)
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-surface-saturate-pct",
      `${Math.max(visualOptions.background.saturatePct, 0)}%`
    );
  }

  if (
    typeof visualOptions.background.radiusEx === "number" &&
    Number.isFinite(visualOptions.background.radiusEx)
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-backdrop-radius",
      `${Math.max(visualOptions.background.radiusEx, 0)}ex`
    );
  }

  if (
    typeof visualOptions.background.edgeBlurPx === "number" &&
    Number.isFinite(visualOptions.background.edgeBlurPx)
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-surface-edge-blur-px",
      `${Math.max(visualOptions.background.edgeBlurPx, 0)}px`
    );
  }

  if (
    typeof visualOptions.surface.paddingBlockEx === "number" ||
    typeof visualOptions.surface.paddingInlineEx === "number"
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-frame-padding-block",
      `${
        typeof visualOptions.surface.paddingBlockEx === "number" &&
        Number.isFinite(visualOptions.surface.paddingBlockEx)
          ? Math.max(visualOptions.surface.paddingBlockEx, 0)
          : ANNOTATION_LINE_LABEL_SHARED_STYLE_DEFAULTS.framePaddingBlockEx
      }ex`
    );
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-frame-padding-inline",
      `${
        typeof visualOptions.surface.paddingInlineEx === "number" &&
        Number.isFinite(visualOptions.surface.paddingInlineEx)
          ? Math.max(visualOptions.surface.paddingInlineEx, 0)
          : ANNOTATION_LINE_LABEL_SHARED_STYLE_DEFAULTS.framePaddingInlineEx
      }ex`
    );
  }

  if (
    typeof visualOptions.background.insetBlockEx === "number" ||
    typeof visualOptions.background.insetInlineEx === "number"
  ) {
    element.style.setProperty(
      "--carma-annotation-overlay-line-label-backdrop-inset",
      `${
        typeof visualOptions.background.insetBlockEx === "number" &&
        Number.isFinite(visualOptions.background.insetBlockEx)
          ? visualOptions.background.insetBlockEx
          : ANNOTATION_LINE_LABEL_SHARED_STYLE_DEFAULTS.backdropInsetBlockEx
      }ex ${
        typeof visualOptions.background.insetInlineEx === "number" &&
        Number.isFinite(visualOptions.background.insetInlineEx)
          ? visualOptions.background.insetInlineEx
          : ANNOTATION_LINE_LABEL_SHARED_STYLE_DEFAULTS.backdropInsetInlineEx
      }ex`
    );
  }
};

const resolveAnnotationLineLabelTextElement = (element: HTMLDivElement) =>
  element.querySelector(
    '[data-annotation-overlay-line-label-text="foreground"]'
  ) as HTMLElement | null;

const resolveAnnotationLineLabelTextEchoElement = (element: HTMLDivElement) =>
  element.querySelector(
    '[data-annotation-overlay-line-label-text-echo="true"]'
  ) as HTMLElement | null;

const resolveAnnotationLineLabelFrameElement = (element: HTMLDivElement) =>
  element.querySelector(
    `.${lineLabelDomDefaults.frameClassName}`
  ) as HTMLDivElement | null;

const resolveAnnotationLineLabelShortEdgeOffsetPx = (
  element: HTMLDivElement
): number => {
  const rawValue = element.dataset.annotationOverlayLineLabelShortEdgeOffsetPx;
  const parsedValue = rawValue ? Number(rawValue) : Number.NaN;

  return Number.isFinite(parsedValue)
    ? parsedValue
    : annotationLineLabelDefaults.layout.shortEdgeOffsetPx;
};

const resolveAnnotationLineLabelKind = (
  element: HTMLDivElement
): AnnotationLineLabelKind =>
  element.dataset.annotationOverlayLineLabelKind === "vertical" ||
  element.dataset.annotationOverlayLineLabelKind === "horizontal"
    ? element.dataset.annotationOverlayLineLabelKind
    : "direct";

const resolveAnnotationLineLabelUsesShortEdgeRules = (element: HTMLDivElement) =>
  resolveAnnotationLineLabelKind(element) === "vertical";

const resolveAnnotationLineLabelPlacementOptions = ({
  kind,
  outsideReferencePoint,
  anchorRatio,
}: {
  kind: AnnotationLineLabelKind;
  outsideReferencePoint?: ScreenPointLike | null;
  anchorRatio?: number;
}): LineLabelPlacementOptions => ({
  ...ANNOTATION_LINE_LABEL_PLACEMENT_OPTIONS_BY_KIND[kind],
  anchorRatio:
    anchorRatio === undefined ? undefined : clampUnitRangeRatio(anchorRatio),
  getLabelOutsideReferencePoint: outsideReferencePoint
    ? () => ({
        x: outsideReferencePoint.x as CssPixelPosition["x"],
        y: outsideReferencePoint.y as CssPixelPosition["y"],
      })
    : undefined,
});

const resolveAnnotationLineLabelTransform = ({
  x,
  y,
  angleRad,
  anchor,
}: AnnotationLineLabelPlacement) =>
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
  visualOptions?: PartialAnnotationLineLabelOptions
) => {
  const resolvedVisualOptions =
    resolveAnnotationLineLabelOptions(visualOptions);
  const element = createHtmlElement(
    "div",
    lineLabelDomDefaults.className
  );
  const frame = createHtmlElement(
    "div",
    lineLabelDomDefaults.frameClassName
  );
  const content = createHtmlElement(
    "div",
    lineLabelDomDefaults.contentClassName
  );
  const blurBackdrop = createHtmlElement(
    "div",
    lineLabelDomDefaults.backdropClassName
  );
  const surface = createHtmlElement(
    "div",
    lineLabelDomDefaults.surfaceClassName
  );
  const textEcho = createHtmlElement(
    "div",
    lineLabelDomDefaults.textEchoClassName
  );
  const text = createHtmlElement(
    "div",
    lineLabelDomDefaults.textClassName
  );
  textEcho.dataset.annotationOverlayLineLabelTextEcho = "true";
  text.dataset.annotationOverlayLineLabelText = "foreground";
  applyAnnotationLineLabelOptions({
    element,
    backdrop: blurBackdrop,
    surface,
    accentColor,
    visualOptions: resolvedVisualOptions,
  });
  content.append(blurBackdrop, surface, textEcho, text);
  frame.append(content);
  element.appendChild(frame);
  return element;
};

export const createSegmentLineLabels = (
  visualOptions?: PartialAnnotationLineLabelOptions
): PreviewSegmentLineLabelElements => {
  const resolvedVisualOptions =
    resolveAnnotationLineLabelOptions(visualOptions);

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

const normalizeReadableAnnotationLineLabelAngleRad = (
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

const resolveAnnotationLineLabelVerticalBaselineAngleRad = ({
  angleRad,
  lineSide,
}: {
  angleRad: Radians;
  lineSide: "left" | "right";
}): Radians => {
  if (
    Math.abs(Math.abs(angleRad) - PI_OVER_TWO) >
    annotationLineLabelPlacementDefaults.verticalBaselineAngleEpsilonRad
  ) {
    return angleRad;
  }

  return (lineSide === "left" ? PI_OVER_TWO : -PI_OVER_TWO) as Radians;
};

const resolveAnnotationLineLabelAngleRad = ({
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

  return resolveAnnotationLineLabelVerticalBaselineAngleRad({
    angleRad: normalizeReadableAnnotationLineLabelAngleRad(preferredAngleRad),
    lineSide,
  });
};

const resolveLabelOffsetPosition = ({
  start,
  end,
  kind,
  outsideReferencePoint,
  shortEdgeOffsetPx = annotationLineLabelDefaults.layout.shortEdgeOffsetPx,
  useShortEdgeRules = true,
  flipReadingDirection = false,
  previousShouldFlip = false,
  anchorRatio,
}: {
  start: ScreenPointLike;
  end: ScreenPointLike;
  kind: AnnotationLineLabelKind;
  outsideReferencePoint?: ScreenPointLike | null;
  shortEdgeOffsetPx?: number;
  useShortEdgeRules?: boolean;
  flipReadingDirection?: boolean;
  previousShouldFlip?: boolean;
  anchorRatio?: number;
}): AnnotationLineLabelPlacement | null => {
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
    options: resolveAnnotationLineLabelPlacementOptions({
      kind,
      outsideReferencePoint,
      anchorRatio,
    }),
    previousShouldFlip,
    sideSwitchThresholdPx: annotationLineLabelPlacementDefaults.sideHysteresisPx,
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
      angleRad: resolveAnnotationLineLabelAngleRad({
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
    kind: resolveAnnotationLineLabelKind(element),
    outsideReferencePoint,
    shortEdgeOffsetPx: resolveAnnotationLineLabelShortEdgeOffsetPx(element),
    useShortEdgeRules: resolveAnnotationLineLabelUsesShortEdgeRules(element),
    flipReadingDirection,
    anchorRatio,
    previousShouldFlip:
      element.dataset.annotationOverlayLineLabelNormalFlip === "1",
  });
  if (!labelPosition) {
    element.style.display = "none";
    return;
  }

  const textElement = resolveAnnotationLineLabelTextElement(element);
  if (textElement instanceof HTMLElement) {
    textElement.textContent = text;
  } else {
    element.textContent = text;
  }
  const textEchoElement = resolveAnnotationLineLabelTextEchoElement(element);
  if (textEchoElement instanceof HTMLElement) {
    textEchoElement.textContent = text;
  }

  element.style.display = "block";

  const frameElement = resolveAnnotationLineLabelFrameElement(element);
  const upperSideGapBoostPx =
    !labelPosition.isShortEdge &&
    labelPosition.normalY <
      -annotationLineLabelPlacementDefaults.upperSideGapNormalYEpsilon &&
    frameElement
      ? frameElement.getBoundingClientRect().height *
        annotationLineLabelPlacementDefaults.upperSideGapFactor
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
  element.style.transform = resolveAnnotationLineLabelTransform({
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
