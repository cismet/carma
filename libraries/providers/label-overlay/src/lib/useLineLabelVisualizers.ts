import React, { useEffect, useMemo, useRef } from "react";

import { AnchoredLineLabel } from "./components/AnchoredLineLabel";
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
          updatePosition: buildLineLabelOverlayUpdatePosition(line),
        });
        return;
      }

      addLabelOverlayElement({
        id: labelOverlayId,
        zIndex: LINE_LABEL_OVERLAY_Z_INDEX,
        contentKey: nextLabelSignature,
        content: React.createElement(AnchoredLineLabel, {
          text: line.labelText,
          color: line.labelColor,
          stroke: line.labelStroke,
          fontSize: line.labelFontSize,
          fontFamily: line.labelFontFamily,
          fontWeight: line.labelFontWeight,
          pill: line.labelPill,
          pillBackgroundColor: line.labelPillBackgroundColor,
          onClick: line.onLabelClick ?? line.onLineClick,
        }),
        visible: line.visible !== false,
        isHidden: line.isHidden,
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
