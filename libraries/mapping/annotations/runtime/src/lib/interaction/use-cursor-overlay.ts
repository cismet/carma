import { useEffect, useRef } from "react";

import {
  ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX,
  ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
  ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX,
  ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_BLEND_MODE,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
  ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
  ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
  createAnnotationCursorLayeredDomElement,
} from "@carma-commons/ui/components";
import {
  getCesiumScenePointerClientPosition,
  registerCesiumScenePointerTracker,
  subscribeCesiumScenePointerClientPosition,
  type CesiumScenePointerClientPosition,
} from "@carma-mapping/engines/cesium/react/interactions";
import { previewControllerDefaults } from "../config/preview-controller-defaults";
import type { RuntimeScene } from "../types/runtime-scene.types";

const annotationCursorOverlayDefaults = (() => {
  const crosshairCanvasHalfExtentPx =
    ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX +
    ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX;
  const crosshairCanvasSizePx = crosshairCanvasHalfExtentPx * 2;

  return Object.freeze({
    rootSelector: '[data-annotation-cursor-root="true"]',
    crosshair: Object.freeze({
      canvasHalfExtentPx: crosshairCanvasHalfExtentPx,
      canvasSizePx: crosshairCanvasSizePx,
      viewBox: `${-crosshairCanvasHalfExtentPx} ${-crosshairCanvasHalfExtentPx} ${crosshairCanvasSizePx} ${crosshairCanvasSizePx}`,
    }),
    selectionAdditiveIndicator: Object.freeze({
      fontSizeRem: "1.2857rem", // 18 / 14
      offsetPx: {
        x: 15,
        y: -10,
      } as const,
    }),
    variants: {
      CROSSHAIR: "crosshair",
      SELECTION_ADDITIVE_INDICATOR: "selection-additive-indicator",
    } as const,
    layerIdByVariant: {
      crosshair: "annotation-candidate-crosshair-layer",
      "selection-additive-indicator":
        "annotation-selection-additive-indicator-layer",
    } as const,
    elementIdByVariant: {
      crosshair: "annotation-preview-crosshair",
      "selection-additive-indicator": "annotation-selection-additive-indicator",
    } as const,
  });
})();

const ANNOTATION_CURSOR_OVERLAY_VARIANTS =
  annotationCursorOverlayDefaults.variants;

type AnnotationCursorOverlayVariant =
  (typeof ANNOTATION_CURSOR_OVERLAY_VARIANTS)[keyof typeof ANNOTATION_CURSOR_OVERLAY_VARIANTS];

type AnnotationCursorOverlayOptions = {
  enabled?: boolean;
  variant?: AnnotationCursorOverlayVariant;
};

type BoundsSnapshot = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const applyStyles = (
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) => {
  Object.assign(element.style, styles);
};

const createCrosshairCursorElement = () => {
  const element = createAnnotationCursorLayeredDomElement({
    canvasSizePx: annotationCursorOverlayDefaults.crosshair.canvasSizePx,
    foregroundBlendMode: "normal",
    foregroundFill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
    pathDefinitions: ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
    shadowBlendMode: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLEND_MODE,
    shadowBlurPx: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
    shadowStrokeColor: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
    shadowStrokeLinejoin: "round",
    shadowStrokeWidth: Math.max(ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX, 0) * 2,
    showAura: true,
    viewBox: annotationCursorOverlayDefaults.crosshair.viewBox,
  });
  applyStyles(element, {
    display: "none",
  });
  return element;
};

const createSelectionAdditiveIndicatorElement = () => {
  const element = document.createElement("div");
  element.textContent = "+";
  applyStyles(element, {
    display: "none",
    color: "rgba(255, 255, 255, 0.98)",
    fontFamily: '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
    fontSize:
      annotationCursorOverlayDefaults.selectionAdditiveIndicator.fontSizeRem,
    fontWeight: "700",
    lineHeight: "1",
    pointerEvents: "none",
    userSelect: "none",
    filter:
      "drop-shadow(0 0 1px rgba(0, 0, 0, 0.98)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.98))",
  });
  return element;
};

const createCursorElement = (variant: AnnotationCursorOverlayVariant) => {
  const element =
    variant === ANNOTATION_CURSOR_OVERLAY_VARIANTS.SELECTION_ADDITIVE_INDICATOR
      ? createSelectionAdditiveIndicatorElement()
      : createCrosshairCursorElement();
  element.id = annotationCursorOverlayDefaults.elementIdByVariant[variant];
  return element;
};

const resolveCursorContainer = (scene: RuntimeScene) => {
  const explicitRoot = scene.canvas.closest(
    annotationCursorOverlayDefaults.rootSelector
  );
  if (explicitRoot instanceof HTMLElement) {
    return explicitRoot;
  }

  const widgetContainer = scene.canvas.parentElement?.parentElement;
  if (widgetContainer instanceof HTMLElement) {
    return widgetContainer;
  }

  return scene.canvas.parentElement;
};

const readBounds = (element: HTMLElement): BoundsSnapshot => {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
};

const isInsideBounds = (
  clientPosition: CesiumScenePointerClientPosition,
  bounds: BoundsSnapshot | null
) =>
  Boolean(
    bounds &&
      clientPosition.x >= bounds.left &&
      clientPosition.x <= bounds.right &&
      clientPosition.y >= bounds.top &&
      clientPosition.y <= bounds.bottom
  );

export const useCursorOverlay = (
  scene: RuntimeScene | null,
  cursorScreenPosition: { x: number; y: number } | null = null,
  {
    enabled = true,
    variant = ANNOTATION_CURSOR_OVERLAY_VARIANTS.CROSSHAIR,
  }: AnnotationCursorOverlayOptions = {}
) => {
  const enabledRef = useRef(enabled);
  const latestClientPositionRef =
    useRef<CesiumScenePointerClientPosition | null>(null);
  const latestScreenPositionRef = useRef<{ x: number; y: number } | null>(
    cursorScreenPosition
  );
  const updateCursorPositionRef = useRef<
    (
      clientPosition: CesiumScenePointerClientPosition | null,
      screenPosition: { x: number; y: number } | null
    ) => void
  >(() => undefined);

  enabledRef.current = enabled;
  latestScreenPositionRef.current = cursorScreenPosition;

  useEffect(() => {
    updateCursorPositionRef.current(
      latestClientPositionRef.current,
      latestScreenPositionRef.current
    );
  }, [cursorScreenPosition, enabled]);

  useEffect(() => {
    if (!scene || scene.isDestroyed()) {
      return;
    }

    const container = resolveCursorContainer(scene);
    if (!container) {
      return;
    }

    const unregisterScenePointerTracker =
      registerCesiumScenePointerTracker(scene);
    const cursorLayer = document.createElement("div");
    cursorLayer.id = annotationCursorOverlayDefaults.layerIdByVariant[variant];
    applyStyles(cursorLayer, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: previewControllerDefaults.layerZIndex,
    });

    const cursorElement = createCursorElement(variant);
    cursorLayer.appendChild(cursorElement);
    container.appendChild(cursorLayer);

    let containerBounds: BoundsSnapshot | null = readBounds(container);
    let canvasBounds: BoundsSnapshot | null = readBounds(scene.canvas);

    const hideCursor = () => {
      cursorElement.style.display = "none";
    };

    const updateCursorPosition = (
      clientPosition: CesiumScenePointerClientPosition | null,
      screenPosition: { x: number; y: number } | null
    ) => {
      latestClientPositionRef.current = clientPosition;
      latestScreenPositionRef.current = screenPosition;

      if (!enabledRef.current) {
        hideCursor();
        return;
      }

      const isPointerInsideCanvas =
        clientPosition !== null && isInsideBounds(clientPosition, canvasBounds);

      if (
        variant ===
        ANNOTATION_CURSOR_OVERLAY_VARIANTS.SELECTION_ADDITIVE_INDICATOR
      ) {
        if (clientPosition && containerBounds && isPointerInsideCanvas) {
          cursorElement.style.display = "block";
          cursorElement.style.transform = `translate(${
            clientPosition.x -
            containerBounds.left +
            annotationCursorOverlayDefaults.selectionAdditiveIndicator.offsetPx
              .x
          }px, ${
            clientPosition.y -
            containerBounds.top +
            annotationCursorOverlayDefaults.selectionAdditiveIndicator.offsetPx
              .y
          }px)`;
          return;
        }

        hideCursor();
        return;
      }

      if (clientPosition && containerBounds && isPointerInsideCanvas) {
        cursorElement.style.display = "block";
        cursorElement.style.transform = `translate(${
          clientPosition.x - containerBounds.left
        }px, ${
          clientPosition.y - containerBounds.top
        }px) translate(-50%, -50%)`;
        return;
      }

      if (
        isPointerInsideCanvas &&
        screenPosition &&
        canvasBounds &&
        containerBounds &&
        Number.isFinite(screenPosition.x) &&
        Number.isFinite(screenPosition.y)
      ) {
        cursorElement.style.display = "block";
        cursorElement.style.transform = `translate(${
          screenPosition.x + canvasBounds.left - containerBounds.left
        }px, ${
          screenPosition.y + canvasBounds.top - containerBounds.top
        }px) translate(-50%, -50%)`;
        return;
      }

      hideCursor();
    };

    updateCursorPositionRef.current = updateCursorPosition;

    const refreshBounds = () => {
      containerBounds = readBounds(container);
      canvasBounds = readBounds(scene.canvas);
      updateCursorPosition(
        latestClientPositionRef.current,
        latestScreenPositionRef.current
      );
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            refreshBounds();
          })
        : null;
    resizeObserver?.observe(container);
    resizeObserver?.observe(scene.canvas);
    window.addEventListener("resize", refreshBounds);
    window.addEventListener("scroll", refreshBounds, true);

    const unsubscribeClientPosition = subscribeCesiumScenePointerClientPosition(
      scene,
      (clientPosition) => {
        updateCursorPosition(clientPosition, latestScreenPositionRef.current);
      }
    );

    updateCursorPosition(
      getCesiumScenePointerClientPosition(scene),
      latestScreenPositionRef.current
    );

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refreshBounds);
      window.removeEventListener("scroll", refreshBounds, true);
      unsubscribeClientPosition();
      unregisterScenePointerTracker();
      cursorLayer.remove();
    };
  }, [scene, variant]);
};
