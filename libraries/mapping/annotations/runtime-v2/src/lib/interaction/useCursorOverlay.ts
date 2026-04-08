import { useEffect, useRef } from "react";

import {
  getCesiumScenePointerClientPosition,
  registerCesiumScenePointerTracker,
  subscribeCesiumScenePointerClientPosition,
  type CesiumScenePointerClientPosition,
} from "@carma-mapping/engines/cesium/react/interactions";
import type { RuntimeScene } from "../types/runtimeScene.types";
const CURSOR_ROOT_SELECTOR = '[data-annotation-cursor-root="true"]';
const CURSOR_LAYER_ID = "annotation-candidate-crosshair-layer";
const ANNOTATION_CURSOR_OVERLAY_ID = "annotation-preview-crosshair";
const CURSOR_STROKE_COLOR = "rgba(255, 255, 255, 0.96)";
const CURSOR_CONTRAST_FILTER =
  "drop-shadow(0 0 1px rgba(0, 0, 0, 1)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.95))";
const CURSOR_THICKNESS_PX = 3;
const CURSOR_CENTER_DOT_SIZE_PX = 1;
const CURSOR_CENTER_GAP_PX = 5;
const CURSOR_FAR_DASH_LENGTH_PX = 12;
const CURSOR_INNER_TIP_PX = CURSOR_THICKNESS_PX / 2;
const CURSOR_HALF_EXTENT_PX = CURSOR_CENTER_GAP_PX + CURSOR_FAR_DASH_LENGTH_PX;
const CURSOR_SIZE_PX = CURSOR_HALF_EXTENT_PX * 2 + CURSOR_CENTER_DOT_SIZE_PX;
const CURSOR_CENTER_PX = CURSOR_HALF_EXTENT_PX;

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

const createCursorStroke = (
  styles: Partial<CSSStyleDeclaration>,
  key: string
) => {
  const element = document.createElement("div");
  element.dataset.cursorPart = key;
  applyStyles(element, styles);
  return element;
};

const createCursorElement = () => {
  const element = document.createElement("div");
  element.id = ANNOTATION_CURSOR_OVERLAY_ID;
  applyStyles(element, {
    position: "absolute",
    left: "0",
    top: "0",
    width: `${CURSOR_SIZE_PX}px`,
    height: `${CURSOR_SIZE_PX}px`,
    pointerEvents: "none",
    display: "none",
    filter: CURSOR_CONTRAST_FILTER,
    willChange: "transform",
  });

  const strokeStyle = {
    backgroundColor: CURSOR_STROKE_COLOR,
  };

  element.appendChild(
    createCursorStroke(
      {
        position: "absolute",
        left: `${CURSOR_CENTER_PX}px`,
        top: `${CURSOR_CENTER_PX}px`,
        width: `${CURSOR_CENTER_DOT_SIZE_PX}px`,
        height: `${CURSOR_CENTER_DOT_SIZE_PX}px`,
        transform: "translate(-50%, -50%)",
        ...strokeStyle,
      },
      "center-dot"
    )
  );
  element.appendChild(
    createCursorStroke(
      {
        position: "absolute",
        left: `${CURSOR_CENTER_PX + CURSOR_CENTER_GAP_PX}px`,
        top: `${CURSOR_CENTER_PX}px`,
        width: `${CURSOR_FAR_DASH_LENGTH_PX}px`,
        height: `${CURSOR_THICKNESS_PX}px`,
        transform: "translateY(-50%)",
        clipPath: `polygon(0 50%, ${CURSOR_INNER_TIP_PX}px 0, 100% 0, 100% 100%, ${CURSOR_INNER_TIP_PX}px 100%)`,
        ...strokeStyle,
      },
      "h-right-dash"
    )
  );
  element.appendChild(
    createCursorStroke(
      {
        position: "absolute",
        left: `${
          CURSOR_CENTER_PX - CURSOR_CENTER_GAP_PX - CURSOR_FAR_DASH_LENGTH_PX
        }px`,
        top: `${CURSOR_CENTER_PX}px`,
        width: `${CURSOR_FAR_DASH_LENGTH_PX}px`,
        height: `${CURSOR_THICKNESS_PX}px`,
        transform: "translateY(-50%)",
        clipPath: `polygon(0 0, calc(100% - ${CURSOR_INNER_TIP_PX}px) 0, 100% 50%, calc(100% - ${CURSOR_INNER_TIP_PX}px) 100%, 0 100%)`,
        ...strokeStyle,
      },
      "h-left-dash"
    )
  );
  element.appendChild(
    createCursorStroke(
      {
        position: "absolute",
        left: `${CURSOR_CENTER_PX}px`,
        top: `${CURSOR_CENTER_PX + CURSOR_CENTER_GAP_PX}px`,
        width: `${CURSOR_THICKNESS_PX}px`,
        height: `${CURSOR_FAR_DASH_LENGTH_PX}px`,
        transform: "translateX(-50%)",
        clipPath: `polygon(0 ${CURSOR_INNER_TIP_PX}px, 50% 0, 100% ${CURSOR_INNER_TIP_PX}px, 100% 100%, 0 100%)`,
        ...strokeStyle,
      },
      "v-bottom-dash"
    )
  );
  element.appendChild(
    createCursorStroke(
      {
        position: "absolute",
        left: `${CURSOR_CENTER_PX}px`,
        top: `${
          CURSOR_CENTER_PX - CURSOR_CENTER_GAP_PX - CURSOR_FAR_DASH_LENGTH_PX
        }px`,
        width: `${CURSOR_THICKNESS_PX}px`,
        height: `${CURSOR_FAR_DASH_LENGTH_PX}px`,
        transform: "translateX(-50%)",
        clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CURSOR_INNER_TIP_PX}px), 50% 100%, 0 calc(100% - ${CURSOR_INNER_TIP_PX}px))`,
        ...strokeStyle,
      },
      "v-top-dash"
    )
  );

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
      zIndex: "1700",
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

      if (
        clientPosition &&
        containerBounds &&
        isPointerInsideCanvas
      ) {
        cursorElement.style.display = "block";
        cursorElement.style.transform = `translate(${
          clientPosition.x - containerBounds.left
        }px, ${clientPosition.y - containerBounds.top}px) translate(-50%, -50%)`;
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
