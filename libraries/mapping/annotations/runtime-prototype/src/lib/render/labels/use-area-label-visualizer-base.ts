import { createElement, useCallback, useEffect, useMemo, useRef } from "react";
import {
  computePolygonCentroid2D,
  type NodeChainAnnotation,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  computePointLabelLayout,
  POINT_LABEL_THEME_DEFAULTS,
  resolvePointLabelLayoutConfig,
  useLabelOverlay,
  type LayoutPointInput,
} from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";
import {
  type AreaLabelViewProjector,
  type PolygonAreaLabelOverlayBaseOptions,
} from "./area-label-visualizer.types";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
} = ANNOTATION_TYPES;

const POLYGON_PREVIEW_PADDING_PX = 6;
const POLYGON_STRIPE_SIZE_PX = 6;
const POLYGON_STRIPE_WIDTH_PX = 1.5;
const POLYGON_OVERLAY_MAX_BOUNDS_SCALE = 2.5;
const POLYGON_AREA_PILL_FONT_SIZE_PX = 12;
const POLYGON_AREA_PILL_FONT_FAMILY = "Arial, sans-serif";
const POLYGON_AREA_PILL_FONT_WEIGHT = "400";
const POLYGON_AREA_PILL_BACKGROUND =
  POINT_LABEL_THEME_DEFAULTS.textBackgroundColor;
const POLYGON_AREA_PILL_SELECTED_BACKGROUND =
  POINT_LABEL_THEME_DEFAULTS.selectedBackgroundColor;
const POLYGON_AREA_PILL_TEXT_COLOR = "#111111";
const POLYGON_AREA_PILL_BORDER = "1px solid rgba(255, 255, 255, 0.95)";
const POLYGON_AREA_PILL_COMPACT_DIAMETER_EM = 1.9;
const POLYGON_AREA_PILL_COMPACT_HORIZONTAL_PADDING_PX = 6;
const POLYGON_AREA_PILL_EXTENDED_VERTICAL_PADDING_PX = 0;
const POLYGON_AREA_PILL_EXTENDED_HORIZONTAL_PADDING_PX = 8;
const POLYGON_AREA_PILL_COMPACT_GAP_PX = 4;
const POLYGON_AREA_LABEL_LAYOUT_CONFIG = resolvePointLabelLayoutConfig({
  placementOrder: ["center"],
  stemDistance: 0,
  pitchResponsiveAngle: false,
  dynamicLabelPlacement: true,
  dynamicLabelPlacementConfig: {
    iterations: 0,
    step: 0,
    maxDelta: 0,
    springStrength: 0,
    repulsionBase: 0,
    minDistance: 0,
    maxDistance: 0,
    viewportAdjustmentStep: 0,
  },
});

const clampToRange = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const isFiniteScreenPoint = (
  point: CssPixelPosition | null | undefined
): point is CssPixelPosition =>
  Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y);

const getPolygonStripeColor = (type: NodeChainAnnotation["type"]): string => {
  if (type === ANNOTATION_TYPE_AREA_VERTICAL)
    return "rgba(111, 168, 255, 0.35)";
  if (type === ANNOTATION_TYPE_AREA_GROUND) return "rgba(107, 188, 123, 0.35)";
  if (type === ANNOTATION_TYPE_AREA_PLANAR) return "rgba(239, 223, 145, 0.35)";
  return "rgba(239, 223, 145, 0.35)";
};

const buildPolygonPreviewContent = (group: NodeChainAnnotation) => {
  const patternId = `stripe-${group.id}`;
  const stripeColor = getPolygonStripeColor(group.type);
  const isGroundSurface = group.type === ANNOTATION_TYPE_AREA_GROUND;

  return createElement(
    "div",
    {
      style: {
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      },
    },
    createElement(
      "svg",
      {
        width: "100%",
        height: "100%",
        style: {
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "visible",
          pointerEvents: "none",
        },
      },
      createElement(
        "defs",
        null,
        createElement(
          "pattern",
          {
            id: patternId,
            width: POLYGON_STRIPE_SIZE_PX,
            height: POLYGON_STRIPE_SIZE_PX,
            patternUnits: "userSpaceOnUse",
            patternTransform: "rotate(45)",
          },
          createElement("line", {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: POLYGON_STRIPE_SIZE_PX,
            stroke: stripeColor,
            strokeWidth: POLYGON_STRIPE_WIDTH_PX,
          })
        )
      ),
      createElement("polygon", {
        "data-polygon-preview-shape": "true",
        fill: "none",
        stroke: "none",
        strokeWidth: 0,
        style: { pointerEvents: "none" },
      }),
      createElement("polygon", {
        "data-polygon-preview-stripe": "true",
        fill: isGroundSurface ? "none" : `url(#${patternId})`,
        stroke: "none",
        style: {
          pointerEvents: "none",
          mixBlendMode: "multiply",
        },
      })
    ),
    createElement(
      "div",
      {
        "data-polygon-preview-area-pill": "true",
        style: {
          position: "absolute",
          left: "0px",
          top: "0px",
          transform: "translate(-50%, -50%)",
          display: "none",
          alignItems: "center",
          boxSizing: "border-box",
          borderRadius: "999px",
          border: POLYGON_AREA_PILL_BORDER,
          backgroundColor: POLYGON_AREA_PILL_BACKGROUND,
          color: POLYGON_AREA_PILL_TEXT_COLOR,
          fontSize: `${POLYGON_AREA_PILL_FONT_SIZE_PX}px`,
          fontFamily: POLYGON_AREA_PILL_FONT_FAMILY,
          fontWeight: POLYGON_AREA_PILL_FONT_WEIGHT,
          minHeight: `${POLYGON_AREA_PILL_COMPACT_DIAMETER_EM}em`,
          whiteSpace: "nowrap",
          userSelect: "none",
          pointerEvents: "none",
        },
      },
      createElement("span", {
        "data-polygon-preview-area-pill-compact": "true",
        style: {
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          minWidth: `${POLYGON_AREA_PILL_COMPACT_DIAMETER_EM}em`,
          height: `${POLYGON_AREA_PILL_COMPACT_DIAMETER_EM}em`,
          padding: `0 ${POLYGON_AREA_PILL_COMPACT_HORIZONTAL_PADDING_PX}px`,
          borderRadius: "999px",
          border: POLYGON_AREA_PILL_BORDER,
          boxSizing: "border-box",
          lineHeight: 1,
        },
      }),
      createElement("span", {
        "data-polygon-preview-area-pill-extended": "true",
        style: {
          display: "inline-flex",
          alignItems: "center",
          padding: `${POLYGON_AREA_PILL_EXTENDED_VERTICAL_PADDING_PX}px ${POLYGON_AREA_PILL_EXTENDED_HORIZONTAL_PADDING_PX}px`,
          lineHeight: 1.2,
        },
      })
    )
  );
};

type PolygonAreaLabelLayoutResult = {
  collapsedToCompact: Set<string>;
  hiddenByLayout: Set<string>;
};

const createEmptyPolygonAreaLabelLayoutResult =
  (): PolygonAreaLabelLayoutResult => ({
    collapsedToCompact: new Set<string>(),
    hiddenByLayout: new Set<string>(),
  });

const toMatrixCacheKey = (matrix: readonly number[]) =>
  matrix.map((value) => value.toFixed(6)).join(",");

type Cartesian3Like = { x: number; y: number; z: number };

export const useAreaLabelVisualizerBase = (
  viewProjector: AreaLabelViewProjector,
  polygonPreviewGroups: readonly {
    group: NodeChainAnnotation;
    vertexPoints: Cartesian3Like[];
  }[],
  {
    overlayPrefix,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    resolveAreaLabelText,
  }: PolygonAreaLabelOverlayBaseOptions
) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const overlayIdsRef = useRef<string[]>([]);
  const areaLabelLayoutCacheRef = useRef<{
    cacheKey: string | null;
    result: PolygonAreaLabelLayoutResult;
  }>({
    cacheKey: null,
    result: createEmptyPolygonAreaLabelLayoutResult(),
  });
  const relevantGroups = useMemo(
    () => polygonPreviewGroups,
    [polygonPreviewGroups]
  );

  const polygonPreviewContent = useCallback(
    (group: NodeChainAnnotation) => buildPolygonPreviewContent(group),
    []
  );
  const computeAreaLabelLayoutResult = useCallback(() => {
    const viewportState = viewProjector.getViewState();
    if (!viewportState) {
      return createEmptyPolygonAreaLabelLayoutResult();
    }

    const viewportWidth = Math.max(1, viewportState.width);
    const viewportHeight = Math.max(1, viewportState.height);

    const layoutPoints: LayoutPointInput[] = [];
    relevantGroups.forEach(({ group, vertexPoints }, index) => {
      const screenPoints = vertexPoints
        .map((point) => viewProjector.projectWorldToScreen(point))
        .filter(isFiniteScreenPoint);
      if (screenPoints.length < 3) return;

      const centroidAnchor = computePolygonCentroid2D(screenPoints);
      if (!centroidAnchor) return;

      const { primaryText, secondaryText } = resolveAreaLabelText(
        group,
        vertexPoints
      );
      const areaText = secondaryText
        ? `${primaryText} ${secondaryText}`
        : primaryText;
      const compactText =
        polygonAreaBadgeByGroupId[group.id]?.text?.trim() ?? "";

      layoutPoints.push({
        id: group.id,
        anchor: centroidAnchor,
        text: areaText,
        compactText: compactText.length > 0 ? compactText : undefined,
        index,
        layoutPriority: group.id === focusedPolygonGroupId ? 2 : 1,
      });
    });

    if (layoutPoints.length === 0) {
      return createEmptyPolygonAreaLabelLayoutResult();
    }

    const layoutResult = computePointLabelLayout({
      points: layoutPoints,
      viewportWidth,
      viewportHeight,
      cameraPitch: viewportState.cameraPitch,
      config: POLYGON_AREA_LABEL_LAYOUT_CONFIG,
    });

    return {
      collapsedToCompact: layoutResult.collapsedToCompact,
      hiddenByLayout: layoutResult.hiddenByLayout,
    };
  }, [
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    viewProjector,
    relevantGroups,
  ]);

  const getViewCacheKey = useCallback(() => {
    const frameNumber = viewProjector.getViewState()?.frameNumber ?? null;
    if (frameNumber !== null) {
      return `frame:${frameNumber}`;
    }

    const viewProjectionMatrix = viewProjector.getViewProjectionMatrix();
    if (!viewProjectionMatrix) {
      return null;
    }

    return `matrix:${toMatrixCacheKey(viewProjectionMatrix)}`;
  }, [viewProjector]);

  const getAreaLabelLayoutResult = useCallback(() => {
    const cacheKey = getViewCacheKey();
    const cached = areaLabelLayoutCacheRef.current;
    if (cacheKey !== null && cached.cacheKey === cacheKey) {
      return cached.result;
    }

    const result = computeAreaLabelLayoutResult();
    areaLabelLayoutCacheRef.current = {
      cacheKey,
      result,
    };
    return result;
  }, [computeAreaLabelLayoutResult, getViewCacheKey]);

  useEffect(() => {
    overlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    overlayIdsRef.current = [];

    if (!viewProjector.getViewState()) {
      return;
    }

    const nextOverlayIds: string[] = [];

    relevantGroups.forEach(({ group, vertexPoints }) => {
      const overlayId = `${overlayPrefix}-${group.id}`;

      addLabelOverlayElement({
        id: overlayId,
        zIndex: 4,
        content: polygonPreviewContent(group),
        updatePosition: (elementDiv) => {
          const viewportState = viewProjector.getViewState();
          if (!viewportState) return false;

          const screenPoints = vertexPoints
            .map((point) => viewProjector.projectWorldToScreen(point))
            .filter(isFiniteScreenPoint);

          if (screenPoints.length < 3) return false;

          const minX = Math.min(...screenPoints.map((point) => point.x));
          const maxX = Math.max(...screenPoints.map((point) => point.x));
          const minY = Math.min(...screenPoints.map((point) => point.y));
          const maxY = Math.max(...screenPoints.map((point) => point.y));

          const width = Math.max(
            1,
            maxX - minX + POLYGON_PREVIEW_PADDING_PX * 2
          );
          const height = Math.max(
            1,
            maxY - minY + POLYGON_PREVIEW_PADDING_PX * 2
          );
          const canvasWidth = Math.max(1, viewportState.width);
          const canvasHeight = Math.max(1, viewportState.height);

          if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width > canvasWidth * POLYGON_OVERLAY_MAX_BOUNDS_SCALE ||
            height > canvasHeight * POLYGON_OVERLAY_MAX_BOUNDS_SCALE
          ) {
            return false;
          }

          const localPoints = screenPoints.map(
            (point) =>
              ({
                x: point.x - minX + POLYGON_PREVIEW_PADDING_PX,
                y: point.y - minY + POLYGON_PREVIEW_PADDING_PX,
              } as CssPixelPosition)
          );
          const pointsAttr = localPoints
            .map((point) => `${point.x},${point.y}`)
            .join(" ");

          const polygonEl = elementDiv.querySelector(
            '[data-polygon-preview-shape="true"]'
          ) as SVGPolygonElement | null;
          if (!polygonEl) return false;
          polygonEl.setAttribute("points", pointsAttr);

          const stripeEl = elementDiv.querySelector(
            '[data-polygon-preview-stripe="true"]'
          ) as SVGPolygonElement | null;
          if (stripeEl) {
            stripeEl.setAttribute("points", pointsAttr);
          }

          const areaPillEl = elementDiv.querySelector(
            '[data-polygon-preview-area-pill="true"]'
          ) as HTMLDivElement | null;
          const areaPillCompactEl = elementDiv.querySelector(
            '[data-polygon-preview-area-pill-compact="true"]'
          ) as HTMLSpanElement | null;
          const areaPillExtendedEl = elementDiv.querySelector(
            '[data-polygon-preview-area-pill-extended="true"]'
          ) as HTMLSpanElement | null;

          if (areaPillEl && areaPillExtendedEl) {
            const layoutResult = getAreaLabelLayoutResult();
            if (layoutResult.hiddenByLayout.has(group.id)) {
              areaPillEl.style.display = "none";
              elementDiv.style.position = "absolute";
              elementDiv.style.left = `${minX - POLYGON_PREVIEW_PADDING_PX}px`;
              elementDiv.style.top = `${minY - POLYGON_PREVIEW_PADDING_PX}px`;
              elementDiv.style.width = `${width}px`;
              elementDiv.style.height = `${height}px`;
              elementDiv.style.transform = "none";
              elementDiv.style.pointerEvents = "none";
              elementDiv.style.zIndex = "4";
              return true;
            }

            const { primaryText, secondaryText } = resolveAreaLabelText(
              group,
              vertexPoints
            );
            const compactBadge = polygonAreaBadgeByGroupId[group.id];
            const compactBadgeText = compactBadge?.text?.trim() ?? "";
            const collapsedByLayout = layoutResult.collapsedToCompact.has(
              group.id
            );
            const isSelectedGroup = group.id === focusedPolygonGroupId;
            const areaText = secondaryText
              ? `${primaryText} ${secondaryText}`
              : primaryText;

            areaPillExtendedEl.textContent = areaText;
            if (areaPillCompactEl) {
              if (compactBadgeText.length > 0) {
                areaPillCompactEl.style.display = "inline-flex";
                areaPillCompactEl.textContent = compactBadgeText;
                areaPillCompactEl.style.backgroundColor = isSelectedGroup
                  ? POLYGON_AREA_PILL_SELECTED_BACKGROUND
                  : compactBadge?.backgroundColor ??
                    POLYGON_AREA_PILL_BACKGROUND;
                areaPillCompactEl.style.color = isSelectedGroup
                  ? POLYGON_AREA_PILL_TEXT_COLOR
                  : compactBadge?.textColor ?? POLYGON_AREA_PILL_TEXT_COLOR;
              } else {
                areaPillCompactEl.style.display = "none";
                areaPillCompactEl.textContent = "";
              }
            }
            areaPillExtendedEl.style.display = collapsedByLayout
              ? "none"
              : "inline-flex";

            const centroidAnchor = computePolygonCentroid2D(localPoints);
            if (!centroidAnchor) {
              areaPillEl.style.display = "none";
            } else {
              const clampedAnchor = {
                x: clampToRange(centroidAnchor.x, 0, width),
                y: clampToRange(centroidAnchor.y, 0, height),
              } as CssPixelPosition;
              areaPillEl.style.display = "inline-flex";
              areaPillEl.style.left = `${clampedAnchor.x}px`;
              areaPillEl.style.top = `${clampedAnchor.y}px`;
              areaPillEl.style.backgroundColor = isSelectedGroup
                ? POLYGON_AREA_PILL_SELECTED_BACKGROUND
                : POLYGON_AREA_PILL_BACKGROUND;
              areaPillEl.style.color = POLYGON_AREA_PILL_TEXT_COLOR;
              areaPillEl.style.paddingLeft =
                collapsedByLayout || compactBadgeText.length > 0
                  ? "0px"
                  : "8px";
              areaPillEl.style.paddingRight = collapsedByLayout ? "0px" : "8px";
              areaPillEl.style.gap = collapsedByLayout
                ? "0px"
                : compactBadgeText.length > 0
                ? `${POLYGON_AREA_PILL_COMPACT_GAP_PX}px`
                : "0px";
            }
          }

          elementDiv.style.position = "absolute";
          elementDiv.style.left = `${minX - POLYGON_PREVIEW_PADDING_PX}px`;
          elementDiv.style.top = `${minY - POLYGON_PREVIEW_PADDING_PX}px`;
          elementDiv.style.width = `${width}px`;
          elementDiv.style.height = `${height}px`;
          elementDiv.style.transform = "none";
          elementDiv.style.pointerEvents = "none";
          elementDiv.style.zIndex = "4";

          return true;
        },
      });

      nextOverlayIds.push(overlayId);
    });

    overlayIdsRef.current = nextOverlayIds;

    return () => {
      nextOverlayIds.forEach((overlayId) => {
        removeLabelOverlayElement(overlayId);
      });
      overlayIdsRef.current = [];
    };
  }, [
    addLabelOverlayElement,
    getAreaLabelLayoutResult,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    polygonPreviewContent,
    relevantGroups,
    removeLabelOverlayElement,
    resolveAreaLabelText,
    viewProjector,
    overlayPrefix,
  ]);
};
