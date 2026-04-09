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
import { previewControllerDefaults } from "../config/previewControllerDefaults";
import type { RuntimeScene } from "../types/runtimeScene.types";
const CURSOR_ROOT_SELECTOR = '[data-annotation-cursor-root="true"]';
const CURSOR_LAYER_ID = "annotation-candidate-crosshair-layer";
const ANNOTATION_CURSOR_OVERLAY_ID = "annotation-preview-crosshair";
const CURSOR_CANVAS_HALF_EXTENT_PX =
  ANNOTATION_CURSOR_DEFAULT_SHAPE_HALF_EXTENT_PX +
  ANNOTATION_CURSOR_DEFAULT_AURA_PADDING_PX;
const CURSOR_CANVAS_SIZE_PX = CURSOR_CANVAS_HALF_EXTENT_PX * 2;
const CURSOR_VIEW_BOX = `${-CURSOR_CANVAS_HALF_EXTENT_PX} ${-CURSOR_CANVAS_HALF_EXTENT_PX} ${CURSOR_CANVAS_SIZE_PX} ${CURSOR_CANVAS_SIZE_PX}`;

type AnnotationCursorOverlayOptions = {
  enabled?: boolean;
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

const createCursorElement = () => {
  const element = createAnnotationCursorLayeredDomElement({
    canvasSizePx: CURSOR_CANVAS_SIZE_PX,
    foregroundBlendMode: "normal",
    foregroundFill: ANNOTATION_CURSOR_OVERLAY_STROKE_COLOR,
    pathDefinitions: ANNOTATION_CURSOR_DEFAULT_PATH_DEFINITIONS,
    shadowBlendMode: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLEND_MODE,
    shadowBlurPx: ANNOTATION_CURSOR_OVERLAY_SHADOW_BLUR_RADIUS_PX,
    shadowStrokeColor: ANNOTATION_CURSOR_OVERLAY_SHADOW_COLOR,
    shadowStrokeLinejoin: "round",
    shadowStrokeWidth: Math.max(ANNOTATION_CURSOR_OVERLAY_OUTLINE_PX, 0) * 2,
    showAura: true,
    viewBox: CURSOR_VIEW_BOX,
  });
  element.id = ANNOTATION_CURSOR_OVERLAY_ID;
  applyStyles(element, {
    display: "none",
  });
  return element;
};

const resolveCursorContainer = (scene: RuntimeScene) => {
  const explicitRoot = scene.canvas.closest(CURSOR_ROOT_SELECTOR);
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
  { enabled = true }: AnnotationCursorOverlayOptions = {}
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
    cursorLayer.id = CURSOR_LAYER_ID;
    applyStyles(cursorLayer, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      overflow: "hidden",
      zIndex: previewControllerDefaults.layerZIndex,
    });

    const cursorElement = createCursorElement();
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
  }, [scene]);
};
