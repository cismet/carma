import { createElement, useCallback, useEffect, useMemo, useRef } from "react";

import {
  Cartesian3,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  CoplanarPolygonGeometry,
  GeometryInstance,
  GroundPrimitive,
  PerInstanceColorAppearance,
  PolygonGeometry,
  PolygonHierarchy,
  Primitive,
  PrimitiveCollection,
  SceneTransforms,
  type Cartesian2,
  type Scene,
  defined,
} from "@carma/cesium";
import {
  computePointLabelLayout,
  POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  POINT_LABEL_TEXT_BACKGROUND_COLOR,
  resolvePointLabelLayoutConfig,
  useLabelOverlay,
  type LayoutPointInput,
} from "@carma-providers/label-overlay";

import { type PlanarPolygonGroup } from "../types/MeasurementTypes";
import {
  computePolygonCentroid2D,
  type ScreenPoint2D,
} from "../utils/distanceVisualization";
import { formatAreaAdaptive } from "../utils/formatting";
import {
  type GroundPolygonPreviewGroup,
  type PlanarPolygonPreviewGroup,
  type PolygonPreviewGroup,
  type VerticalPolygonPreviewGroup,
} from "./measurementPreviewVisuals";

type PolygonAreaBadge = {
  text: string;
  backgroundColor?: string;
  textColor?: string;
};

const POLYGON_PREVIEW_PADDING_PX = 6;
const POLYGON_FILL_ALPHA = 0.25;
const POLYGON_FILL_SELECTED_ALPHA = 0.35;
const POLYGON_STRIPE_SIZE_PX = 6;
const POLYGON_STRIPE_WIDTH_PX = 1.5;
const POLYGON_OVERLAY_MAX_BOUNDS_SCALE = 2.5;
const POLYGON_AREA_PILL_FONT_SIZE_PX = 12;
const POLYGON_AREA_PILL_FONT_FAMILY = "Arial, sans-serif";
const POLYGON_AREA_PILL_FONT_WEIGHT = "400";
const POLYGON_AREA_PILL_BACKGROUND = POINT_LABEL_TEXT_BACKGROUND_COLOR;
const POLYGON_AREA_PILL_SELECTED_BACKGROUND =
  POINT_LABEL_SELECTED_BACKGROUND_COLOR;
const POLYGON_AREA_PILL_TEXT_COLOR = "#111111";
const POLYGON_AREA_PILL_BORDER = "1px solid rgba(255, 255, 255, 0.95)";
const POLYGON_AREA_PILL_COMPACT_DIAMETER_EM = 1.9;
const POLYGON_AREA_PILL_COMPACT_HORIZONTAL_PADDING_PX = 6;
const POLYGON_AREA_PILL_EXTENDED_VERTICAL_PADDING_PX = 0;
const POLYGON_AREA_PILL_EXTENDED_HORIZONTAL_PADDING_PX = 8;
const POLYGON_AREA_PILL_COMPACT_GAP_PX = 4;
const POLYGON_AREA_LABEL_LAYOUT_CONFIG = resolvePointLabelLayoutConfig({
  placementOrder: ["bottomLeft"],
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

const getPolygonFillCesiumColor = (
  surfaceType: PlanarPolygonGroup["surfaceType"],
  isSelected: boolean
): Color => {
  const alpha = isSelected ? POLYGON_FILL_SELECTED_ALPHA : POLYGON_FILL_ALPHA;
  if (surfaceType === "facade") return new Color(0.44, 0.66, 1.0, alpha);
  if (surfaceType === "terrain") return new Color(0.42, 0.74, 0.48, alpha);
  if (surfaceType === "footprint")
    return new Color(
      0.89,
      0.91,
      0.94,
      isSelected ? POLYGON_FILL_SELECTED_ALPHA : POLYGON_FILL_ALPHA
    );
  return new Color(0.94, 0.87, 0.57, alpha); // roof
};

const getPolygonStripeColor = (
  surfaceType: PlanarPolygonGroup["surfaceType"]
): string => {
  if (surfaceType === "facade") return "rgba(111, 168, 255, 0.35)";
  if (surfaceType === "terrain") return "rgba(107, 188, 123, 0.35)";
  if (surfaceType === "footprint") return "rgba(226, 232, 240, 0.35)";
  return "rgba(239, 223, 145, 0.35)"; // roof
};

const getProjectedHorizontalAreaSquareMeters = (vertices: Cartesian3[]) => {
  if (vertices.length < 3) return 0;
  const basePoint = vertices[0];
  if (!basePoint) return 0;

  let area = 0;
  for (let index = 1; index < vertices.length - 1; index += 1) {
    const p1 = Cartesian3.subtract(
      vertices[index],
      basePoint,
      new Cartesian3()
    );
    const p2 = Cartesian3.subtract(
      vertices[index + 1],
      basePoint,
      new Cartesian3()
    );
    const cross = Cartesian3.cross(p1, p2, new Cartesian3());
    area += Cartesian3.magnitude(cross) * 0.5;
  }

  return Math.max(0, area);
};

const getPolygonAreaLabelText = (
  group: PlanarPolygonGroup,
  vertices: Cartesian3[]
) => {
  const planarArea = Math.max(0, group.areaSquareMeters ?? 0);
  const isFacadeSurface = (group.surfaceType ?? "roof") === "facade";
  const projectedHorizontalArea =
    getProjectedHorizontalAreaSquareMeters(vertices);
  const showProjectedHorizontalArea =
    !isFacadeSurface &&
    planarArea > 0 &&
    projectedHorizontalArea < planarArea * 0.99;

  return {
    planarText: formatAreaAdaptive(planarArea),
    projectedHorizontalText: showProjectedHorizontalArea
      ? `(${formatAreaAdaptive(projectedHorizontalArea)})`
      : null,
  };
};

const shouldHideAreaLabelInDirectPolylinePreview = (
  group: PlanarPolygonGroup,
  activePlanarPolygonGroupId: string | null
) => {
  const surfaceType = group.surfaceType ?? "roof";
  return (
    !group.closed &&
    group.id === activePlanarPolygonGroupId &&
    (surfaceType === "roof" || surfaceType === "footprint") &&
    (group.segmentLineMode ?? "components") === "direct"
  );
};

const buildPolygonPreviewContent = (group: PlanarPolygonGroup) => {
  const patternId = `stripe-${group.id}`;
  const stripeColor = getPolygonStripeColor(group.surfaceType);
  const isFootprintSurface = (group.surfaceType ?? "roof") === "footprint";

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
        fill: isFootprintSurface ? "none" : `url(#${patternId})`,
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

type UsePolygonAreaSurfaceVisualizerOptions = {
  overlayPrefix: string;
  scene: Scene | null;
  polygonPreviewGroups: PolygonPreviewGroup[];
  focusedPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PolygonAreaBadge>>;
};

const usePolygonAreaLabelOverlays = ({
  overlayPrefix,
  scene,
  polygonPreviewGroups,
  focusedPolygonGroupId,
  activePlanarPolygonGroupId,
  polygonAreaBadgeByGroupId,
}: UsePolygonAreaSurfaceVisualizerOptions) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const overlayIdsRef = useRef<string[]>([]);
  const areaLabelLayoutCacheRef = useRef<{
    frameNumber: number | null;
    result: PolygonAreaLabelLayoutResult;
  }>({
    frameNumber: null,
    result: createEmptyPolygonAreaLabelLayoutResult(),
  });
  const relevantGroups = useMemo(
    () => polygonPreviewGroups,
    [polygonPreviewGroups]
  );

  const polygonPreviewContent = useCallback(
    (group: PlanarPolygonGroup) => buildPolygonPreviewContent(group),
    []
  );
  const computeAreaLabelLayoutResult = useCallback(() => {
    if (!scene || scene.isDestroyed()) {
      return createEmptyPolygonAreaLabelLayoutResult();
    }

    const viewportWidth = Math.max(
      1,
      scene.canvas.clientWidth || scene.canvas.width || 1
    );
    const viewportHeight = Math.max(
      1,
      scene.canvas.clientHeight || scene.canvas.height || 1
    );

    const layoutPoints: LayoutPointInput[] = [];
    relevantGroups.forEach(({ group, vertexPoints }, index) => {
      if (
        shouldHideAreaLabelInDirectPolylinePreview(
          group,
          activePlanarPolygonGroupId
        )
      ) {
        return;
      }

      const screenPoints = vertexPoints
        .map((point) => SceneTransforms.worldToWindowCoordinates(scene, point))
        .filter(
          (point): point is Cartesian2 =>
            defined(point) &&
            Number.isFinite(point.x) &&
            Number.isFinite(point.y)
        );
      if (screenPoints.length < 3) return;

      const centroidAnchor = computePolygonCentroid2D(screenPoints);
      if (!centroidAnchor) return;

      const { planarText, projectedHorizontalText } = getPolygonAreaLabelText(
        group,
        vertexPoints
      );
      const areaText = projectedHorizontalText
        ? `${planarText} ${projectedHorizontalText}`
        : planarText;
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
      cameraPitch: scene.camera.pitch,
      config: POLYGON_AREA_LABEL_LAYOUT_CONFIG,
    });

    return {
      collapsedToCompact: layoutResult.collapsedToCompact,
      hiddenByLayout: layoutResult.hiddenByLayout,
    };
  }, [
    activePlanarPolygonGroupId,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    relevantGroups,
    scene,
  ]);
  const getSceneFrameNumber = useCallback(() => {
    const frameNumber = (
      scene as unknown as { frameState?: { frameNumber?: number } } | null
    )?.frameState?.frameNumber;
    return typeof frameNumber === "number" ? frameNumber : null;
  }, [scene]);
  const getAreaLabelLayoutResult = useCallback(() => {
    const frameNumber = getSceneFrameNumber();
    const cached = areaLabelLayoutCacheRef.current;
    if (frameNumber !== null && cached.frameNumber === frameNumber) {
      return cached.result;
    }

    const result = computeAreaLabelLayoutResult();
    areaLabelLayoutCacheRef.current = {
      frameNumber,
      result,
    };
    return result;
  }, [computeAreaLabelLayoutResult, getSceneFrameNumber]);

  useEffect(() => {
    overlayIdsRef.current.forEach((overlayId) => {
      removeLabelOverlayElement(overlayId);
    });
    overlayIdsRef.current = [];

    if (!scene || scene.isDestroyed()) {
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
          if (!scene || scene.isDestroyed()) return false;

          const screenPoints = vertexPoints
            .map((point) =>
              SceneTransforms.worldToWindowCoordinates(scene, point)
            )
            .filter(
              (point): point is Cartesian2 =>
                defined(point) &&
                Number.isFinite(point.x) &&
                Number.isFinite(point.y)
            );

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
          const canvasWidth = Math.max(
            1,
            scene.canvas.clientWidth || scene.canvas.width || 1
          );
          const canvasHeight = Math.max(
            1,
            scene.canvas.clientHeight || scene.canvas.height || 1
          );

          if (
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width > canvasWidth * POLYGON_OVERLAY_MAX_BOUNDS_SCALE ||
            height > canvasHeight * POLYGON_OVERLAY_MAX_BOUNDS_SCALE
          ) {
            return false;
          }

          const localPoints = screenPoints.map((point) => ({
            x: point.x - minX + POLYGON_PREVIEW_PADDING_PX,
            y: point.y - minY + POLYGON_PREVIEW_PADDING_PX,
          }));
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
            const hideAreaLabelInDirectPreview =
              shouldHideAreaLabelInDirectPolylinePreview(
                group,
                activePlanarPolygonGroupId
              );

            if (hideAreaLabelInDirectPreview) {
              areaPillEl.style.display = "none";
            } else {
              const layoutResult = getAreaLabelLayoutResult();
              if (layoutResult.hiddenByLayout.has(group.id)) {
                areaPillEl.style.display = "none";
                elementDiv.style.position = "absolute";
                elementDiv.style.left = `${
                  minX - POLYGON_PREVIEW_PADDING_PX
                }px`;
                elementDiv.style.top = `${minY - POLYGON_PREVIEW_PADDING_PX}px`;
                elementDiv.style.width = `${width}px`;
                elementDiv.style.height = `${height}px`;
                elementDiv.style.transform = "none";
                elementDiv.style.pointerEvents = "none";
                elementDiv.style.zIndex = "4";
                return true;
              }

              const { planarText, projectedHorizontalText } =
                getPolygonAreaLabelText(group, vertexPoints);
              const compactBadge = polygonAreaBadgeByGroupId[group.id];
              const compactBadgeText = compactBadge?.text?.trim() ?? "";
              const collapsedByLayout = layoutResult.collapsedToCompact.has(
                group.id
              );
              const isSelectedGroup = group.id === focusedPolygonGroupId;
              const areaText = projectedHorizontalText
                ? `${planarText} ${projectedHorizontalText}`
                : planarText;

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
                const clampedAnchor: ScreenPoint2D = {
                  x: clampToRange(centroidAnchor.x, 0, width),
                  y: clampToRange(centroidAnchor.y, 0, height),
                };
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
                areaPillEl.style.paddingRight = collapsedByLayout
                  ? "0px"
                  : "8px";
                areaPillEl.style.gap = collapsedByLayout
                  ? "0px"
                  : compactBadgeText.length > 0
                  ? `${POLYGON_AREA_PILL_COMPACT_GAP_PX}px`
                  : "0px";
              }
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
    activePlanarPolygonGroupId,
    addLabelOverlayElement,
    getAreaLabelLayoutResult,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    polygonPreviewContent,
    relevantGroups,
    removeLabelOverlayElement,
    scene,
    overlayPrefix,
  ]);
};

const useCesiumPolygonAreaPrimitives = ({
  scene,
  polygonPreviewGroups,
  focusedPolygonGroupId,
}: Pick<
  UsePolygonAreaSurfaceVisualizerOptions,
  "scene" | "polygonPreviewGroups" | "focusedPolygonGroupId"
>) => {
  const primitiveCollectionRef = useRef<PrimitiveCollection | null>(null);
  const groundPrimitivesRef = useRef<GroundPrimitive[]>([]);
  const relevantGroups = useMemo(
    () => polygonPreviewGroups,
    [polygonPreviewGroups]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;

    if (primitiveCollectionRef.current) {
      scene.primitives.remove(primitiveCollectionRef.current);
      primitiveCollectionRef.current = null;
    }
    groundPrimitivesRef.current.forEach((groundPrimitive) => {
      scene.groundPrimitives.remove(groundPrimitive);
    });
    groundPrimitivesRef.current = [];

    if (relevantGroups.length === 0) return;

    const collection = new PrimitiveCollection();
    let hasCoplanarPolygonPrimitive = false;
    const nextGroundPrimitives: GroundPrimitive[] = [];

    for (const { group, vertexPoints } of relevantGroups) {
      if (vertexPoints.length < 3) continue;

      const geometryVertexPoints = vertexPoints.map((point) =>
        Cartesian3.clone(point)
      );
      const isSelected = group.id === focusedPolygonGroupId;
      const fillColor = getPolygonFillCesiumColor(
        group.surfaceType,
        isSelected
      );
      const surfaceType = group.surfaceType ?? "roof";
      const isGroundSurface =
        surfaceType === "footprint" || surfaceType === "terrain";

      if (isGroundSurface) {
        const groundGeometry = new PolygonGeometry({
          polygonHierarchy: new PolygonHierarchy(geometryVertexPoints),
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        });

        const groundInstance = new GeometryInstance({
          geometry: groundGeometry,
          id: { polygonGroupId: group.id },
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(fillColor),
          },
        });

        const groundPrimitive = new GroundPrimitive({
          geometryInstances: [groundInstance],
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
          asynchronous: false,
          releaseGeometryInstances: false,
          classificationType: ClassificationType.BOTH,
        });

        scene.groundPrimitives.add(groundPrimitive);
        nextGroundPrimitives.push(groundPrimitive);
        continue;
      }

      const geometry = CoplanarPolygonGeometry.fromPositions({
        positions: geometryVertexPoints,
        vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
      });

      const instance = new GeometryInstance({
        geometry,
        id: { polygonGroupId: group.id },
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(fillColor),
        },
      });

      collection.add(
        new Primitive({
          geometryInstances: [instance],
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
          asynchronous: false,
        })
      );
      hasCoplanarPolygonPrimitive = true;
    }

    groundPrimitivesRef.current = nextGroundPrimitives;

    if (hasCoplanarPolygonPrimitive) {
      primitiveCollectionRef.current = collection;
      scene.primitives.add(collection);
    }

    scene.requestRender();

    return () => {
      if (primitiveCollectionRef.current && !scene.isDestroyed()) {
        scene.primitives.remove(primitiveCollectionRef.current);
        primitiveCollectionRef.current = null;
      }
      groundPrimitivesRef.current.forEach((groundPrimitive) => {
        scene.groundPrimitives.remove(groundPrimitive);
      });
      groundPrimitivesRef.current = [];
      scene.requestRender();
    };
  }, [focusedPolygonGroupId, relevantGroups, scene]);
};

const usePolygonAreaSurfaceVisualizer = (
  options: UsePolygonAreaSurfaceVisualizerOptions
) => {
  usePolygonAreaLabelOverlays(options);
  useCesiumPolygonAreaPrimitives({
    scene: options.scene,
    polygonPreviewGroups: options.polygonPreviewGroups,
    focusedPolygonGroupId: options.focusedPolygonGroupId,
  });
};

type AreaVisualizerCommonOptions = {
  scene: Scene | null;
  focusedPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PolygonAreaBadge>>;
};

export type GroundPolygonAreaVisualizerOptions = AreaVisualizerCommonOptions & {
  groundPolygonPreviewGroups: GroundPolygonPreviewGroup[];
};

export type VerticalPolygonAreaVisualizerOptions =
  AreaVisualizerCommonOptions & {
    verticalPolygonPreviewGroups: VerticalPolygonPreviewGroup[];
  };

export type PlanarPolygonAreaVisualizerOptions = AreaVisualizerCommonOptions & {
  planarPolygonPreviewGroups: PlanarPolygonPreviewGroup[];
};

export const useCesiumGroundPolygonAreaVisualizer = (
  options: GroundPolygonAreaVisualizerOptions
) => {
  const { groundPolygonPreviewGroups, ...commonOptions } = options;
  usePolygonAreaSurfaceVisualizer({
    ...commonOptions,
    polygonPreviewGroups: groundPolygonPreviewGroups,
    overlayPrefix: "distance-ground-polygon-preview",
  });
};

export const useCesiumVerticalPolygonAreaVisualizer = (
  options: VerticalPolygonAreaVisualizerOptions
) => {
  const { verticalPolygonPreviewGroups, ...commonOptions } = options;
  usePolygonAreaSurfaceVisualizer({
    ...commonOptions,
    polygonPreviewGroups: verticalPolygonPreviewGroups,
    overlayPrefix: "distance-vertical-polygon-preview",
  });
};

export const useCesiumPlanarPolygonAreaVisualizer = (
  options: PlanarPolygonAreaVisualizerOptions
) => {
  const { planarPolygonPreviewGroups, ...commonOptions } = options;
  usePolygonAreaSurfaceVisualizer({
    ...commonOptions,
    polygonPreviewGroups: planarPolygonPreviewGroups,
    overlayPrefix: "distance-planar-polygon-preview",
  });
};
