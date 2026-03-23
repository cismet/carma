import React, { useEffect, useMemo, useRef } from "react";
import {
  resolveSvgLineDasharray,
  type SvgLineDasharrayCache,
} from "@carma-commons/svg";

import { LineVisualizer } from "./components/LineVisualizer";
import type { LineVisualizerData, SvgLine } from "./lineVisualizers.types";
import { useLabelOverlay } from "./useLabelOverlay";
import { createSvgLineScratch, resolveSvgLine } from "./utils/resolveSvgLine";

const LINE_OVERLAY_Z_INDEX = 5;

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

const getLineOverlayId = (lineId: string): string =>
  `line-visualizer-${lineId}`;

const setSvgAnimatedLength = ({
  lineEl,
  key,
  value,
}: {
  lineEl: SVGLineElement;
  key: "x1" | "y1" | "x2" | "y2";
  value: number;
}) => {
  const animatedLength = lineEl[key];
  if (
    animatedLength &&
    typeof animatedLength === "object" &&
    animatedLength.baseVal &&
    typeof animatedLength.baseVal.value === "number"
  ) {
    animatedLength.baseVal.value = value;
    return;
  }
  lineEl.setAttribute(key, `${value}`);
};

const setSvgLineAttributes = (lineEl: SVGLineElement, line: SvgLine) => {
  // Benchmark note:
  // Chromium update microbenchmarks showed baseVal writes on <line> are
  // significantly faster than setAttribute for per-frame updates and faster
  // than <path d=\"...\"> updates for our workload.
  setSvgAnimatedLength({ lineEl, key: "x1", value: line.start.x });
  setSvgAnimatedLength({ lineEl, key: "y1", value: line.start.y });
  setSvgAnimatedLength({ lineEl, key: "x2", value: line.end.x });
  setSvgAnimatedLength({ lineEl, key: "y2", value: line.end.y });
};

const buildLineGeometrySignature = (line: LineVisualizerData): string => {
  const tokens = [
    line.id,
    `${line.visible}`,
    `${line.isHidden}`,
    `${line.stroke}`,
    `${line.strokeWidth}`,
    `${line.strokeLinecap}`,
    `${line.strokeDasharray}`,
    `${line.strokeDashoffset}`,
    `${line.dynamicDashPattern?.dashLengthToStrokeWidthRatio ?? ""}`,
    `${line.dynamicDashPattern?.dashGapToDashLengthRatio ?? ""}`,
    `${line.dynamicDashPattern?.collapseNegativeGaps ?? ""}`,
    `${line.dynamicDashPattern?.collapseCapThresholdEffectiveGapRatio ?? ""}`,
    `${line.opacity}`,
    `${line.hitTargetStrokeWidth}`,
    `${line.longPressDurationMs ?? ""}`,
    getOverlayReferenceSignature(line.onLineClick),
    getOverlayReferenceSignature(line.onLineLongPress),
    `${line.contentSignature ?? ""}`,
  ];

  return tokens.join(":");
};

const buildLineDashCacheSignature = (line: LineVisualizerData): string =>
  [
    `${line.strokeWidth}`,
    `${line.strokeLinecap}`,
    `${line.dynamicDashPattern?.dashLengthToStrokeWidthRatio ?? ""}`,
    `${line.dynamicDashPattern?.dashGapToDashLengthRatio ?? ""}`,
    `${line.dynamicDashPattern?.collapseNegativeGaps ?? ""}`,
    `${line.dynamicDashPattern?.collapseCapThresholdEffectiveGapRatio ?? ""}`,
  ].join(":");

const buildLineOverlayUpdatePosition = (
  line: LineVisualizerData,
  dasharrayCache: SvgLineDasharrayCache | undefined
) => {
  const svgLineScratch = createSvgLineScratch();
  return (elementDiv: HTMLElement) => {
    const svgLine = resolveSvgLine({
      getSvgLine: line.getSvgLine,
      scratch: svgLineScratch,
    });
    if (!svgLine) return false;

    const lineEl = elementDiv.querySelector(
      '[data-line-visualizer-segment="true"]'
    ) as SVGLineElement | null;
    if (!lineEl) return false;

    elementDiv.style.position = "absolute";
    elementDiv.style.left = "0";
    elementDiv.style.top = "0";
    elementDiv.style.width = "100%";
    elementDiv.style.height = "100%";
    elementDiv.style.transform = "none";
    elementDiv.style.pointerEvents = "none";
    elementDiv.style.zIndex = `${LINE_OVERLAY_Z_INDEX}`;

    setSvgLineAttributes(lineEl, svgLine);
    const dynamicDasharray = resolveSvgLineDasharray({
      line,
      svgLine,
      dasharrayCache,
    });
    lineEl.setAttribute(
      "stroke-dasharray",
      dynamicDasharray ?? line.strokeDasharray ?? "none"
    );
    lineEl.setAttribute("stroke-dashoffset", `${line.strokeDashoffset ?? 0}`);

    const lineHitTargetEl = elementDiv.querySelector(
      '[data-line-visualizer-hit-target="true"]'
    ) as SVGLineElement | null;
    if (lineHitTargetEl) {
      setSvgLineAttributes(lineHitTargetEl, svgLine);
    }

    return true;
  };
};

export const useLineSegmentVisualizers = (
  lines: LineVisualizerData[],
  showLines: boolean = true
) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
  } = useLabelOverlay();
  const previousLineSignatureByIdRef = useRef<Map<string, string>>(new Map());
  const previousDashCacheSignatureByIdRef = useRef<Map<string, string>>(
    new Map()
  );
  const dasharrayCacheByLineIdRef = useRef<Map<string, SvgLineDasharrayCache>>(
    new Map()
  );

  const lineGeometrySignatureById = useMemo(
    () =>
      new Map(lines.map((line) => [line.id, buildLineGeometrySignature(line)])),
    [lines]
  );

  const lineIndexById = useMemo(
    () => new Map(lines.map((line) => [line.id, line])),
    [lines]
  );

  useEffect(() => {
    if (!showLines) {
      previousLineSignatureByIdRef.current.forEach((_, lineId) => {
        removeLabelOverlayElement(getLineOverlayId(lineId));
      });
      previousLineSignatureByIdRef.current.clear();
      previousDashCacheSignatureByIdRef.current.clear();
      dasharrayCacheByLineIdRef.current.clear();
      return;
    }

    const nextGeometrySignatureById = new Map<string, string>();
    const nextDashCacheSignatureById = new Map<string, string>();
    lineIndexById.forEach((line, lineId) => {
      const nextGeometrySignature = lineGeometrySignatureById.get(lineId) ?? "";
      nextGeometrySignatureById.set(lineId, nextGeometrySignature);
      const nextDashCacheSignature = buildLineDashCacheSignature(line);
      nextDashCacheSignatureById.set(lineId, nextDashCacheSignature);
      const previousDashCacheSignature =
        previousDashCacheSignatureByIdRef.current.get(lineId) ?? null;
      if (previousDashCacheSignature !== nextDashCacheSignature) {
        dasharrayCacheByLineIdRef.current.set(lineId, new Map());
      }
      const dasharrayCache = dasharrayCacheByLineIdRef.current.get(lineId);
      const lineOverlayId = getLineOverlayId(line.id);
      const previousGeometrySignature =
        previousLineSignatureByIdRef.current.get(lineId) ?? null;

      if (previousGeometrySignature === nextGeometrySignature) {
        updateLabelOverlayElement(lineOverlayId, {
          visible: line.visible !== false,
          isHidden: line.isHidden,
          updatePosition: buildLineOverlayUpdatePosition(line, dasharrayCache),
        });
        return;
      }

      addLabelOverlayElement({
        id: lineOverlayId,
        zIndex: LINE_OVERLAY_Z_INDEX,
        contentKey: nextGeometrySignature,
        content: React.createElement(LineVisualizer, {
          stroke: line.stroke,
          strokeWidth: line.strokeWidth,
          strokeLinecap: line.strokeLinecap,
          strokeDasharray: line.strokeDasharray,
          strokeDashoffset: line.strokeDashoffset,
          opacity: line.opacity,
          hitTargetStrokeWidth: line.hitTargetStrokeWidth,
          onLineClick: line.onLineClick,
          onLineLongPress: line.onLineLongPress,
          longPressDurationMs: line.longPressDurationMs,
        }),
        visible: line.visible !== false,
        isHidden: line.isHidden,
        updatePosition: buildLineOverlayUpdatePosition(line, dasharrayCache),
      });
    });

    previousLineSignatureByIdRef.current.forEach((_, previousLineId) => {
      if (nextGeometrySignatureById.has(previousLineId)) return;
      removeLabelOverlayElement(getLineOverlayId(previousLineId));
      dasharrayCacheByLineIdRef.current.delete(previousLineId);
    });
    previousLineSignatureByIdRef.current = nextGeometrySignatureById;
    previousDashCacheSignatureByIdRef.current = nextDashCacheSignatureById;
  }, [
    showLines,
    lineIndexById,
    lineGeometrySignatureById,
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
  ]);

  useEffect(
    () => () => {
      previousLineSignatureByIdRef.current.forEach((_, lineId) => {
        removeLabelOverlayElement(getLineOverlayId(lineId));
      });
      previousLineSignatureByIdRef.current.clear();
      previousDashCacheSignatureByIdRef.current.clear();
      dasharrayCacheByLineIdRef.current.clear();
    },
    [removeLabelOverlayElement]
  );
};
