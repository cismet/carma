import { createElement, useEffect, useMemo } from "react";

import { useLabelOverlay } from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma/units/types";

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

export const useCursorOverlay = (
  cursorScreenPosition: { x: number; y: number } | null = null,
  { enabled = true }: AnnotationCursorOverlayOptions = {}
) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const cursorContent = useMemo(() => {
    const strokeStyle = {
      backgroundColor: CURSOR_STROKE_COLOR,
    };

    return createElement(
      "div",
      {
        style: {
          position: "relative",
          width: `${CURSOR_SIZE_PX}px`,
          height: `${CURSOR_SIZE_PX}px`,
          pointerEvents: "none",
          filter: CURSOR_CONTRAST_FILTER,
        },
      },
      createElement("div", {
        key: "center-dot",
        style: {
          position: "absolute",
          left: `${CURSOR_CENTER_PX}px`,
          top: `${CURSOR_CENTER_PX}px`,
          width: `${CURSOR_CENTER_DOT_SIZE_PX}px`,
          height: `${CURSOR_CENTER_DOT_SIZE_PX}px`,
          transform: "translate(-50%, -50%)",
          ...strokeStyle,
        },
      }),
      createElement("div", {
        key: "h-right-dash",
        style: {
          position: "absolute",
          left: `${CURSOR_CENTER_PX + CURSOR_CENTER_GAP_PX}px`,
          top: `${CURSOR_CENTER_PX}px`,
          width: `${CURSOR_FAR_DASH_LENGTH_PX}px`,
          height: `${CURSOR_THICKNESS_PX}px`,
          transform: "translateY(-50%)",
          clipPath: `polygon(0 50%, ${CURSOR_INNER_TIP_PX}px 0, 100% 0, 100% 100%, ${CURSOR_INNER_TIP_PX}px 100%)`,
          ...strokeStyle,
        },
      }),
      createElement("div", {
        key: "h-left-dash",
        style: {
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
      }),
      createElement("div", {
        key: "v-bottom-dash",
        style: {
          position: "absolute",
          left: `${CURSOR_CENTER_PX}px`,
          top: `${CURSOR_CENTER_PX + CURSOR_CENTER_GAP_PX}px`,
          width: `${CURSOR_THICKNESS_PX}px`,
          height: `${CURSOR_FAR_DASH_LENGTH_PX}px`,
          transform: "translateX(-50%)",
          clipPath: `polygon(0 ${CURSOR_INNER_TIP_PX}px, 50% 0, 100% ${CURSOR_INNER_TIP_PX}px, 100% 100%, 0 100%)`,
          ...strokeStyle,
        },
      }),
      createElement("div", {
        key: "v-top-dash",
        style: {
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
      })
    );
  }, []);

  useEffect(() => {
    addLabelOverlayElement({
      id: ANNOTATION_CURSOR_OVERLAY_ID,
      zIndex: 22,
      getCanvasPosition: () => {
        if (
          !enabled ||
          !cursorScreenPosition ||
          !Number.isFinite(cursorScreenPosition.x) ||
          !Number.isFinite(cursorScreenPosition.y)
        ) {
          return null;
        }

        return {
          x: cursorScreenPosition.x,
          y: cursorScreenPosition.y,
        } as CssPixelPosition;
      },
      content: cursorContent,
      visible: enabled,
    });

    return () => {
      removeLabelOverlayElement(ANNOTATION_CURSOR_OVERLAY_ID);
    };
  }, [
    addLabelOverlayElement,
    cursorContent,
    cursorScreenPosition,
    enabled,
    removeLabelOverlayElement,
  ]);
};
