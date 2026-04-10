import React, { useEffect, useMemo, useRef } from "react";

import {
  resolveOverlayLineLabelPlacement,
  type LineLabelPlacementOptions,
} from "./lineLabelPlacement";
import type { LineVisualizerData } from "./lineVisualizers.types";
import { useLabelOverlay } from "./useLabelOverlay";
import { createSvgLineScratch, resolveSvgLine } from "./utils/resolveSvgLine";

const DEFAULT_MIN_LABEL_LINE_LENGTH_PX = 50;
const LABEL_MIN_PADDING_PX = 6;
const LINE_LABEL_OVERLAY_Z_INDEX = 6;
const LABEL_SIDE_HYSTERESIS_PX = 1.5;
const LABEL_POSITION_STABILITY_EPSILON_PX = 0.85;
const LABEL_ANGLE_STABILITY_EPSILON_DEG = 0.75;
const LABEL_VISIBILITY_HYSTERESIS_PX = 2;
const DEFAULT_LINE_LABEL_COLOR = "#000000";
const DEFAULT_LINE_LABEL_STROKE = "rgba(255, 255, 255, 0.95)";
const DEFAULT_LINE_LABEL_FONT_SIZE_PX = 12;
const DEFAULT_LINE_LABEL_FONT_FAMILY = "Arial, sans-serif";
const DEFAULT_LINE_LABEL_FONT_WEIGHT = "400";
const DEFAULT_LINE_LABEL_PILL_BACKGROUND_COLOR = "rgba(200, 200, 200, 0.36)";
const DEFAULT_LINE_LABEL_PILL_BORDER_COLOR = "rgba(255, 255, 255, 0.28)";

const overlayReferenceIdByValue = new WeakMap<object, number>();
let nextOverlayReferenceId = 1;

const getOverlayReferenceSignature = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" || typeof value === "function") {
    const ref = value as object;
    const existingId = overlayReferenceIdByValue.get(ref);
    if (existingId) {
      return `ref:${existingId}`;
    }

    const nextId = nextOverlayReferenceId++;
    overlayReferenceIdByValue.set(ref, nextId);
    return `ref:${nextId}`;
  }

  return String(value);
};

const getLineLabelOverlayId = (lineId: string): string =>
  `line-label-visualizer-${lineId}`;

const buildLineLabelTextShadow = (strokeColor: string): string =>
  [`0 1px 2px rgba(0, 0, 0, 0.68)`, `0 0 10px ${strokeColor}`].join(", ");

const createLineLabelOverlayContent = (line: LineVisualizerData) => {
  const color = line.labelColor ?? DEFAULT_LINE_LABEL_COLOR;
  const stroke = line.labelStroke ?? DEFAULT_LINE_LABEL_STROKE;
  const fontSizePx = line.labelFontSize ?? DEFAULT_LINE_LABEL_FONT_SIZE_PX;
  const fontFamily = line.labelFontFamily ?? DEFAULT_LINE_LABEL_FONT_FAMILY;
  const fontWeight = line.labelFontWeight ?? DEFAULT_LINE_LABEL_FONT_WEIGHT;
  const showPill = Boolean(line.labelPill && line.labelText);
  const pillBackgroundColor =
    line.labelPillBackgroundColor ?? DEFAULT_LINE_LABEL_PILL_BACKGROUND_COLOR;
  const pillBorderColor =
    line.labelPillBorderColor ?? DEFAULT_LINE_LABEL_PILL_BORDER_COLOR;
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
      sideSwitchThresholdPx: LABEL_SIDE_HYSTERESIS_PX,
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
      ) <= LABEL_POSITION_STABILITY_EPSILON_PX
        ? { x: previousTextX, y: previousTextY }
        : { x: placement.textX, y: placement.textY };

    const previousAngleDeg = Number.parseFloat(
      elementDiv.dataset.stableAngleDeg ?? ""
    );
    const hasPreviousAngle = Number.isFinite(previousAngleDeg);
    const normalizedAngleDelta = hasPreviousAngle
      ? Math.abs(((placement.angleDeg - previousAngleDeg + 540) % 360) - 180)
      : Number.POSITIVE_INFINITY;
    const stableAngleDeg =
      hasPreviousAngle &&
      normalizedAngleDelta <= LABEL_ANGLE_STABILITY_EPSILON_DEG
        ? previousAngleDeg
        : placement.angleDeg;

    elementDiv.dataset.stableTextX = `${stableTextPosition.x}`;
    elementDiv.dataset.stableTextY = `${stableTextPosition.y}`;
    elementDiv.dataset.stableAngleDeg = `${stableAngleDeg}`;

    labelRootEl.style.transform = `translate(${stableTextPosition.x}px, ${stableTextPosition.y}px) translate(-50%, -50%) rotate(${stableAngleDeg}deg)`;

    const textWidthPx = labelTextEl.getBoundingClientRect().width;
    const minLabelLineLengthPx =
      line.labelMinLineLengthPx ?? DEFAULT_MIN_LABEL_LINE_LENGTH_PX;
    const previousVisible = elementDiv.dataset.labelVisible === "1";
    const lengthThreshold = previousVisible
      ? minLabelLineLengthPx - LABEL_VISIBILITY_HYSTERESIS_PX
      : minLabelLineLengthPx + LABEL_VISIBILITY_HYSTERESIS_PX;
    const fitThreshold = previousVisible
      ? placement.lineLengthPx + LABEL_VISIBILITY_HYSTERESIS_PX
      : placement.lineLengthPx - LABEL_VISIBILITY_HYSTERESIS_PX;
    const shouldShowLabel =
      placement.lineLengthPx >= lengthThreshold &&
      textWidthPx + LABEL_MIN_PADDING_PX <= fitThreshold;

    elementDiv.dataset.labelVisible = shouldShowLabel ? "1" : "0";
    labelTextEl.style.visibility = shouldShowLabel ? "visible" : "hidden";
    return true;
  };
};

export const useLineLabelVisualizers = (
  lines: LineVisualizerData[],
  showLines: boolean = true
) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
  } = useLabelOverlay();
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
      const previousLabelSignature =
        previousLineLabelSignatureByIdRef.current.get(lineId) ?? null;
      if (previousLabelSignature === nextLabelSignature) {
        updateLabelOverlayElement(labelOverlayId, {
          visible: line.visible !== false,
          isHidden: line.isHidden,
          onClick: labelClickHandler,
          cursor: labelClickHandler ? "pointer" : undefined,
          updatePosition: buildLineLabelOverlayUpdatePosition(line),
        });
        return;
      }

      addLabelOverlayElement({
        id: labelOverlayId,
        zIndex: LINE_LABEL_OVERLAY_Z_INDEX,
        contentKey: nextLabelSignature,
        content: createLineLabelOverlayContent(line),
        visible: line.visible !== false,
        isHidden: line.isHidden,
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
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
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
