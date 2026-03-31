import React from "react";

import { Button } from "antd";

import type { PointLabelAttach } from "../core/pointLabelAttach";
export type { PointLabelAttach };

export type PillbuttonMountSide = "left" | "center" | "right";

export const resolvePillbuttonMountSide = (
  labelAttach: PointLabelAttach
): PillbuttonMountSide => labelAttach;

export const getPillbuttonAnchorTransform = (
  labelAttach: PointLabelAttach
): string =>
  resolvePillbuttonMountSide(labelAttach) === "right"
    ? "translate(-100%, -50%)"
    : resolvePillbuttonMountSide(labelAttach) === "left"
    ? "translate(0%, -50%)"
    : "translate(-50%, -50%)";

export const getPillbuttonAnchorBorderStyle = (
  labelAttach: PointLabelAttach,
  borderStyle: string
): React.CSSProperties =>
  resolvePillbuttonMountSide(labelAttach) === "right"
    ? { borderRight: borderStyle }
    : resolvePillbuttonMountSide(labelAttach) === "left"
    ? { borderLeft: borderStyle }
    : { borderLeft: borderStyle, borderRight: borderStyle };

interface PointLabelMarkerProps {
  pointId?: string;
  markerContent?: React.ReactNode;
  markerSize: number;
  markerStrokeWidth: number;
  isOccluded: boolean;
  markerBackgroundColor: string;
  markerTextColor: string;
  pointerEvents: React.CSSProperties["pointerEvents"];
  cursor: React.CSSProperties["cursor"];
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => void;
}

export const PointLabelMarker = ({
  pointId,
  markerContent,
  markerSize,
  markerStrokeWidth,
  isOccluded,
  markerBackgroundColor,
  markerTextColor,
  pointerEvents,
  cursor,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseUp,
  onMouseEnter,
  onMouseLeave,
}: PointLabelMarkerProps) => {
  return (
    <div
      data-point-label-interactive="true"
      data-point-label-id={pointId}
      style={{
        position: "absolute",
        left: "0px",
        top: "0px",
        transform: "translate(-50%, -50%)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
        pointerEvents,
        cursor,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {markerContent ? (
        <Button
          shape="circle"
          size="small"
          tabIndex={-1}
          style={{
            minWidth: `${markerSize}px`,
            width: `${markerSize}px`,
            height: `${markerSize}px`,
            padding: 0,
            margin: 0,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: markerStrokeWidth,
            borderStyle: isOccluded ? "dotted" : "solid",
            borderColor: "#fff",
            backgroundColor: markerBackgroundColor,
            color: markerTextColor,
            fontSize: markerSize <= 16 ? "10px" : "11px",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            fontFeatureSettings: '"tnum"',
            boxShadow: "0 0 2px rgba(0,0,0,0.55)",
            pointerEvents: "none",
          }}
        >
          {markerContent}
        </Button>
      ) : (
        <div
          style={{
            width: `${markerSize}px`,
            height: `${markerSize}px`,
            border: `${markerStrokeWidth}px ${
              isOccluded ? "dotted" : "solid"
            } #fff`,
            borderRadius: "50%",
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
};
