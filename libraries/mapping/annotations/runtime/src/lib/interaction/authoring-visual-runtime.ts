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
import { buildVerticalRectangleCornerFromDiagonal } from "@carma-mapping/annotations/core";
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
  registerCesiumScenePickExclusionResolver,
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
  annotationVisualDefaults,
  annotationVisualStyles,
  type PointMarkerVisualStyle,
} from "../config/annotation-visual-defaults";
import {
  annotationLineLabelPlacementDefaults,
  annotationLineLabelDefaults,
  resolveAnnotationLineLabelOptions,
  type PartialAnnotationLineLabelOptions,
} from "../config/annotation-line-label-options";
import { annotationOverlayDefaults } from "../config/annotation-overlay-defaults";
import type { CesiumGeographicCoordinate } from "../store";
import type { Scene } from "@carma-cesium";
import {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayContainer,
  type AnnotationOverlayGroup,
} from "./annotation-overlay-mount.shared";
import {
  TEXT_OVERLAY_AREA_LABEL_STYLE,
  createTextOverlayElement,
  setTextOverlayText,
} from "../render/text-overlay";

import "./annotation-overlay-line-label.css";

export {
  annotationOverlayDefaults,
  type AnnotationOverlayDefaults,
} from "../config/annotation-overlay-defaults";
export {
  ANNOTATION_OVERLAY_GROUP,
  resolveAnnotationOverlayContainer,
  type AnnotationOverlayGroup,
} from "./annotation-overlay-mount.shared";

export type AuthoringLineRuntime = {
  polyline: Polyline;
  colorCss: string;
};

export type AuthoringSegmentLineLabels = {
  direct: HTMLDivElement;
  vertical: HTMLDivElement;
  horizontal: HTMLDivElement;
};

export type AuthoringAreaLabelState = {
  text: string;
  screenPosition: CssPixelPosition | null;
};

export type AuthoringAreaLabelController = {
  setState: (state: AuthoringAreaLabelState | null) => void;
  clear: () => void;
  destroy: () => void;
};

export type AnnotationGeometryScratch = {
  cartographicA: Cartographic;
  cartographicB: Cartographic;
  auxiliaryPoint: Cartesian3;
  auxiliaryScreen: Cartesian2;
};

export type DistanceTriangleComponentLabelVisibility = {
  showVerticalLabel: boolean;
  showHorizontalLabel: boolean;
};

type ScreenPointLike = {
  x: number;
  y: number;
};

type AnnotationLineLabelKind = "direct" | "vertical" | "horizontal";
type AnnotationLineLabelAnchor = "center" | "left" | "right";

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

export const applyStyles = (
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) => {
  Object.assign(element.style, styles);
};

const lineLabelDomDefaults = Object.freeze({
  className: "carma-annotation-overlay-line-label",
  frameClassName: "carma-annotation-overlay-line-label__frame",
});
const ANNOTATION_LINE_LABEL_PLACEMENT_OPTIONS_BY_KIND: Record<
  AnnotationLineLabelKind,
  LineLabelPlacementOptions
> = Object.freeze({
  direct: {
    labelOffsetPx: annotationOverlayDefaults.lineLabelOffsetPx,
  },
  vertical: {
    labelOffsetPx: annotationOverlayDefaults.lineLabelOffsetPx,
    labelFlippedBaselineOffsetPx:
      annotationLineLabelPlacementDefaults.verticalFlippedBaselineOffsetPx,
    labelRotationMode: SVG_LINE_LABEL_ROTATION_MODE.CLOCKWISE,
  },
  horizontal: {
    labelOffsetPx: annotationOverlayDefaults.lineLabelOffsetPx,
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

const resolveAnnotationLineLabelUsesShortEdgeRules = (
  element: HTMLDivElement
) => resolveAnnotationLineLabelKind(element) === "vertical";

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

export const destroyAnnotationOverlayLayer = (
  overlayLayer: HTMLElement | null
) => {
  overlayLayer?.remove();
};

export const createLineCollection = (scene: Scene) => {
  const collection = new PolylineCollection();
  scene.primitives.add(collection);
  lineCollectionPickExclusionCleanupByCollection.set(
    collection,
    registerCesiumScenePickExclusionResolver(scene, () => [collection])
  );
  return collection;
};

const lineCollectionPickExclusionCleanupByCollection = new WeakMap<
  PolylineCollection,
  () => void
>();

export const destroyLineCollection = (
  scene: Scene,
  collection: PolylineCollection | null
) => {
  if (!collection) {
    return;
  }

  lineCollectionPickExclusionCleanupByCollection.get(collection)?.();
  lineCollectionPickExclusionCleanupByCollection.delete(collection);
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
): AuthoringLineRuntime => ({
  polyline: collection.add({
    id,
    positions: [Cartesian3.ZERO, Cartesian3.ZERO],
    width: options?.width ?? annotationOverlayDefaults.lineStrokeWidthPx,
    material: createLineRuntimeMaterial(colorCss),
    show: false,
  }),
  colorCss,
});

export const setLineRuntimeColor = (
  lineRuntime: AuthoringLineRuntime,
  colorCss: string
) => {
  if (lineRuntime.colorCss === colorCss) {
    return;
  }

  lineRuntime.polyline.material = createLineRuntimeMaterial(colorCss);
  lineRuntime.colorCss = colorCss;
};

export const clearLineRuntime = (lineRuntime: AuthoringLineRuntime) => {
  lineRuntime.polyline.show = false;
};

export const applyLineRuntime = (
  lineRuntime: AuthoringLineRuntime,
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
  const element = createHtmlElement("div", lineLabelDomDefaults.className);
  const frame = createHtmlElement("div", lineLabelDomDefaults.frameClassName);
  const textOverlay = createTextOverlayElement({
    accentColor,
    visualOptions: resolvedVisualOptions,
  });
  element.dataset.annotationOverlayLineLabelShortEdgeOffsetPx = String(
    resolvedVisualOptions.layout.shortEdgeOffsetPx
  );
  frame.append(textOverlay);
  element.appendChild(frame);
  return element;
};

export const createSegmentLineLabels = (
  visualOptions?: PartialAnnotationLineLabelOptions
): AuthoringSegmentLineLabels => {
  const resolvedVisualOptions =
    resolveAnnotationLineLabelOptions(visualOptions);

  const direct = createLineLabel(
    annotationVisualDefaults.colors.componentLabelAccents.direct,
    resolvedVisualOptions
  );
  direct.dataset.annotationOverlayLineLabelKind = "direct";

  const vertical = createLineLabel(
    annotationVisualDefaults.colors.componentLabelAccents.vertical,
    resolvedVisualOptions
  );
  vertical.dataset.annotationOverlayLineLabelKind = "vertical";

  const horizontal = createLineLabel(
    annotationVisualDefaults.colors.componentLabelAccents.horizontal,
    resolvedVisualOptions
  );
  horizontal.dataset.annotationOverlayLineLabelKind = "horizontal";

  return {
    direct,
    vertical,
    horizontal,
  };
};

export const applyAreaLabel = (
  element: HTMLDivElement,
  state: AuthoringAreaLabelState | null
) => {
  if (!state?.screenPosition) {
    element.style.display = "none";
    return;
  }

  setTextOverlayText(element, state.text);
  element.style.display = "inline-grid";
  element.style.transform = `translate(${Math.round(
    state.screenPosition.x
  )}px, ${Math.round(state.screenPosition.y)}px) translate(-50%, -50%)`;
};

export const createAreaLabelController = ({
  overlayLayer,
  accentColor,
  visualOptions,
}: {
  overlayLayer: HTMLElement | null;
  accentColor: string;
  visualOptions?: PartialAnnotationLineLabelOptions;
}): AuthoringAreaLabelController => {
  const element = createTextOverlayElement({
    accentColor,
    visualOptions: resolveAnnotationLineLabelOptions(visualOptions),
    styleOptions: TEXT_OVERLAY_AREA_LABEL_STYLE,
  });
  element.dataset.annotationOverlayLineLabelKind = "area";
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    display: "none",
    willChange: "transform",
  });
  overlayLayer?.appendChild(element);

  return {
    setState: (state) => applyAreaLabel(element, state),
    clear: () => applyAreaLabel(element, null),
    destroy: () => element.remove(),
  };
};

export const hideLineLabels = (lineLabels: AuthoringSegmentLineLabels) => {
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
  style: PointMarkerVisualStyle = annotationVisualStyles.point
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
  style = annotationVisualStyles.point,
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
    sideSwitchThresholdPx:
      annotationLineLabelPlacementDefaults.sideHysteresisPx,
  });
  if (!sharedPlacement) {
    return null;
  }

  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  if (
    useShortEdgeRules &&
    sharedPlacement.lineLengthPx <
      annotationOverlayDefaults.lineLabelMinLengthPx
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

  setTextOverlayText(element, text);

  element.style.display = "block";

  element.dataset.annotationOverlayLineLabelShortEdge =
    labelPosition.isShortEdge ? "true" : "false";
  element.dataset.annotationOverlayLineLabelAnchorRatio = `${labelPosition.anchorRatio}`;
  element.dataset.annotationOverlayLineLabelNormalFlip =
    labelPosition.shouldFlip ? "1" : "0";
  element.style.transform = resolveAnnotationLineLabelTransform(labelPosition);
};

export const resolveDistanceTriangleComponentLabelVisibility = ({
  directLabelText,
  verticalLabelText,
  horizontalLabelText,
}: {
  directLabelText: string;
  verticalLabelText: string | null;
  horizontalLabelText: string | null;
}): DistanceTriangleComponentLabelVisibility => ({
  showVerticalLabel:
    verticalLabelText !== null && verticalLabelText !== directLabelText,
  showHorizontalLabel:
    horizontalLabelText !== null && horizontalLabelText !== directLabelText,
});

export const createAnnotationGeometryScratch =
  (): AnnotationGeometryScratch => ({
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
  scratch: AnnotationGeometryScratch;
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
