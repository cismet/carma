import { useEffect, useRef } from "react";

import { type Scene } from "@carma/cesium";
import type { CssPixelPosition, CssPixels } from "@carma/units/types";
import {
  POINT_LABEL_SELECTED_BACKGROUND_COLOR,
  type PointLabelData,
} from "@carma-providers/label-overlay";

import {
  buildScreenRectangle,
  getScreenRectangleSize,
  selectPointIdsInScreenRectangle,
} from "@carma-mapping/annotations/core";

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
  const pointsRef = useRef(points);
  const onSelectRef = useRef(onSelect);
  const additiveModeRef = useRef(additiveMode);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    additiveModeRef.current = additiveMode;
  }, [additiveMode]);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !enabled) {
      return;
    }

    const overlayContainer = document.getElementById("label-overlay-container");
    if (!overlayContainer) {
      return;
    }
    const canvas = scene.canvas;

    const previousPointerEvents = overlayContainer.style.pointerEvents;
    const previousTouchAction = overlayContainer.style.touchAction;
    const previousUserSelect = overlayContainer.style.userSelect;
    const previousCursor = overlayContainer.style.cursor;
    const previousCanvasCursor = canvas.style.cursor;
    overlayContainer.style.pointerEvents = "none";
    overlayContainer.style.touchAction = "none";
    overlayContainer.style.cursor = "crosshair";
    overlayContainer.style.userSelect = "none";
    canvas.style.cursor = "crosshair";

    const getOverlayBounds = () => overlayContainer.getBoundingClientRect();

    const selectionOverlay = document.createElement("div");
    selectionOverlay.style.position = "fixed";
    selectionOverlay.style.pointerEvents = "none";
    selectionOverlay.style.border = `1px dashed ${POINT_LABEL_SELECTED_BACKGROUND_COLOR}`;
    selectionOverlay.style.background = POINT_LABEL_SELECTED_BACKGROUND_COLOR;
    selectionOverlay.style.zIndex = "9999";
    selectionOverlay.style.display = "none";
    document.body.appendChild(selectionOverlay);

    let activePointerId: number | null = null;
    let dragStart: CssPixelPosition | null = null;
    let dragCurrent: CssPixelPosition | null = null;
    let isDragging = false;
    let dragAdditive = false;
    let lastSelectionSignature: string | null = null;
    let cameraInputsSuppressed = false;
    let previousCameraInputsEnabled =
      scene.screenSpaceCameraController.enableInputs;
    let capturedPointerElement: Element | null = null;
    let capturedPointerId: number | null = null;

    const getOverlayLocalPoint = (event: PointerEvent) => {
      const overlayBounds = getOverlayBounds();
      return {
        x: (event.clientX - overlayBounds.left) as CssPixels,
        y: (event.clientY - overlayBounds.top) as CssPixels,
      };
    };

    const isInsideCanvas = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return (
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom
      );
    };

    const setCameraInputsSuppressed = (suppressed: boolean) => {
      const controller = scene.screenSpaceCameraController;
      if (suppressed) {
        if (cameraInputsSuppressed) return;
        previousCameraInputsEnabled = controller.enableInputs;
        controller.enableInputs = false;
        cameraInputsSuppressed = true;
        return;
      }

      if (!cameraInputsSuppressed) return;
      controller.enableInputs = previousCameraInputsEnabled;
      cameraInputsSuppressed = false;
    };

    const releasePointerCapture = () => {
      if (
        capturedPointerElement &&
        capturedPointerId !== null &&
        capturedPointerElement.hasPointerCapture(capturedPointerId)
      ) {
        capturedPointerElement.releasePointerCapture(capturedPointerId);
      }
      capturedPointerElement = null;
      capturedPointerId = null;
    };

    const resetDrag = () => {
      releasePointerCapture();
      activePointerId = null;
      dragStart = null;
      dragCurrent = null;
      isDragging = false;
      dragAdditive = false;
      lastSelectionSignature = null;
      setCameraInputsSuppressed(false);
      selectionOverlay.style.display = "none";
    };

    const updateOverlay = () => {
      if (!dragStart || !dragCurrent) return;
      const rectangle = buildScreenRectangle(dragStart, dragCurrent);
      const size = getScreenRectangleSize(rectangle);
      const overlayBounds = getOverlayBounds();

      selectionOverlay.style.left = `${overlayBounds.left + rectangle.left}px`;
      selectionOverlay.style.top = `${overlayBounds.top + rectangle.top}px`;
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

    const stopDragEvent = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const emitLiveSelection = () => {
      if (!isDragging || !dragStart || !dragCurrent) return;
      const rectangle = buildScreenRectangle(dragStart, dragCurrent);
      const selectedIds = selectPointIdsInScreenRectangle(
        pointsRef.current,
        rectangle
      );
      if (selectedIds.length === 0 && dragAdditive) {
        return;
      }
      const signature = `${dragAdditive ? "1" : "0"}:${selectedIds.join(",")}`;
      if (signature === lastSelectionSignature) {
        return;
      }
      lastSelectionSignature = signature;
      onSelectRef.current(selectedIds, dragAdditive);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!isInsideCanvas(event)) return;
      if (isInteractiveLabelTarget(event.target)) {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      const localPoint = getOverlayLocalPoint(event);
      activePointerId = event.pointerId;
      if (event.target instanceof Element) {
        event.target.setPointerCapture(event.pointerId);
        capturedPointerElement = event.target;
        capturedPointerId = event.pointerId;
      }
      dragStart = localPoint;
      dragCurrent = localPoint;
      isDragging = false;
      dragAdditive = event.shiftKey || additiveModeRef.current;
      lastSelectionSignature = null;
      stopDragEvent(event);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      stopDragEvent(event);
      if (!dragStart) return;
      const nextDragAdditive = event.shiftKey || additiveModeRef.current;
      if (nextDragAdditive !== dragAdditive) {
        dragAdditive = nextDragAdditive;
        lastSelectionSignature = null;
      }
      dragCurrent = getOverlayLocalPoint(event);

      const rectangle = buildScreenRectangle(dragStart, dragCurrent);
      const size = getScreenRectangleSize(rectangle);
      if (
        !isDragging &&
        (size.width >= MIN_RECTANGLE_SELECTION_SIZE_PX ||
          size.height >= MIN_RECTANGLE_SELECTION_SIZE_PX)
      ) {
        isDragging = true;
        setCameraInputsSuppressed(true);
      }
      if (isDragging) {
        updateOverlay();
        emitLiveSelection();
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerId === null || event.pointerId !== activePointerId) {
        return;
      }
      if (isDragging) {
        stopDragEvent(event);
        emitLiveSelection();
      }
      resetDrag();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (activePointerId !== null && event.pointerId === activePointerId) {
        if (isDragging) {
          stopDragEvent(event);
        }
        resetDrag();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activePointerId === null) return;
      if (isDragging) {
        stopDragEvent(event);
      }
      resetDrag();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      setCameraInputsSuppressed(false);
      overlayContainer.style.pointerEvents = previousPointerEvents;
      overlayContainer.style.touchAction = previousTouchAction;
      overlayContainer.style.cursor = previousCursor;
      overlayContainer.style.userSelect = previousUserSelect;
      canvas.style.cursor = previousCanvasCursor;
      selectionOverlay.remove();
    };
  }, [scene, enabled]);
};
