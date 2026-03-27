import { createElement, type ReactElement } from "react";
import type { CssPixelPosition } from "@carma/units/types";

const EDGE_OVERLAY_DOM_SELECTORS = {
  rightAnglePath: '[data-right-angle-corner-path="true"]',
  rightAngleDot: '[data-right-angle-corner-dot="true"]',
} as const;

export type RightAngleCornerOverlayProps = {
  strokeColor: string;
  strokeWidthPx: number;
  dotRadiusPx: number;
};

export const RightAngleCornerOverlay = ({
  strokeColor,
  strokeWidthPx,
  dotRadiusPx,
}: RightAngleCornerOverlayProps): ReactElement =>
  createElement(
    "svg",
    {
      width: "100%",
      height: "100%",
      style: {
        overflow: "visible",
        pointerEvents: "none",
      },
    },
    createElement("path", {
      "data-right-angle-corner-path": "true",
      fill: "none",
      stroke: strokeColor,
      strokeWidth: strokeWidthPx,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
    createElement("circle", {
      "data-right-angle-corner-dot": "true",
      r: dotRadiusPx,
      fill: strokeColor,
    })
  );

export const createRightAngleCornerOverlayContent = (
  props: RightAngleCornerOverlayProps
): ReactElement => createElement(RightAngleCornerOverlay, props);

export const applyRightAngleCornerOverlayLayout = ({
  elementDiv,
  pathData,
  dotScreen,
  minX,
  minY,
  width,
  height,
  paddingPx,
  clickable,
}: {
  elementDiv: HTMLElement;
  pathData: string;
  dotScreen: CssPixelPosition;
  minX: number;
  minY: number;
  width: number;
  height: number;
  paddingPx: number;
  clickable: boolean;
}) => {
  const pathEl = elementDiv.querySelector(
    EDGE_OVERLAY_DOM_SELECTORS.rightAnglePath
  ) as SVGPathElement | null;
  if (pathEl) {
    pathEl.setAttribute("d", pathData);
  }

  const dotEl = elementDiv.querySelector(
    EDGE_OVERLAY_DOM_SELECTORS.rightAngleDot
  ) as SVGCircleElement | null;
  if (dotEl) {
    dotEl.setAttribute("cx", `${dotScreen.x - minX + paddingPx}`);
    dotEl.setAttribute("cy", `${dotScreen.y - minY + paddingPx}`);
  }

  elementDiv.style.position = "absolute";
  elementDiv.style.left = `${minX - paddingPx}px`;
  elementDiv.style.top = `${minY - paddingPx}px`;
  elementDiv.style.width = `${width}px`;
  elementDiv.style.height = `${height}px`;
  elementDiv.style.transform = "none";
  elementDiv.style.zIndex = "10";
  elementDiv.style.pointerEvents = clickable ? "auto" : "none";
  elementDiv.style.cursor = clickable ? "pointer" : "default";
};

export type MidpointMarkerOverlayProps = {
  tickLengthPx: number;
  tickWidthPx: number;
  tickColor: string;
};

export const MidpointMarkerOverlay = ({
  tickLengthPx,
  tickWidthPx,
  tickColor,
}: MidpointMarkerOverlayProps): ReactElement =>
  createElement(
    "div",
    {
      style: {
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      },
    },
    createElement("div", {
      style: {
        position: "absolute",
        left: "50%",
        top: "50%",
        width: `${tickLengthPx}px`,
        height: `${tickWidthPx}px`,
        borderRadius: "999px",
        background: tickColor,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      },
    })
  );

export const createMidpointMarkerOverlayContent = (
  props: MidpointMarkerOverlayProps
): ReactElement => createElement(MidpointMarkerOverlay, props);

export const applyMidpointMarkerOverlayLayout = ({
  elementDiv,
  center,
  angleDeg,
  hitTargetPx,
  clickable,
}: {
  elementDiv: HTMLElement;
  center: CssPixelPosition;
  angleDeg: number;
  hitTargetPx: number;
  clickable: boolean;
}) => {
  elementDiv.style.position = "absolute";
  elementDiv.style.left = `${center.x}px`;
  elementDiv.style.top = `${center.y}px`;
  elementDiv.style.width = `${hitTargetPx}px`;
  elementDiv.style.height = `${hitTargetPx}px`;
  elementDiv.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
  elementDiv.style.transformOrigin = "50% 50%";
  elementDiv.style.pointerEvents = clickable ? "auto" : "none";
  elementDiv.style.cursor = clickable ? "pointer" : "default";
};
