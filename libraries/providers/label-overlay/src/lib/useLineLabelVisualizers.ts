import React, { useEffect, useMemo, useRef } from "react";

import { AnchoredLabelVisualizer } from "./components/AnchoredLabelVisualizer";
import type { LineVisualizerData, SvgLine } from "./lineVisualizers.types";
import { useLabelOverlay } from "./useLabelOverlay";
import { createSvgLineScratch, resolveSvgLine } from "./utils/resolveSvgLine";

const MIN_LINE_LENGTH_PX = 0.0001;
const DEFAULT_MIN_LABEL_LINE_LENGTH_PX = 50;
const LABEL_OFFSET_PX = 10;
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
    `${line.labelPillBorderColor ?? ""}`,
    `${line.labelPillBorderWidth ?? ""}`,
    `${line.labelMinLineLengthPx}`,
    `${line.labelOffsetPx}`,
    `${line.labelFlippedBaselineOffsetPx ?? ""}`,
    `${line.labelRotationMode ?? "auto"}`,
    `${line.labelDominantBaseline ?? "middle"}`,
    getOverlayReferenceSignature(line.onLabelClick),
    getOverlayReferenceSignature(line.onLineClick),
    `${line.contentSignature ?? ""}`,
  ];

  return tokens.join(":");
};

const resolveLineLabelPlacement = ({
  line,
  svgLine,
  previousShouldFlip,
}: {
  line: LineVisualizerData;
  svgLine: SvgLine;
  previousShouldFlip: boolean;
}) => {
  const dx = svgLine.end.x - svgLine.start.x;
  const dy = svgLine.end.y - svgLine.start.y;
  const lineLength = Math.hypot(dx, dy);
  if (lineLength <= MIN_LINE_LENGTH_PX) {
    return null;
  }

  const midX = (svgLine.start.x + svgLine.end.x) * 0.5;
  const midY = (svgLine.start.y + svgLine.end.y) * 0.5;
  let normalX = -dy / lineLength;
  let normalY = dx / lineLength;
  const outsideRef = line.getLabelOutsideReferencePoint?.();
  const insideRef = line.getLabelInsideReferencePoint?.();
  let shouldFlip = previousShouldFlip;
  const sideReferencePoint = outsideRef ?? insideRef;

  if (sideReferencePoint) {
    const refDx = sideReferencePoint.x - midX;
    const refDy = sideReferencePoint.y - midY;
    const dotWithNormal = refDx * normalX + refDy * normalY;

    // Orient label normal toward the selected side reference point.
    // Positive dot means the current normal already points to the target side.
    if (dotWithNormal > LABEL_SIDE_HYSTERESIS_PX) {
      shouldFlip = false;
    } else if (dotWithNormal < -LABEL_SIDE_HYSTERESIS_PX) {
      shouldFlip = true;
    }
  }

  if (shouldFlip) {
    normalX = -normalX;
    normalY = -normalY;
  }

  const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const angleDeg =
    line.labelRotationMode === "clockwise"
      ? (rawAngleDeg + 360) % 360
      : (() => {
          const crossProduct =
            (dx / lineLength) * normalY - (dy / lineLength) * normalX;
          const sideAdjustedAngle =
            crossProduct >= 0 ? rawAngleDeg : rawAngleDeg + 180;
          const normalizedAngle = ((sideAdjustedAngle % 360) + 360) % 360;
          return normalizedAngle > 90 && normalizedAngle < 270
            ? (normalizedAngle + 180) % 360
            : normalizedAngle;
        })();

  const labelOffsetPx = line.labelOffsetPx ?? LABEL_OFFSET_PX;
  const flippedBaselineOffsetPx = shouldFlip
    ? line.labelFlippedBaselineOffsetPx ?? 0
    : 0;
  const angleRad = (angleDeg * Math.PI) / 180;
  const baselineOffsetX = -Math.sin(angleRad) * flippedBaselineOffsetPx;
  const baselineOffsetY = Math.cos(angleRad) * flippedBaselineOffsetPx;

  return {
    lineLength,
    shouldFlip,
    angleDeg,
    textX: midX + normalX * labelOffsetPx + baselineOffsetX,
    textY: midY + normalY * labelOffsetPx + baselineOffsetY,
  };
};

const buildLineLabelOverlayUpdatePosition = (line: LineVisualizerData) => {
  const svgLineScratch = createSvgLineScratch();
  return (elementDiv: HTMLElement) => {
    const svgLine = resolveSvgLine({
      getSvgLine: line.getSvgLine,
      scratch: svgLineScratch,
    });
    if (!svgLine || !line.labelText) return false;

    const labelRootEl = elementDiv.querySelector(
      '[data-anchored-label-root="true"]'
    ) as HTMLDivElement | null;
    const labelTextEl = elementDiv.querySelector(
      '[data-anchored-label-text="true"]'
    ) as HTMLSpanElement | null;
    if (!labelRootEl || !labelTextEl) return false;

    const placement = resolveLineLabelPlacement({
      line,
      svgLine,
      previousShouldFlip: elementDiv.dataset.normalFlip === "1",
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
      ? placement.lineLength + LABEL_VISIBILITY_HYSTERESIS_PX
      : placement.lineLength - LABEL_VISIBILITY_HYSTERESIS_PX;
    const shouldShowLabel =
      placement.lineLength >= lengthThreshold &&
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
        content: React.createElement(AnchoredLabelVisualizer, {
          text: line.labelText,
          color: line.labelColor,
          stroke: line.labelStroke,
          fontSize: line.labelFontSize,
          fontFamily: line.labelFontFamily,
          fontWeight: line.labelFontWeight,
          pill: line.labelPill,
          pillBackgroundColor: line.labelPillBackgroundColor,
          pillBorderColor: line.labelPillBorderColor,
          pillBorderWidth: line.labelPillBorderWidth,
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
