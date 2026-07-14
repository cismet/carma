import React, { useEffect, useMemo, useRef } from "react";
import {
  degToRadNumeric,
  negativePiToPi,
  type CssPixels,
  type Radians,
} from "@carma-units";

import {
  resolveOverlayLineLabelPlacement,
  type LineLabelPlacementOptions,
} from "./lineLabelPlacement";
import type { LineVisualizerData } from "./lineVisualizers.types";
import { labelOverlayLayerDefaults } from "./overlayAffordanceDefaults";
import { getOverlayReferenceSignature } from "./overlayReferenceSignature";
import { useLabelOverlay } from "./useLabelOverlay";
import { createSvgLineScratch, resolveSvgLine } from "./utils/resolveSvgLine";

const lineLabelVisualizerDefaults = Object.freeze({
  overlayZIndex: labelOverlayLayerDefaults.zIndex.lineLabel,
  placement: Object.freeze({
    sideHysteresisPx: 1.5,
    positionStabilityEpsilonPx: 0.85,
    angleStabilityEpsilonRad: degToRadNumeric(0.75)! as Radians,
  }),
  visibility: Object.freeze({
    minPaddingPx: 6,
    minLineLengthPx: 50,
    hysteresisPx: 2,
  }),
  theme: Object.freeze({
    color: "#000000",
    stroke: "rgba(255, 255, 255, 0.95)",
    fontSizePx: 12,
    fontFamily: "Arial, sans-serif",
    fontWeight: "400",
    pillBackgroundColor: "rgba(200, 200, 200, 0.36)",
    pillBorderColor: "rgba(255, 255, 255, 0.28)",
  }),
});

const getLineLabelOverlayId = (lineId: string): string =>
  `line-label-visualizer-${lineId}`;

const buildLineLabelTextShadow = (strokeColor: string): string =>
  [`0 1px 2px rgba(0, 0, 0, 0.68)`, `0 0 10px ${strokeColor}`].join(", ");

const createLineLabelOverlayContent = (line: LineVisualizerData) => {
  const color = line.labelColor ?? lineLabelVisualizerDefaults.theme.color;
  const stroke = line.labelStroke ?? lineLabelVisualizerDefaults.theme.stroke;
  const fontSizePx =
    line.labelFontSize ?? lineLabelVisualizerDefaults.theme.fontSizePx;
  const fontFamily =
    line.labelFontFamily ?? lineLabelVisualizerDefaults.theme.fontFamily;
  const fontWeight =
    line.labelFontWeight ?? lineLabelVisualizerDefaults.theme.fontWeight;
  const showPill = Boolean(line.labelPill && line.labelText);
  const pillBackgroundColor =
    line.labelPillBackgroundColor ??
    lineLabelVisualizerDefaults.theme.pillBackgroundColor;
  const pillBorderColor =
    line.labelPillBorderColor ??
    lineLabelVisualizerDefaults.theme.pillBorderColor;
  const pillBorderWidth = line.labelPillBorderWidth ?? 0;

  return React.createElement(
    "div",
    {
      "data-anchored-line-label-root": "true",
      style: {
        position: "absolute",
        left: 0,
        top: 0,
        transform: "translate(-50%, -50%)",
        transformOrigin: "center center",
        whiteSpace: "nowrap",
        lineHeight: 1,
        userSelect: "none",
        pointerEvents: "none",
      },
    },
    React.createElement(
      "span",
      {
        "data-anchored-line-label-text": "true",
        style: {
          display: "inline-block",
          color,
          fontSize: `${fontSizePx}px`,
          fontFamily,
          fontWeight,
          lineHeight: 1,
          textShadow: buildLineLabelTextShadow(stroke),
          padding: showPill ? "3px 8px" : "0px",
          borderRadius: showPill ? "999px" : "0px",
          backgroundColor: showPill ? pillBackgroundColor : "transparent",
          border:
            showPill && pillBorderWidth > 0
              ? `${pillBorderWidth}px solid ${pillBorderColor}`
              : "none",
          boxSizing: "border-box",
        },
      },
      line.labelText
    )
  );
};

const buildLineLabelSignature = (line: LineVisualizerData): string => {
  const tokens = [
    line.id,
    `${line.visible}`,
    `${line.isHidden}`,
    `${line.labelText}`,
    `${line.labelColor}`,
    `${line.labelStroke}`,
    `${line.labelFontSize}`,
    `${line.labelFontFamily}`,
    `${line.labelFontWeight}`,
    `${line.labelPill ?? false}`,
    `${line.labelPillBackgroundColor ?? ""}`,
    `${line.labelPillBorderColor ?? ""}`,
    `${line.labelPillBorderWidth ?? ""}`,
    `${line.labelMinLineLengthPx}`,
    `${line.labelOffsetPx}`,
    `${line.labelFlippedBaselineOffsetPx ?? ""}`,
    `${line.anchorRatio ?? ""}`,
    `${line.labelRotationMode ?? "auto"}`,
    getOverlayReferenceSignature(line.onLabelClick),
    getOverlayReferenceSignature(line.onLineClick),
    `${line.contentSignature ?? ""}`,
  ];

  return tokens.join(":");
};

const resolveLineLabelPlacementOptions = (
  line: LineVisualizerData
): LineLabelPlacementOptions => ({
  labelOffsetPx: line.labelOffsetPx,
  labelFlippedBaselineOffsetPx: line.labelFlippedBaselineOffsetPx,
  labelRotationMode: line.labelRotationMode,
  anchorRatio: line.anchorRatio,
  getLabelOutsideReferencePoint: line.getLabelOutsideReferencePoint,
  getLabelInsideReferencePoint: line.getLabelInsideReferencePoint,
});

const buildLineLabelOverlayUpdatePosition = (line: LineVisualizerData) => {
  const svgLineScratch = createSvgLineScratch();
  return (elementDiv: HTMLElement) => {
    const svgLine = resolveSvgLine({
      getSvgLine: line.getSvgLine,
      scratch: svgLineScratch,
    });
    if (!svgLine || !line.labelText) return false;

    const labelRootEl = elementDiv.querySelector(
      '[data-anchored-line-label-root="true"]'
    ) as HTMLDivElement | null;
    const labelTextEl = elementDiv.querySelector(
      '[data-anchored-line-label-text="true"]'
    ) as HTMLSpanElement | null;
    if (!labelRootEl || !labelTextEl) return false;

    const placement = resolveOverlayLineLabelPlacement({
      svgLine,
      options: resolveLineLabelPlacementOptions(line),
      previousShouldFlip: elementDiv.dataset.normalFlip === "1",
      sideSwitchThresholdPx:
        lineLabelVisualizerDefaults.placement.sideHysteresisPx,
    });
    if (!placement) {
      return false;
    }
    elementDiv.dataset.normalFlip = placement.shouldFlip ? "1" : "0";

    const previousTextX = Number.parseFloat(
      elementDiv.dataset.stableTextX ?? ""
    );
    const previousTextY = Number.parseFloat(
      elementDiv.dataset.stableTextY ?? ""
    );
    const hasPreviousTextPosition =
      Number.isFinite(previousTextX) && Number.isFinite(previousTextY);
    const stableTextPosition =
      hasPreviousTextPosition &&
      Math.hypot(
        placement.textX - previousTextX,
        placement.textY - previousTextY
      ) <= lineLabelVisualizerDefaults.placement.positionStabilityEpsilonPx
        ? { x: previousTextX as CssPixels, y: previousTextY as CssPixels }
        : { x: placement.textX, y: placement.textY };

    const previousAngleRad = Number.parseFloat(
      elementDiv.dataset.stableAngleRad ?? ""
    );
    const hasPreviousAngle = Number.isFinite(previousAngleRad);
    const normalizedAngleDelta = hasPreviousAngle
      ? Math.abs(
          negativePiToPi((placement.angleRad - previousAngleRad) as Radians)
        )
      : Number.POSITIVE_INFINITY;
    const stableAngleRad =
      hasPreviousAngle &&
      normalizedAngleDelta <=
        lineLabelVisualizerDefaults.placement.angleStabilityEpsilonRad
        ? (previousAngleRad as Radians)
        : placement.angleRad;

    elementDiv.dataset.stableTextX = `${stableTextPosition.x}`;
    elementDiv.dataset.stableTextY = `${stableTextPosition.y}`;
    elementDiv.dataset.stableAngleRad = `${stableAngleRad}`;

    labelRootEl.style.transform = [
      `translate(${stableTextPosition.x}px, ${stableTextPosition.y}px)`,
      "translate(-50%, -50%)",
      `rotate(${stableAngleRad}rad)`,
    ].join(" ");

    const textWidthPx = labelTextEl.getBoundingClientRect().width;
    const minLabelLineLengthPx =
      line.labelMinLineLengthPx ??
      lineLabelVisualizerDefaults.visibility.minLineLengthPx;
    const previousVisible = elementDiv.dataset.labelVisible === "1";
    const lengthThreshold = previousVisible
      ? minLabelLineLengthPx -
        lineLabelVisualizerDefaults.visibility.hysteresisPx
      : minLabelLineLengthPx +
        lineLabelVisualizerDefaults.visibility.hysteresisPx;
    const fitThreshold = previousVisible
      ? placement.lineLengthPx +
        lineLabelVisualizerDefaults.visibility.hysteresisPx
      : placement.lineLengthPx -
        lineLabelVisualizerDefaults.visibility.hysteresisPx;
    const shouldShowLabel =
      placement.lineLengthPx >= lengthThreshold &&
      textWidthPx + lineLabelVisualizerDefaults.visibility.minPaddingPx <=
        fitThreshold;

    elementDiv.dataset.labelVisible = shouldShowLabel ? "1" : "0";
    labelTextEl.style.visibility = shouldShowLabel ? "visible" : "hidden";
    return true;
  };
};

export const useLineLabelVisualizers = (
  lines: LineVisualizerData[],
  showLines: boolean = true
) => {
  const { setLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();
  const previousLineLabelSignatureByIdRef = useRef<Map<string, string>>(
    new Map()
  );

  const lineLabelSignatureById = useMemo(
    () =>
      new Map(lines.map((line) => [line.id, buildLineLabelSignature(line)])),
    [lines]
  );

  const lineIndexById = useMemo(
    () => new Map(lines.map((line) => [line.id, line])),
    [lines]
  );

  useEffect(() => {
    if (!showLines) {
      previousLineLabelSignatureByIdRef.current.forEach((_, lineId) => {
        removeLabelOverlayElement(getLineLabelOverlayId(lineId));
      });
      previousLineLabelSignatureByIdRef.current.clear();
      return;
    }

    const nextLabelSignatureById = new Map<string, string>();
    lineIndexById.forEach((line, lineId) => {
      const labelOverlayId = getLineLabelOverlayId(line.id);
      const labelClickHandler = line.onLabelClick ?? line.onLineClick;
      if (!line.labelText) {
        removeLabelOverlayElement(labelOverlayId);
        return;
      }

      const nextLabelSignature = lineLabelSignatureById.get(lineId) ?? "";
      nextLabelSignatureById.set(lineId, nextLabelSignature);
      setLabelOverlayElement({
        id: labelOverlayId,
        zIndex: lineLabelVisualizerDefaults.overlayZIndex,
        contentKey: nextLabelSignature,
        content: createLineLabelOverlayContent(line),
        visible: line.visible !== false && line.isHidden !== true,
        onClick: labelClickHandler,
        cursor: labelClickHandler ? "pointer" : undefined,
        updatePosition: buildLineLabelOverlayUpdatePosition(line),
      });
    });

    previousLineLabelSignatureByIdRef.current.forEach((_, previousLineId) => {
      if (nextLabelSignatureById.has(previousLineId)) return;
      removeLabelOverlayElement(getLineLabelOverlayId(previousLineId));
    });
    previousLineLabelSignatureByIdRef.current = nextLabelSignatureById;
  }, [
    showLines,
    lineIndexById,
    lineLabelSignatureById,
    setLabelOverlayElement,
    removeLabelOverlayElement,
  ]);

  useEffect(
    () => () => {
      previousLineLabelSignatureByIdRef.current.forEach((_, lineId) => {
        removeLabelOverlayElement(getLineLabelOverlayId(lineId));
      });
      previousLineLabelSignatureByIdRef.current.clear();
    },
    [removeLabelOverlayElement]
  );
};
