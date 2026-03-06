import React from "react";

export type PointLabelStemAnchorPoints = {
  startDistancePx: number;
  endDistancePx: number;
};

interface PointLabelStemProps {
  angleRad: number;
  anchors: PointLabelStemAnchorPoints;
  lineColor: string;
  lineWidth: number;
  isOccluded: boolean;
  transition?: string;
}

export const PointLabelStem = ({
  angleRad,
  anchors,
  lineColor,
  lineWidth,
  isOccluded,
  transition,
}: PointLabelStemProps) => {
  const halfLineWidth = lineWidth / 2;
  const lineLength = Math.max(
    0,
    anchors.endDistancePx - anchors.startDistancePx
  );
  const borderStyle = `${lineWidth}px ${
    isOccluded ? "dashed" : "solid"
  } ${lineColor}`;

  return (
    <div
      style={{
        position: "absolute",
        left: "0px",
        top: "0px",
        transformOrigin: "0 0",
        transform: `rotate(${angleRad}rad)`,
        pointerEvents: "none",
        transition,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${anchors.startDistancePx}px`,
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
