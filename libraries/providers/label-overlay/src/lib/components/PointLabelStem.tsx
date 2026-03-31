import React from "react";

import type { CssPixelPosition } from "@carma/units/types";
export type PointLabelStemAnchorPoints = {
  startDistancePx: number;
  endDistancePx: number;
};

export type PointLabelStemLinePoints = {
  startPoint: CssPixelPosition;
  endPoint: CssPixelPosition;
};

type PointLabelStemProps =
  | {
      angleRad: number;
      anchors: PointLabelStemAnchorPoints;
      lineColor: string;
      lineWidth: number;
      isOccluded: boolean;
      transition?: string;
    }
  | {
      startPoint: CssPixelPosition;
      endPoint: CssPixelPosition;
      lineColor: string;
      lineWidth: number;
      isOccluded: boolean;
      transition?: string;
    };

const resolveStemLinePoints = (
  props: PointLabelStemProps
): PointLabelStemLinePoints => {
  if ("startPoint" in props) {
    return {
      startPoint: props.startPoint,
      endPoint: props.endPoint,
    };
  }

  const { angleRad, anchors } = props;
  return {
    startPoint: {
      x: Math.cos(angleRad) * anchors.startDistancePx,
      y: Math.sin(angleRad) * anchors.startDistancePx,
    } as CssPixelPosition,
    endPoint: {
      x: Math.cos(angleRad) * anchors.endDistancePx,
      y: Math.sin(angleRad) * anchors.endDistancePx,
    } as CssPixelPosition,
  };
};

export const PointLabelStem = (props: PointLabelStemProps) => {
  const { lineColor, lineWidth, isOccluded, transition } = props;
  const { startPoint, endPoint } = resolveStemLinePoints(props);
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const angleRad = Math.atan2(dy, dx);
  const lineLength = Math.max(0, Math.hypot(dx, dy));
  const halfLineWidth = lineWidth / 2;
  const borderStyle = `${lineWidth}px ${
    isOccluded ? "dashed" : "solid"
  } ${lineColor}`;

  return (
    <div
      style={{
        position: "absolute",
        left: `${startPoint.x}px`,
        top: `${startPoint.y}px`,
        transformOrigin: "0 0",
        transform: `rotate(${angleRad}rad)`,
        pointerEvents: "none",
        transition,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "0px",
          top: `${-halfLineWidth}px`,
          width: `${lineLength}px`,
          height: `${lineWidth}px`,
          borderBottom: borderStyle,
          transition,
        }}
      />
    </div>
  );
};
