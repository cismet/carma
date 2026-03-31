import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { CssPixelPosition } from "@carma/units/types";
import { DraggableDebugAnchor } from "@carma-commons/interaction/drag";
import {
  computePolygonSegmentLabelPlacements,
  createScreenPointSvgLineVisualizers,
  POLYGON_SEGMENT_LABEL_ROTATION_MODE,
  resolveLineLabelPlacement,
  resolveLineLabelPlacementWithReference,
  POLYGON_SEGMENT_LABEL_SIDE,
  POLYGON_SEGMENT_LABEL_WINDING_POLICY,
  type PolygonSegmentLabelSide,
  type PolygonSegmentLabelWindingOrder,
  type SvgLineCapStyle,
  type SvgLineLabelDominantBaseline,
  type SvgLineLabelRotationMode,
} from "@carma-commons/svg";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  LabelOverlayProvider,
  useLabelOverlayHost,
  useLineVisualizers,
} from "@carma-providers/label-overlay";
import { CenteredStoryFrame } from "../../common/ui/centered-story-frame";

const plotFrameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "calc(100vh - 120px)",
  minHeight: 560,
  overflow: "hidden",
  background: "#fff",
};

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const formatStatusNumber = (value: number, digits = 2): string =>
  Number.isFinite(value) ? value.toFixed(digits) : "0";

const useContainerSize = (containerRef: RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      setSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => {
        window.removeEventListener("resize", updateSize);
      };
    }

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  return size;
};

const LabelAnchorAngleDebug = ({
  placement,
  color,
}: {
  placement: { textX: number; textY: number; angleDeg: number } | null;
  color: string;
}) => {
  const hairlinePx =
    typeof window !== "undefined" && window.devicePixelRatio > 0
      ? 1 / window.devicePixelRatio
      : 1;
  if (!placement) {
    return null;
  }

  const angleLengthPx = 64;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: placement.textX,
          top: placement.textY,
          width: 16,
          height: 16,
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 18,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: hairlinePx,
            height: "100%",
            transform: "translateX(-50%)",
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            width: "100%",
            height: hairlinePx,
            transform: "translateY(-50%)",
            backgroundColor: color,
            opacity: 0.6,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: placement.textX,
          top: placement.textY,
          width: angleLengthPx,
          height: hairlinePx,
          transform: `translateY(-50%) rotate(${placement.angleDeg}deg)`,
          transformOrigin: "0 50%",
          backgroundColor: color,
          opacity: 0.7,
          pointerEvents: "none",
          zIndex: 18,
        }}
      />
    </>
  );
};

type SingleLineStoryArgs = {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  hitTargetStrokeWidth: number;
  dashed: boolean;
  capStyle: SvgLineCapStyle;
  dashLengthRatio: number;
  dashGapRatio: number;
  collapseNegativeGaps: boolean;
  collapseCapThresholdEffectiveGapRatio: number;
  showDistanceLabel: boolean;
  labelText: string;
  labelColor: string;
  labelStroke: string;
  labelFontSize: number;
  labelFontFamily: string;
  labelFontWeight: string;
  labelPill: boolean;
  labelPillBackgroundColor: string;
  labelPillBorderColor: string;
  labelPillBorderWidth: number;
  labelMinLineLengthPx: number;
  labelOffsetPx: number;
  labelFlippedBaselineOffsetPx: number;
  labelRotationMode: SvgLineLabelRotationMode;
  labelDominantBaseline: SvgLineLabelDominantBaseline;
  visible: boolean;
  isHidden: boolean;
  contentSignature: string;
};

export type LabelPlacementStoryArgs = SingleLineStoryArgs & {
  polygonSidePreference?: PolygonSegmentLabelSide;
};

const TrianglePlacementToggle = ({
  a,
  b,
  c,
  sidePreference,
  windingOrder,
  onToggleSidePreference,
}: {
  a: CssPixelPosition;
  b: CssPixelPosition;
  c: CssPixelPosition;
  sidePreference: PolygonSegmentLabelSide;
  windingOrder: PolygonSegmentLabelWindingOrder;
  onToggleSidePreference: () => void;
}) => {
  const pointList = `${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`;

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "auto",
        zIndex: 16,
      }}
    >
      <polygon
        points={pointList}
        fill="rgba(249, 115, 22, 0.5)"
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: "auto", cursor: "pointer" }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleSidePreference();
        }}
      />
      <text
        x={(a.x + b.x + c.x) / 3}
        y={(a.y + b.y + c.y) / 3}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#111827"
        fontSize={12}
        fontFamily="monospace"
        pointerEvents="none"
      >
        {`${windingOrder.toUpperCase()} • ${sidePreference}`}
      </text>
    </svg>
  );
};

const SingleLineLabelDebugOverlay = ({
  containerRef,
  args,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  args: SingleLineStoryArgs;
}) => {
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(containerRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 1280;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 720;

  const defaults = useMemo(
    () => ({
      start: toCssPixelPosition(resolvedWidth * 0.24, resolvedHeight * 0.44),
      end: toCssPixelPosition(resolvedWidth * 0.76, resolvedHeight * 0.56),
    }),
    [resolvedHeight, resolvedWidth]
  );

  const [start, setStart] = useState<CssPixelPosition>(defaults.start);
  const [end, setEnd] = useState<CssPixelPosition>(defaults.end);

  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
  }, [defaults]);

  const labelPlacement = useMemo(
    () => resolveLineLabelPlacement({ start, end, offsetPx: 14 }),
    [end, start]
  );
  const lineDx = end.x - start.x;
  const lineDy = end.y - start.y;
  const lineLengthPx = Math.hypot(lineDx, lineDy);
  const lineAngleDeg = (Math.atan2(lineDy, lineDx) * 180) / Math.PI;
  const statusValues = useMemo(
    () => [
      `start (${formatStatusNumber(start.x, 1)}, ${formatStatusNumber(
        start.y,
        1
      )})`,
      `end (${formatStatusNumber(end.x, 1)}, ${formatStatusNumber(end.y, 1)})`,
      `length ${formatStatusNumber(lineLengthPx, 1)}px`,
      `lineAngle ${formatStatusNumber(lineAngleDeg, 1)}°`,
      `labelAngle ${
        labelPlacement
          ? `${formatStatusNumber(labelPlacement.angleDeg, 1)}°`
          : "n/a"
      }`,
    ],
    [end.x, end.y, labelPlacement, lineAngleDeg, lineLengthPx, start.x, start.y]
  );

  const lines = useMemo(
    () => [
      ...createScreenPointSvgLineVisualizers({
        id: "single-line-label-debug",
        start,
        end,
        stroke: args.stroke,
        strokeWidth: args.strokeWidth,
        opacity: args.opacity,
        hitTargetStrokeWidth: args.hitTargetStrokeWidth,
        dashed: args.dashed,
        capStyle: args.capStyle,
        dashLengthRatio: args.dashLengthRatio,
        dashGapRatio: args.dashGapRatio,
        collapseNegativeGaps: args.collapseNegativeGaps,
        collapseCapThresholdEffectiveGapRatio:
          args.collapseCapThresholdEffectiveGapRatio,
        showDistanceLabel: args.showDistanceLabel,
        labelText:
          args.labelText.trim().length > 0 ? args.labelText : undefined,
        labelColor: args.labelColor,
        labelStroke: args.labelStroke,
        labelFontSize: args.labelFontSize,
        labelFontFamily: args.labelFontFamily,
        labelFontWeight: args.labelFontWeight,
        labelPill: args.labelPill,
        labelPillBackgroundColor: args.labelPillBackgroundColor,
        labelPillBorderColor: args.labelPillBorderColor,
        labelPillBorderWidth: args.labelPillBorderWidth,
        labelMinLineLengthPx: args.labelMinLineLengthPx,
        labelOffsetPx: args.labelOffsetPx,
        labelFlippedBaselineOffsetPx: args.labelFlippedBaselineOffsetPx,
        labelRotationMode: args.labelRotationMode,
        labelDominantBaseline: args.labelDominantBaseline,
        visible: args.visible,
        isHidden: args.isHidden,
        contentSignature:
          args.contentSignature.trim().length > 0
            ? args.contentSignature
            : undefined,
      }),
    ],
    [args, end, start]
  );

  useLineVisualizers(lines, true);

  return (
    <>
      <LabelAnchorAngleDebug
        placement={labelPlacement}
        color="rgba(220, 38, 38, 0.95)"
      />
      <DraggableDebugAnchor
        anchorId="single-line-debug-start"
        position={start}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setStart}
      />
      <DraggableDebugAnchor
        anchorId="single-line-debug-end"
        position={end}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setEnd}
      />
    </>
  );
};

const PolygonSegmentLabelDebugOverlay = ({
  containerRef,
  requestedSidePreference,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  requestedSidePreference: PolygonSegmentLabelSide;
}) => {
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(containerRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 1280;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 720;

  const defaults = useMemo(
    () => ({
      start: toCssPixelPosition(resolvedWidth * 0.24, resolvedHeight * 0.36),
      end: toCssPixelPosition(resolvedWidth * 0.76, resolvedHeight * 0.46),
      apex: toCssPixelPosition(resolvedWidth * 0.56, resolvedHeight * 0.2),
    }),
    [resolvedHeight, resolvedWidth]
  );

  const [start, setStart] = useState<CssPixelPosition>(defaults.start);
  const [end, setEnd] = useState<CssPixelPosition>(defaults.end);
  const [apex, setApex] = useState<CssPixelPosition>(defaults.apex);
  const [sidePreference, setSidePreference] = useState<PolygonSegmentLabelSide>(
    requestedSidePreference
  );

  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
    setApex(defaults.apex);
  }, [defaults]);

  useEffect(() => {
    setSidePreference(requestedSidePreference);
  }, [requestedSidePreference]);

  const primarySegmentLabelPlacement = useMemo(
    () =>
      computePolygonSegmentLabelPlacements({
        polygon: [start, end, apex],
        closed: true,
        side: sidePreference,
        offsetPx: 72,
        rotationMode: POLYGON_SEGMENT_LABEL_ROTATION_MODE.READABLE,
        windingPolicy: POLYGON_SEGMENT_LABEL_WINDING_POLICY.RESPECT_INPUT,
      }).find((placement) => placement.segmentIndex === 0) ?? null,
    [apex, end, sidePreference, start]
  );

  const labelPlacement = useMemo(() => {
    if (!primarySegmentLabelPlacement) {
      return null;
    }

    return resolveLineLabelPlacementWithReference({
      start,
      end,
      targetReferencePoint:
        sidePreference === POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
          ? primarySegmentLabelPlacement.outsideReferencePoint
          : primarySegmentLabelPlacement.insideReferencePoint,
      offsetPx: 14,
    });
  }, [end, primarySegmentLabelPlacement, sidePreference, start]);

  const lines = useMemo(
    () => [
      ...createScreenPointSvgLineVisualizers({
        id: "polygon-segment-label-debug-edge-0",
        start,
        end,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1,
        dashGapRatio: 1,
        labelText: `triangle edge (${sidePreference})`,
        labelColor: "#111827",
        labelStroke: "rgba(255, 255, 255, 0.98)",
        labelFontSize: 14,
        labelFontFamily: "monospace",
        labelOffsetPx: 14,
        getLabelOutsideReferencePoint:
          sidePreference === POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
            ? () => primarySegmentLabelPlacement?.outsideReferencePoint ?? null
            : undefined,
        getLabelInsideReferencePoint:
          sidePreference === POLYGON_SEGMENT_LABEL_SIDE.INSIDE
            ? () => primarySegmentLabelPlacement?.insideReferencePoint ?? null
            : undefined,
      }),
      ...createScreenPointSvgLineVisualizers({
        id: "polygon-segment-label-debug-edge-1",
        start: end,
        end: apex,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1,
        dashGapRatio: 1,
      }),
      ...createScreenPointSvgLineVisualizers({
        id: "polygon-segment-label-debug-edge-2",
        start: apex,
        end: start,
        stroke: "rgba(30, 64, 175, 0.95)",
        strokeWidth: 10,
        dashed: true,
        capStyle: "round",
        dashLengthRatio: 1,
        dashGapRatio: 1,
      }),
    ],
    [
      apex,
      end,
      primarySegmentLabelPlacement?.insideReferencePoint,
      primarySegmentLabelPlacement?.outsideReferencePoint,
      sidePreference,
      start,
    ]
  );

  useLineVisualizers(lines, true);

  return (
    <>
      {primarySegmentLabelPlacement ? (
        <TrianglePlacementToggle
          a={start}
          b={end}
          c={apex}
          sidePreference={sidePreference}
          windingOrder={primarySegmentLabelPlacement.resolvedWindingOrder}
          onToggleSidePreference={() =>
            setSidePreference((previous) =>
              previous === POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
                ? POLYGON_SEGMENT_LABEL_SIDE.INSIDE
                : POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE
            )
          }
        />
      ) : null}
      <LabelAnchorAngleDebug
        placement={labelPlacement}
        color="rgba(220, 38, 38, 0.95)"
      />
      <DraggableDebugAnchor
        anchorId="polygon-segment-debug-start"
        position={start}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setStart}
      />
      <DraggableDebugAnchor
        anchorId="polygon-segment-debug-end"
        position={end}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setEnd}
      />
      <DraggableDebugAnchor
        anchorId="polygon-segment-debug-apex"
        position={apex}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={setApex}
      />
    </>
  );
};

export const SingleLineLabelDebugStory = ({
  args,
}: {
  args: SingleLineStoryArgs;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const overlayHost = useLabelOverlayHost({
    kind: "dom",
    containerRef: rootRef,
  });

  const statusValues = [
    `line ${args.strokeWidth}px`,
    `dash ${args.dashed ? "on" : "off"}`,
    `label ${args.labelText || "off"}`,
    `drag endpoints`,
  ];

  return (
    <CenteredStoryFrame
      label="label placement single line"
      values={statusValues}
    >
      <div ref={rootRef} style={plotFrameStyle}>
        <LabelOverlayProvider host={overlayHost}>
          <SingleLineLabelDebugOverlay containerRef={rootRef} args={args} />
        </LabelOverlayProvider>
      </div>
    </CenteredStoryFrame>
  );
};

export const PolygonSegmentLabelDebugStory = ({
  sidePreference,
}: {
  sidePreference: PolygonSegmentLabelSide;
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const overlayHost = useLabelOverlayHost({
    kind: "dom",
    containerRef: rootRef,
  });

  const statusValues = [`side ${sidePreference}`, `drag triangle vertices`];

  return (
    <CenteredStoryFrame
      label="label placement polygon segment"
      values={statusValues}
    >
      <div ref={rootRef} style={plotFrameStyle}>
        <LabelOverlayProvider host={overlayHost}>
          <PolygonSegmentLabelDebugOverlay
            containerRef={rootRef}
            requestedSidePreference={sidePreference}
          />
        </LabelOverlayProvider>
      </div>
    </CenteredStoryFrame>
  );
};

export const LABEL_PLACEMENT_SINGLE_LINE_ARG_TYPES = {
  stroke: { control: { type: "color" }, table: { category: "Line" } },
  strokeWidth: {
    control: { type: "range", min: 1, max: 30, step: 1 },
    table: { category: "Line" },
  },
  opacity: {
    control: { type: "range", min: 0, max: 1, step: 0.01 },
    table: { category: "Line" },
  },
  hitTargetStrokeWidth: {
    control: { type: "range", min: 1, max: 64, step: 1 },
    table: { category: "Line" },
  },
  visible: { control: { type: "boolean" }, table: { category: "Line" } },
  isHidden: { control: { type: "boolean" }, table: { category: "Line" } },
  contentSignature: {
    control: { type: "text" },
    table: { category: "Line" },
  },
  dashed: { control: { type: "boolean" }, table: { category: "Dash" } },
  capStyle: {
    control: { type: "inline-radio" },
    options: ["round", "square"],
    table: { category: "Dash" },
  },
  dashLengthRatio: {
    control: { type: "range", min: 1, max: 12, step: 0.1 },
    table: { category: "Dash" },
  },
  dashGapRatio: {
    control: { type: "range", min: -1, max: 12, step: 0.1 },
    table: { category: "Dash" },
  },
  collapseNegativeGaps: {
    control: { type: "boolean" },
    table: { category: "Dash" },
  },
  collapseCapThresholdEffectiveGapRatio: {
    control: { type: "range", min: -1, max: 2, step: 0.01 },
    table: { category: "Dash" },
  },
  showDistanceLabel: {
    control: { type: "boolean" },
    table: { category: "Label" },
  },
  labelText: { control: { type: "text" }, table: { category: "Label" } },
  labelColor: { control: { type: "color" }, table: { category: "Label" } },
  labelStroke: { control: { type: "color" }, table: { category: "Label" } },
  labelFontSize: {
    control: { type: "range", min: 8, max: 40, step: 1 },
    table: { category: "Label" },
  },
  labelFontFamily: {
    control: { type: "text" },
    table: { category: "Label" },
  },
  labelFontWeight: {
    control: { type: "text" },
    table: { category: "Label" },
  },
  labelPill: { control: { type: "boolean" }, table: { category: "Label" } },
  labelPillBackgroundColor: {
    control: { type: "color" },
    table: { category: "Label" },
  },
  labelPillBorderColor: {
    control: { type: "color" },
    table: { category: "Label" },
  },
  labelPillBorderWidth: {
    control: { type: "range", min: 0, max: 8, step: 0.5 },
    table: { category: "Label" },
  },
  labelMinLineLengthPx: {
    control: { type: "range", min: 0, max: 500, step: 1 },
    table: { category: "Label" },
  },
  labelOffsetPx: {
    control: { type: "range", min: -64, max: 128, step: 1 },
    table: { category: "Label" },
  },
  labelFlippedBaselineOffsetPx: {
    control: { type: "range", min: -64, max: 128, step: 1 },
    table: { category: "Label" },
  },
  labelRotationMode: {
    control: { type: "inline-radio" },
    options: ["auto", "clockwise"],
    table: { category: "Label" },
  },
  labelDominantBaseline: {
    control: { type: "select" },
    options: [
      "auto",
      "middle",
      "central",
      "text-before-edge",
      "text-after-edge",
      "alphabetic",
      "hanging",
      "ideographic",
    ],
    table: { category: "Label" },
  },
};

export const LABEL_PLACEMENT_SINGLE_LINE_ARGS = {
  stroke: "rgba(30, 64, 175, 0.95)",
  strokeWidth: 10,
  opacity: 1,
  hitTargetStrokeWidth: 12,
  dashed: true,
  capStyle: "round",
  dashLengthRatio: 1,
  dashGapRatio: 1.5,
  collapseNegativeGaps: true,
  collapseCapThresholdEffectiveGapRatio: -0.1,
  showDistanceLabel: false,
  labelText: "single line",
  labelColor: "#111827",
  labelStroke: "rgba(255, 255, 255, 0.98)",
  labelFontSize: 14,
  labelFontFamily: "monospace",
  labelFontWeight: "600",
  labelPill: false,
  labelPillBackgroundColor: "rgba(255,255,255,0.9)",
  labelPillBorderColor: "rgba(17,24,39,0.35)",
  labelPillBorderWidth: 1,
  labelMinLineLengthPx: 0,
  labelOffsetPx: 14,
  labelFlippedBaselineOffsetPx: 0,
  labelRotationMode: "auto",
  labelDominantBaseline: "middle",
  visible: true,
  isHidden: false,
  contentSignature: "",
};

export const LABEL_PLACEMENT_POLYGON_ARG_TYPES = {
  polygonSidePreference: {
    control: { type: "inline-radio" },
    options: ["outside", "inside"],
    table: { category: "Label Placement" },
  },
};

export const LABEL_PLACEMENT_POLYGON_ARGS = {
  polygonSidePreference: POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE,
};
