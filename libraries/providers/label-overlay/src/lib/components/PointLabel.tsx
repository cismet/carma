import React, { useEffect, useRef, useState } from "react";

export interface PointLabelStyleProps {
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  textColor?: string;
  textBackgroundColor?: string;
  selectedBackgroundColor?: string;
  hoverBackgroundColor?: string;
  lineWidth?: number;
  lineColor?: string;
  markerSize?: number;
  markerStrokeWidth?: number;
  stemReferenceMarkerSize?: number;
  labelDistance?: number;
}

export type PointLabelAttach =
  | "bottomLeft"
  | "topLeft"
  | "topRight"
  | "bottomRight";

interface PointLabelProps extends PointLabelStyleProps {
  text: React.ReactNode;
  selected?: boolean;
  isOccluded?: boolean;
  pitch?: number;
  labelAngleRad?: number;
  labelAttach?: PointLabelAttach;
  transitionDurationMs?: number;
  hideLabelAndStem?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onLongPress?: () => void;
  longPressDurationMs?: number;
  onHoverChange?: (hovered: boolean) => void;
}

const baseStyles: React.CSSProperties = {
  padding: "2px 4px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
};

const defaultPitch = -Math.PI / 4;

export const PointLabel = React.memo(
  ({
    text,
    selected = false,
    fontSize = "12px",
    fontFamily = "Arial, sans-serif",
    fontWeight = "400",
    textColor = "black",
    textBackgroundColor = "rgba(200, 200, 200, 0.7)",
    selectedBackgroundColor = "rgba(255, 229, 143, 0.7)",
    hoverBackgroundColor = "rgba(255, 247, 230, 0.7)",
    isOccluded = false,
    pitch = defaultPitch,
    labelAngleRad,
    labelAttach = "bottomLeft",
    transitionDurationMs = 300,
    hideLabelAndStem = false,
    lineColor = "white",
    lineWidth = 1,
    markerSize = 10,
    markerStrokeWidth = 1,
    stemReferenceMarkerSize,
    labelDistance = 20,
    onClick,
    onDoubleClick,
    onLongPress,
    longPressDurationMs = 300,
    onHoverChange,
  }: PointLabelProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isAttachTransitionActive, setIsAttachTransitionActive] =
      useState(false);
    const previousAttachRef = useRef<PointLabelAttach>(labelAttach);
    const isHoveredRef = useRef(false);
    const clickTimeoutRef = useRef<number | undefined>(undefined);
    const longPressTimeoutRef = useRef<number | undefined>(undefined);
    const longPressTriggeredRef = useRef(false);
    const effectiveLabelAngleRad =
      labelAngleRad !== undefined ? labelAngleRad : -Math.abs(Math.cos(pitch));
    const xComponent = Math.cos(effectiveLabelAngleRad);
    const yComponent = Math.sin(effectiveLabelAngleRad);
    const radius = markerSize / 2;
    const stemReferenceRadius = (stemReferenceMarkerSize ?? markerSize) / 2;
    const lineLength = Math.max(0, labelDistance - stemReferenceRadius);
    const labelAnchorDistance = radius + lineLength;
    const labelOffsetX = xComponent * labelAnchorDistance;
    const labelOffsetY = yComponent * labelAnchorDistance;
    const halfLineWidth = lineWidth / 2;
    const isInteractive = Boolean(
      onClick || onDoubleClick || onLongPress || onHoverChange
    );
    const pointerEvents = isInteractive ? "auto" : "none";
    const cursor =
      onClick || onDoubleClick || onLongPress ? "pointer" : "default";
    const effectiveLineColor = lineColor;
    const effectiveTextColor = textColor;
    const effectiveBackgroundColor = selected
      ? selectedBackgroundColor
      : isHovered
      ? hoverBackgroundColor
      : textBackgroundColor;
    const handleMouseEnter = () => {
      if (!isInteractive || isHoveredRef.current) return;
      isHoveredRef.current = true;
      setIsHovered(true);
      onHoverChange?.(true);
    };
    const handleMouseLeave = () => {
      clearLongPressTimeout();
      if (!isInteractive || !isHoveredRef.current) return;
      isHoveredRef.current = false;
      setIsHovered(false);
      onHoverChange?.(false);
    };
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      if (!onClick) return;
      if (!onDoubleClick) {
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
      }, 220);
    };
    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (clickTimeoutRef.current !== undefined) {
        window.clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = undefined;
      }
      onDoubleClick?.();
    };
    const clearLongPressTimeout = () => {
      if (longPressTimeoutRef.current !== undefined) {
        window.clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = undefined;
      }
    };
    const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (!onLongPress) return;
      longPressTriggeredRef.current = false;
      clearLongPressTimeout();
      longPressTimeoutRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLongPress();
      }, longPressDurationMs);
    };
    const handleMouseUp = () => {
      clearLongPressTimeout();
    };
    const labelTransform =
      labelAttach === "topLeft"
        ? "translate(0%, 0%)"
        : labelAttach === "topRight"
        ? "translate(-100%, 0%)"
        : labelAttach === "bottomRight"
        ? "translate(-100%, -100%)"
        : "translate(0%, -100%)";
    const isTopAttach = labelAttach === "topLeft" || labelAttach === "topRight";
    const lineBorderStyle = `${lineWidth}px ${
      isOccluded ? "dashed" : "solid"
    } ${lineColor}`;
    const labelBorderStyle = `${lineWidth}px ${
      isOccluded ? "dashed" : "solid"
    } ${effectiveLineColor}`;
    const labelTop = isTopAttach
      ? `${labelOffsetY}px`
      : `${labelOffsetY + halfLineWidth}px`;
    const sharedAttachTransition =
      isAttachTransitionActive && transitionDurationMs > 0
        ? `${transitionDurationMs}ms ease`
        : undefined;
    const positionTransition = sharedAttachTransition
      ? `left ${sharedAttachTransition}, top ${sharedAttachTransition}, transform ${sharedAttachTransition}`
      : undefined;
    const angleTransition = sharedAttachTransition
      ? `transform ${sharedAttachTransition}`
      : undefined;
    const stemTransition = sharedAttachTransition
      ? `left ${sharedAttachTransition}, top ${sharedAttachTransition}, width ${sharedAttachTransition}`
      : undefined;

    useEffect(() => {
      if (transitionDurationMs <= 0) {
        previousAttachRef.current = labelAttach;
        setIsAttachTransitionActive(false);
        return;
      }

      const previousAttach = previousAttachRef.current;
      previousAttachRef.current = labelAttach;

      if (previousAttach === labelAttach) {
        return;
      }

      setIsAttachTransitionActive(true);
      const timeoutId = window.setTimeout(() => {
        setIsAttachTransitionActive(false);
      }, transitionDurationMs);

      return () => window.clearTimeout(timeoutId);
    }, [labelAttach, transitionDurationMs]);

    useEffect(
      () => () => {
        if (clickTimeoutRef.current !== undefined) {
          window.clearTimeout(clickTimeoutRef.current);
        }
        if (longPressTimeoutRef.current !== undefined) {
          window.clearTimeout(longPressTimeoutRef.current);
        }
        if (isHoveredRef.current) {
          onHoverChange?.(false);
        }
      },
      [onHoverChange]
    );

    return (
      <div
        style={{
          position: "relative",
          mixBlendMode: "exclusion",
          opacity: isOccluded ? 0.75 : 1,
        }}
      >
        {/* Measurement dot at anchor position */}
        <div
          style={{
            position: "absolute",
            left: "0px",
            top: "0px",
            width: `${markerSize}px`,
            height: `${markerSize}px`,
            border: `${markerStrokeWidth}px ${
              isOccluded ? "dashed" : "solid"
            } #fff`,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents,
            cursor,
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />

        {!hideLabelAndStem && (
          <>
            {/* Transform container for hairline rotation */}
            <div
              style={{
                position: "absolute",
                left: "0px",
                top: "0px",
                transformOrigin: "0 0",
                transform: `rotate(${effectiveLabelAngleRad}rad)`,
                pointerEvents: "none",
                transition: angleTransition,
              }}
            >
              {/* Hairline from circle edge to label */}
              <div
                style={{
                  position: "absolute",
                  left: `${radius}px`,
                  top: isTopAttach ? "0px" : `${-halfLineWidth}px`,
                  width: `${lineLength}px`,
                  height: `${lineWidth}px`,
                  ...(isTopAttach
                    ? { borderTop: lineBorderStyle }
                    : { borderBottom: lineBorderStyle }),
                  transition: stemTransition,
                }}
              />
            </div>

            {/* Label positioned at the end of the hairline */}
            <div
              style={{
                ...baseStyles,
                ...(isTopAttach
                  ? { borderTop: labelBorderStyle }
                  : { borderBottom: labelBorderStyle }),
                fontSize,
                fontFamily,
                fontWeight,
                backgroundColor: effectiveBackgroundColor,
                color: effectiveTextColor,
                position: "absolute",
                left: `${labelOffsetX}px`,
                top: labelTop,
                transform: labelTransform,
                pointerEvents,
                cursor,
                transition: positionTransition,
              }}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {text}
            </div>
          </>
        )}
      </div>
    );
  }
);
