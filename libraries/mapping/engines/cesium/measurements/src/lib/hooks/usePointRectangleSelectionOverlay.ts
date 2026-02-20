import { useEffect } from "react";

import { type Scene } from "@carma/cesium";
import {
  POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  type PointLabelData,
} from "@carma-providers/label-overlay";

import {
  buildSelectionRectangle,
  getSelectionRectangleSize,
  selectPointLabelIdsInRectangle,
} from "../utils/selectionRectangle";

type UsePointRectangleSelectionOverlayParams = {
  scene: Scene | null;
  enabled: boolean;
  additiveMode: boolean;
  points: PointLabelData[];
  onSelect: (pointIds: string[], additive: boolean) => void;
};

const MIN_RECTANGLE_SELECTION_SIZE_PX = 4;

export const usePointRectangleSelectionOverlay = ({
  scene,
  enabled,
  additiveMode,
  points,
  onSelect,
}: UsePointRectangleSelectionOverlayParams) => {
  useEffect(() => {
    if (!scene || scene.isDestroyed() || !enabled) {
      return;
    }

    const overlayContainer = document.getElementById("label-overlay-container");
    if (!overlayContainer) {
      return;
    }

    const previousPointerEvents = overlayContainer.style.pointerEvents;
    const previousTouchAction = overlayContainer.style.touchAction;
    const previousCursor = overlayContainer.style.cursor;
    const previousUserSelect = overlayContainer.style.userSelect;
    overlayContainer.style.pointerEvents = "auto";
    overlayContainer.style.touchAction = "none";
    overlayContainer.style.cursor = "crosshair";
    overlayContainer.style.userSelect = "none";

    const selectionOverlay = document.createElement("div");
    selectionOverlay.style.position = "absolute";
    selectionOverlay.style.pointerEvents = "none";
    selectionOverlay.style.border = `1px dashed ${POINT_LABEL_SELECTED_BACKGROUND_COLOR}`;
    selectionOverlay.style.background = POINT_LABEL_SELECTED_BACKGROUND_COLOR;
    selectionOverlay.style.zIndex = "9999";
    selectionOverlay.style.display = "none";
    overlayContainer.appendChild(selectionOverlay);

    let activePointerId: number | null = null;
    let dragStart: { x: number; y: number } | null = null;
    let dragCurrent: { x: number; y: number } | null = null;
    let isDragging = false;

    const getOverlayLocalPoint = (event: PointerEvent) => {
      const overlayBounds = overlayContainer.getBoundingClientRect();
      return {
        x: event.clientX - overlayBounds.left,
        y: event.clientY - overlayBounds.top,
      };
    };

    const resetDrag = () => {
      activePointerId = null;
      dragStart = null;
      dragCurrent = null;
      isDragging = false;
      selectionOverlay.style.display = "none";
    };

    const updateOverlay = () => {
      if (!dragStart || !dragCurrent) return;
      const rectangle = buildSelectionRectangle(dragStart, dragCurrent);
      const size = getSelectionRectangleSize(rectangle);

      selectionOverlay.style.left = `${rectangle.left}px`;
      selectionOverlay.style.top = `${rectangle.top}px`;
      selectionOverlay.style.width = `${size.width}px`;
      selectionOverlay.style.height = `${size.height}px`;
      selectionOverlay.style.display =
        size.width >= MIN_RECTANGLE_SELECTION_SIZE_PX &&
        size.height >= MIN_RECTANGLE_SELECTION_SIZE_PX
          ? "block"
          : "none";
    };

    const isInteractiveLabelTarget = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      Boolean(target.closest('[data-point-label-interactive="true"]'));

    const stopOverlayEvent = (event: Event, preventDefault: boolean = true) => {
      if (preventDefault && event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (isInteractiveLabelTarget(event.target)) {
        stopOverlayEvent(event, false);
        return;
      }
      stopOverlayEvent(event);
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      const localPoint = getOverlayLocalPoint(event);
      activePointerId = event.pointerId;
      dragStart = localPoint;
      dragCurrent = localPoint;
      isDragging = false;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerId === null && isInteractiveLabelTarget(event.target)) {
        stopOverlayEvent(event, false);
        return;
      }
      stopOverlayEvent(event);
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      if (!dragStart) return;
      dragCurrent = getOverlayLocalPoint(event);

      const rectangle = buildSelectionRectangle(dragStart, dragCurrent);
      const size = getSelectionRectangleSize(rectangle);
      if (
        !isDragging &&
        (size.width >= MIN_RECTANGLE_SELECTION_SIZE_PX ||
          size.height >= MIN_RECTANGLE_SELECTION_SIZE_PX)
      ) {
        isDragging = true;
      }
      if (isDragging) {
        updateOverlay();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerId === null && isInteractiveLabelTarget(event.target)) {
        stopOverlayEvent(event, false);
        return;
      }
      stopOverlayEvent(event);
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      if (!dragStart || !dragCurrent) {
        resetDrag();
        return;
      }

      const additive = event.shiftKey || additiveMode;
      const rectangle = buildSelectionRectangle(dragStart, dragCurrent);
      const selectedIds = selectPointLabelIdsInRectangle(points, rectangle);
      if (selectedIds.length > 0 || !additive) {
        onSelect(selectedIds, additive);
      }

      if (isDragging) {
        stopOverlayEvent(event);
      }

      resetDrag();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      stopOverlayEvent(event);
      if (activePointerId !== null && event.pointerId === activePointerId) {
        resetDrag();
      }
    };

    const handleMouseEvent = (event: MouseEvent) => {
      stopOverlayEvent(event);
    };

    const handleWheelEvent = (event: WheelEvent) => {
      stopOverlayEvent(event);
    };

    const handleContextMenu = (event: MouseEvent) => {
      stopOverlayEvent(event);
    };

    overlayContainer.addEventListener("pointerdown", handlePointerDown);
    overlayContainer.addEventListener("pointermove", handlePointerMove);
    overlayContainer.addEventListener("pointerup", handlePointerUp);
    overlayContainer.addEventListener("pointercancel", handlePointerCancel);
    overlayContainer.addEventListener("click", handleMouseEvent);
    overlayContainer.addEventListener("dblclick", handleMouseEvent);
    overlayContainer.addEventListener("wheel", handleWheelEvent, {
      passive: false,
    });
    overlayContainer.addEventListener("contextmenu", handleContextMenu);

    return () => {
      overlayContainer.removeEventListener("pointerdown", handlePointerDown);
      overlayContainer.removeEventListener("pointermove", handlePointerMove);
      overlayContainer.removeEventListener("pointerup", handlePointerUp);
      overlayContainer.removeEventListener(
        "pointercancel",
        handlePointerCancel
      );
      overlayContainer.removeEventListener("click", handleMouseEvent);
      overlayContainer.removeEventListener("dblclick", handleMouseEvent);
      overlayContainer.removeEventListener("wheel", handleWheelEvent);
      overlayContainer.removeEventListener("contextmenu", handleContextMenu);
      overlayContainer.style.pointerEvents = previousPointerEvents;
      overlayContainer.style.touchAction = previousTouchAction;
      overlayContainer.style.cursor = previousCursor;
      overlayContainer.style.userSelect = previousUserSelect;
      selectionOverlay.remove();
    };
  }, [scene, enabled, additiveMode, points, onSelect]);
};
