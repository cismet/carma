import { useEffect, useRef, useState, type MouseEvent } from "react";

import type { CssPixelPosition } from "@carma-units";

import {
  POINT_LABEL_COMPONENT_DEFAULTS,
  POINT_LABEL_INTERACTION_DEFAULTS,
} from "./pointLabelDefaults";
import type { PointLabelProps } from "./point-label-types";

const SELECTED_CLICK_DELAY_MS = 220;

type PointLabelInteractionOptions = Pick<
  PointLabelProps,
  | "pointId"
  | "selected"
  | "onClick"
  | "onDoubleClick"
  | "onLongPress"
  | "longPressDurationMs"
  | "onHoverChange"
  | "onMarkerDragStart"
  | "onMarkerDragMove"
  | "onMarkerDragEnd"
>;

const getOverlayAnchorPosition = (
  target: EventTarget | null
): CssPixelPosition | null => {
  if (!(target instanceof HTMLElement)) return null;
  const overlayHost = target.closest(
    "[data-label-overlay-id]"
  ) as HTMLElement | null;
  if (!overlayHost) return null;

  const x = Number.parseFloat(overlayHost.style.left);
  const y = Number.parseFloat(overlayHost.style.top);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y } as CssPixelPosition;
};

const isTransitionWithinPointLabel = (
  relatedTarget: EventTarget | null,
  pointId: string | undefined
) => {
  if (!(relatedTarget instanceof Element)) return false;
  const relatedPointId = relatedTarget
    .closest("[data-point-label-id]")
    ?.getAttribute("data-point-label-id");
  return Boolean(pointId && relatedPointId === pointId);
};

/** Hover, click/double-click disambiguation, long press and marker drag of a point label. */
export const usePointLabelInteraction = ({
  pointId,
  selected = false,
  onClick,
  onDoubleClick,
  onLongPress,
  longPressDurationMs = POINT_LABEL_COMPONENT_DEFAULTS.longPressDurationMs,
  onHoverChange,
  onMarkerDragStart,
  onMarkerDragMove,
  onMarkerDragEnd,
}: PointLabelInteractionOptions) => {
  const [isHovered, setIsHovered] = useState(false);
  const isHoveredRef = useRef(false);
  const clickTimeoutRef = useRef<number | undefined>(undefined);
  const longPressTimeoutRef = useRef<number | undefined>(undefined);
  const longPressTriggeredRef = useRef(false);
  const dragMouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const isMarkerDragActiveRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const cleanupMarkerDragListenersRef = useRef<(() => void) | null>(null);

  const isInteractive = Boolean(
    onClick ||
      onDoubleClick ||
      onLongPress ||
      onHoverChange ||
      onMarkerDragStart ||
      onMarkerDragMove ||
      onMarkerDragEnd
  );

  const clearLongPressTimeout = () => {
    if (longPressTimeoutRef.current !== undefined) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = undefined;
    }
  };
  const clearMarkerDragListeners = () => {
    cleanupMarkerDragListenersRef.current?.();
    cleanupMarkerDragListenersRef.current = null;
  };

  const handleMouseEnter = (event: MouseEvent<HTMLElement>) => {
    if (isTransitionWithinPointLabel(event.relatedTarget, pointId)) return;
    if (!isInteractive || isHoveredRef.current) return;
    isHoveredRef.current = true;
    setIsHovered(true);
    onHoverChange?.(true, getOverlayAnchorPosition(event.currentTarget));
  };
  const handleMouseLeave = (event: MouseEvent<HTMLElement>) => {
    clearLongPressTimeout();
    if (isTransitionWithinPointLabel(event.relatedTarget, pointId)) return;
    if (!isInteractive || !isHoveredRef.current) return;
    isHoveredRef.current = false;
    setIsHovered(false);
    onHoverChange?.(false, getOverlayAnchorPosition(event.currentTarget));
  };

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (!onClick) return;
    if (!onDoubleClick || !selected) {
      onClick();
      return;
    }

    if (event.detail > 1) return;

    if (clickTimeoutRef.current !== undefined) {
      window.clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      onClick();
      clickTimeoutRef.current = undefined;
    }, SELECTED_CLICK_DELAY_MS);
  };
  const handleDoubleClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (clickTimeoutRef.current !== undefined) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = undefined;
    }
    onDoubleClick?.();
  };

  const endMarkerDrag = (didDrag: boolean) => {
    clearMarkerDragListeners();
    if (isMarkerDragActiveRef.current) {
      onMarkerDragEnd?.();
    }
    isMarkerDragActiveRef.current = false;
    dragMouseDownPosRef.current = null;
    if (didDrag) {
      suppressNextClickRef.current = true;
    }
  };
  const beginMarkerDragTracking = (event: MouseEvent<HTMLElement>) => {
    if (!onMarkerDragStart && !onMarkerDragMove && !onMarkerDragEnd) {
      return false;
    }
    if (event.button !== 0) return false;

    dragMouseDownPosRef.current = { x: event.clientX, y: event.clientY };
    isMarkerDragActiveRef.current = false;
    suppressNextClickRef.current = false;

    const handleWindowMouseMove = (moveEvent: globalThis.MouseEvent) => {
      if (!dragMouseDownPosRef.current) return;
      const pixelDistance = Math.hypot(
        moveEvent.clientX - dragMouseDownPosRef.current.x,
        moveEvent.clientY - dragMouseDownPosRef.current.y
      );

      if (
        !isMarkerDragActiveRef.current &&
        pixelDistance >= POINT_LABEL_INTERACTION_DEFAULTS.dragStartThresholdPx
      ) {
        isMarkerDragActiveRef.current = true;
        onMarkerDragStart?.(
          dragMouseDownPosRef.current.x,
          dragMouseDownPosRef.current.y
        );
      }
      if (isMarkerDragActiveRef.current) {
        onMarkerDragMove?.(moveEvent.clientX, moveEvent.clientY);
      }
    };
    const handleWindowRelease = () =>
      endMarkerDrag(isMarkerDragActiveRef.current);

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowRelease);
    window.addEventListener("blur", handleWindowRelease);
    cleanupMarkerDragListenersRef.current = () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowRelease);
      window.removeEventListener("blur", handleWindowRelease);
    };

    return true;
  };

  const handleMouseDown = (
    event: MouseEvent<HTMLElement>,
    allowMarkerDrag: boolean = true,
    allowLongPress: boolean = true
  ) => {
    event.stopPropagation();
    if (allowMarkerDrag && beginMarkerDragTracking(event)) {
      event.preventDefault();
      clearLongPressTimeout();
      return;
    }
    if (!allowLongPress) {
      clearLongPressTimeout();
      return;
    }
    if (!onLongPress) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimeout();
    longPressTimeoutRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress();
    }, longPressDurationMs);
  };
  const handleMouseUp = clearLongPressTimeout;

  useEffect(
    () => () => {
      if (clickTimeoutRef.current !== undefined) {
        window.clearTimeout(clickTimeoutRef.current);
      }
      clearLongPressTimeout();
      clearMarkerDragListeners();
    },
    []
  );

  return {
    isHovered,
    isInteractive,
    handleClick,
    handleDoubleClick,
    handleMouseDown,
    handleMouseUp,
    handleMouseEnter,
    handleMouseLeave,
  };
};
