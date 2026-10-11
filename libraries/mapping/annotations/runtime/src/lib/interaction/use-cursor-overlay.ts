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
import { CSS_MIX_BLEND_MODE } from "@carma-commons/dom/document";
import type { AnnotationClientPosition, AnnotationEngine } from "../engine";
import {
  createAnnotationOverlayLayer,
  destroyAnnotationOverlayLayer,
  annotationOverlayDefaults,
  ANNOTATION_OVERLAY_GROUP,
} from "./authoring-visual-runtime";

const cursorOverlayDefaults = (() => {
  const crosshairCanvasHalfExtentPx =
    ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX +
    ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX;
  const crosshairCanvasSizePx = crosshairCanvasHalfExtentPx * 2;

  return Object.freeze({
    crosshair: Object.freeze({
      canvasHalfExtentPx: crosshairCanvasHalfExtentPx,
      canvasSizePx: crosshairCanvasSizePx,
      viewBox: `${-crosshairCanvasHalfExtentPx} ${-crosshairCanvasHalfExtentPx} ${crosshairCanvasSizePx} ${crosshairCanvasSizePx}`,
    }),
    selectionAdditiveIndicator: Object.freeze({
      fontSizeRem: "1.2857rem",
      offsetPx: Object.freeze({
        x: 15,
        y: -10,
      }),
    }),
  });
})();

const ANNOTATION_CURSOR_OVERLAY_VARIANTS = {
  CROSSHAIR: "crosshair",
  SELECTION_ADDITIVE_INDICATOR: "selection-additive-indicator",
} as const;

type AnnotationCursorOverlayVariant =
  (typeof ANNOTATION_CURSOR_OVERLAY_VARIANTS)[keyof typeof ANNOTATION_CURSOR_OVERLAY_VARIANTS];

const CURSOR_LAYER_ID_BY_VARIANT: Readonly<
  Record<AnnotationCursorOverlayVariant, string>
> = {
  [ANNOTATION_CURSOR_OVERLAY_VARIANTS.CROSSHAIR]:
    "annotation-candidate-crosshair-layer",
  [ANNOTATION_CURSOR_OVERLAY_VARIANTS.SELECTION_ADDITIVE_INDICATOR]:
    "annotation-selection-additive-indicator-layer",
};

const CURSOR_ELEMENT_ID_BY_VARIANT: Readonly<
  Record<AnnotationCursorOverlayVariant, string>
> = {
  [ANNOTATION_CURSOR_OVERLAY_VARIANTS.CROSSHAIR]:
    "annotation-preview-crosshair",
  [ANNOTATION_CURSOR_OVERLAY_VARIANTS.SELECTION_ADDITIVE_INDICATOR]:
    "annotation-selection-additive-indicator",
};

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
    canvasSizePx: cursorOverlayDefaults.crosshair.canvasSizePx,
    foregroundBlendMode: CSS_MIX_BLEND_MODE.NORMAL,
    foregroundFill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
    pathDefinitions: ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
    shadowBlendMode: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLEND_MODE,
    shadowBlurPx: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
    shadowStrokeColor: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
    shadowStrokeLinejoin: "round",
    shadowStrokeWidth: Math.max(ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX, 0) * 2,
    showAura: true,
    viewBox: cursorOverlayDefaults.crosshair.viewBox,
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
    fontSize: cursorOverlayDefaults.selectionAdditiveIndicator.fontSizeRem,
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
  element.id = CURSOR_ELEMENT_ID_BY_VARIANT[variant];
  return element;
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
  clientPosition: AnnotationClientPosition,
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
  engine: AnnotationEngine | null,
  cursorScreenPosition: { x: number; y: number } | null = null,
  {
    enabled = true,
    variant = ANNOTATION_CURSOR_OVERLAY_VARIANTS.CROSSHAIR,
  }: AnnotationCursorOverlayOptions = {}
) => {
  const enabledRef = useRef(enabled);
  const latestClientPositionRef = useRef<AnnotationClientPosition | null>(null);
  const latestScreenPositionRef = useRef<{ x: number; y: number } | null>(
    cursorScreenPosition
  );
  const updateCursorPositionRef = useRef<
    (
      clientPosition: AnnotationClientPosition | null,
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
    if (!engine || engine.isDestroyed()) {
      return;
    }

    const cursorLayer = createAnnotationOverlayLayer(
      engine,
      CURSOR_LAYER_ID_BY_VARIANT[variant],
      ANNOTATION_OVERLAY_GROUP.VISUALIZER
    );
    const container = cursorLayer?.parentElement;
    if (!cursorLayer || !(container instanceof HTMLElement)) {
      return;
    }

    const unregisterScenePointerTracker = engine.pointer.register();
    applyStyles(cursorLayer, {
      zIndex: annotationOverlayDefaults.layerZIndex,
    });

    const cursorElement = createCursorElement(variant);
    cursorLayer.appendChild(cursorElement);

    let containerBounds: BoundsSnapshot | null = readBounds(container);
    let canvasBounds: BoundsSnapshot | null = readBounds(engine.canvas);

    const hideCursor = () => {
      cursorElement.style.display = "none";
    };

    const updateCursorPosition = (
      clientPosition: AnnotationClientPosition | null,
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
            cursorOverlayDefaults.selectionAdditiveIndicator.offsetPx.x
          }px, ${
            clientPosition.y -
            containerBounds.top +
            cursorOverlayDefaults.selectionAdditiveIndicator.offsetPx.y
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
      canvasBounds = readBounds(engine.canvas);
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
    resizeObserver?.observe(engine.canvas);
    window.addEventListener("resize", refreshBounds);
    window.addEventListener("scroll", refreshBounds, true);

    const unsubscribeClientPosition = engine.pointer.subscribeClientPosition(
      (clientPosition) => {
        updateCursorPosition(clientPosition, latestScreenPositionRef.current);
      }
    );

    updateCursorPosition(
      engine.pointer.getClientPosition(),
      latestScreenPositionRef.current
    );

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refreshBounds);
      window.removeEventListener("scroll", refreshBounds, true);
      unsubscribeClientPosition();
      unregisterScenePointerTracker();
      destroyAnnotationOverlayLayer(cursorLayer);
    };
  }, [engine, variant]);
};
