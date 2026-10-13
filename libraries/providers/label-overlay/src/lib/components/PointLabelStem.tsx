import React from "react";

import type { CssPixelPosition } from "@carma-units";

type PointLabelStemProps = {
  startPoint: CssPixelPosition;
  endPoint: CssPixelPosition;
  lineColor: string;
  lineWidth: number;
  isOccluded: boolean;
  hidden?: boolean;
  transition?: string;
};

export const PointLabelStem = ({
  startPoint,
  endPoint,
  lineColor,
  lineWidth,
  isOccluded,
  hidden = false,
  transition,
}: PointLabelStemProps) => {
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
      data-point-label-stem="true"
      style={{
        position: "absolute",
        display: hidden ? "none" : undefined,
        left: `${startPoint.x}px`,
        top: `${startPoint.y}px`,
        transformOrigin: "0 0",
        transform: `rotate(${angleRad}rad)`,
        pointerEvents: "none",
        transition,
      }}
    >
      <div
        data-point-label-stem-line="true"
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
