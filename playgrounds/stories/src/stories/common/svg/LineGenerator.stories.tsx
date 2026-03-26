import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { CssPixelPosition } from "@carma/units/types";
import {
  createScreenPointSvgLineVisualizers,
  type SvgLineCapStyle,
} from "@carma-commons/svg";
import { DraggableDebugAnchor } from "@carma-commons/interaction/drag";
import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  LabelOverlayProvider,
  useLabelOverlayHost,
  useLineVisualizers,
} from "@carma-providers/label-overlay";

type LineGeneratorStoryArgs = {
  screenPointDistancePx: number;
  strokeWidth: number;
  capStyle: SvgLineCapStyle;
  dashLengthRatio: number;
  dashGapRatio: number;
  collapseNegativeGaps: boolean;
  collapseCapThresholdEffectiveGapRatio: number;
};

type RepresentativeLineCase = {
  id: string;
  label: string;
  dashed: boolean;
  strokeWidth: number;
  dashLengthRatio?: number;
  dashGapRatio?: number;
  lineLengthMultiplier?: number;
  stroke?: string;
  lengthMultipliers?: readonly number[];
  dashLengthRatioSeries?: readonly number[];
  dashGapRatioSeries?: readonly number[];
  dashRatioPairs?: readonly {
    dashLengthRatio: number;
    dashGapRatio: number;
  }[];
};

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const formatStatusNumber = (value: number, digits = 2): string =>
  Number.isFinite(value) ? value.toFixed(digits) : "0";

const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  overflow: "hidden",
  background: "#fff",
};

const TOP_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1800,
  pointerEvents: "none",
};

const STICKY_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "sticky",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 5,
  pointerEvents: "none",
};

const REPRESENTATIVE_LENGTH_MULTIPLIERS = [0, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];
const REPRESENTATIVE_MIN_ROW_SPACING_PX = 18;

const getRepresentativeCaseRowCount = (
  lineCase: RepresentativeLineCase
): number => {
  if (lineCase.lengthMultipliers) {
    return lineCase.lengthMultipliers.length;
  }
  if (lineCase.dashLengthRatioSeries) {
    return lineCase.dashLengthRatioSeries.length;
  }
  if (lineCase.dashGapRatioSeries) {
    return lineCase.dashGapRatioSeries.length;
  }
  if (lineCase.dashRatioPairs) {
    return lineCase.dashRatioPairs.length;
  }
  return 1;
};

const getRepresentativeCaseRowSpacing = (
  lineCase: RepresentativeLineCase
): number =>
  Math.max(lineCase.strokeWidth * 1.8, REPRESENTATIVE_MIN_ROW_SPACING_PX);

const representativeLineCases: readonly RepresentativeLineCase[] = (() => {
  const variedLengthCases = [1, 2].flatMap((dashLengthRatio) =>
    [0, 0.5, 1, 2].map((dashGapRatio) => ({
      id: `length-sweep-dl-${dashLengthRatio}-gap-${String(
        dashGapRatio
      ).replace(".", "-")}`,
      label: `varying: lineLength (dashLength=${dashLengthRatio}, gap=${dashGapRatio})`,
      dashed: true,
      strokeWidth: 10,
      dashLengthRatio,
      dashGapRatio,
      lengthMultipliers: REPRESENTATIVE_LENGTH_MULTIPLIERS,
    }))
  );

  return [
    {
      id: "length-sweep",
      label: "varying: lineLength (x strokeWidth)",
      dashed: false,
      strokeWidth: 10,
      lengthMultipliers: REPRESENTATIVE_LENGTH_MULTIPLIERS,
    },
    ...variedLengthCases,
    {
      id: "dash-length-ratio-series",
      label: "varying: dashLengthRatio (20x lineLength)",
      dashed: true,
      strokeWidth: 10,
      dashGapRatio: 2,
      lineLengthMultiplier: 20,
      dashLengthRatioSeries: [1, 1.2, 1.5, 2, 3, 5, 8, 10],
    },
    {
      id: "dash-gap-ratio-series",
      label: "varying: dashGapRatio (20x lineLength)",
      dashed: true,
      strokeWidth: 10,
      dashLengthRatio: 1,
      lineLengthMultiplier: 20,
      dashGapRatioSeries: [-1, -0.5, 0, 0.5, 1, 2, 3, 5],
    },
    {
      id: "dash-ratio-pairs-series",
      label: "varying: (dashLengthRatio, dashGapRatio) pairs (20x lineLength)",
      dashed: true,
      strokeWidth: 10,
      lineLengthMultiplier: 20,
      dashRatioPairs: [
        { dashLengthRatio: 1, dashGapRatio: -1 },
        { dashLengthRatio: 1, dashGapRatio: 0 },
        { dashLengthRatio: 1, dashGapRatio: 2 },
        { dashLengthRatio: 2, dashGapRatio: 0 },
        { dashLengthRatio: 2, dashGapRatio: 2 },
        { dashLengthRatio: 3, dashGapRatio: 3 },
        { dashLengthRatio: 5, dashGapRatio: 1 },
      ],
    },
  ];
})();

const matrixFrameBaseStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  overflow: "hidden",
  background: "#fff",
};

const REPRESENTATIVE_FONT_FAMILY =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const LONG_LENGTH_SUFFIX = " (20x lineLength)";

const formatRepresentativeSectionLabel = (label: string): string =>
  label.includes(LONG_LENGTH_SUFFIX)
    ? label.replace(LONG_LENGTH_SUFFIX, `\n${LONG_LENGTH_SUFFIX.trimStart()}`)
    : label;

type AnchorPair = {
  start: CssPixelPosition;
  end: CssPixelPosition;
};

type AnchorQuad = {
  a: CssPixelPosition;
  b: CssPixelPosition;
  c: CssPixelPosition;
  d: CssPixelPosition;
};

type LiveInstanceStyle = {
  id: string;
  dashed: boolean;
  capStyle: SvgLineCapStyle;
  stroke: string;
};

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

const LiveLineGeneratorOverlay = ({
  screenPointDistancePx,
  strokeWidth,
  capStyle,
  dashLengthRatio,
  dashGapRatio,
  collapseNegativeGaps,
  collapseCapThresholdEffectiveGapRatio,
  containerRef,
}: LineGeneratorStoryArgs & {
  containerRef: RefObject<HTMLDivElement | null>;
}) => {
  const { width: containerWidth, height: containerHeight } =
    useContainerSize(containerRef);
  const resolvedWidth = containerWidth > 0 ? containerWidth : 1280;
  const resolvedHeight = containerHeight > 0 ? containerHeight : 720;
  const liveInstanceStyles = useMemo<readonly LiveInstanceStyle[]>(
    () => [
      {
        id: "selected-dashed",
        dashed: true,
        capStyle,
        stroke: "rgba(30, 64, 175, 0.95)",
      },
      {
        id: "selected-solid",
        dashed: false,
        capStyle,
        stroke: "rgba(16, 185, 129, 0.95)",
      },
      {
        id: "square-dashed",
        dashed: true,
        capStyle: "square",
        stroke: "rgba(190, 24, 93, 0.95)",
      },
    ],
    [capStyle]
  );
  const totalRows = liveInstanceStyles.length * 2;
  const maxSegmentLengthPx = Math.max(40, resolvedWidth - 160);
  const segmentLengthPx = Math.min(
    Math.max(screenPointDistancePx, 0),
    maxSegmentLengthPx
  );
  const baseStartX = resolvedWidth * 0.5 - segmentLengthPx * 0.5;
  const topPaddingPx = Math.max(strokeWidth * 4, 40);
  const bottomPaddingPx = Math.max(strokeWidth * 4, 40);
  const availableHeightPx = Math.max(
    resolvedHeight - topPaddingPx - bottomPaddingPx,
    0
  );
  const rowSpacingPx =
    totalRows > 1 ? Math.max(50, availableHeightPx / (totalRows - 1)) : 0;
  const baseY = topPaddingPx;

  const defaultSingleAnchors = useMemo<readonly AnchorPair[]>(() => {
    return liveInstanceStyles.map((_, index) => {
      const rowY = baseY + index * rowSpacingPx * 2;
      const start = toCssPixelPosition(baseStartX, rowY);
      return {
        start,
        end: toCssPixelPosition(start.x + segmentLengthPx, start.y),
      };
    });
  }, [baseStartX, baseY, liveInstanceStyles, rowSpacingPx, segmentLengthPx]);

  const defaultChainAnchors = useMemo<readonly AnchorQuad[]>(() => {
    const bendOffsetPx = 24;

    return liveInstanceStyles.map((_, index) => {
      const rowY = baseY + (index * 2 + 1) * rowSpacingPx;
      const a = toCssPixelPosition(baseStartX, rowY);
      const bendDirection = index % 2 === 0 ? 1 : -1;
      const b = toCssPixelPosition(
        a.x + segmentLengthPx * 0.33,
        a.y + bendOffsetPx * bendDirection
      );
      const c = toCssPixelPosition(
        a.x + segmentLengthPx * 0.66,
        a.y - bendOffsetPx * bendDirection
      );
      const d = toCssPixelPosition(a.x + segmentLengthPx, a.y);
      return { a, b, c, d };
    });
  }, [baseStartX, baseY, liveInstanceStyles, rowSpacingPx, segmentLengthPx]);

  const [singleAnchors, setSingleAnchors] =
    useState<readonly AnchorPair[]>(defaultSingleAnchors);
  const [chainAnchors, setChainAnchors] =
    useState<readonly AnchorQuad[]>(defaultChainAnchors);

  useEffect(() => {
    setSingleAnchors(defaultSingleAnchors);
  }, [defaultSingleAnchors]);

  useEffect(() => {
    setChainAnchors(defaultChainAnchors);
  }, [defaultChainAnchors]);

  const lines = useMemo(
    () =>
      liveInstanceStyles.flatMap((style, index) => {
        const single = singleAnchors[index];
        const chain = chainAnchors[index];
        if (!single || !chain) {
          return [];
        }
        return [
          ...createScreenPointSvgLineVisualizers({
            id: `${style.id}-single`,
            start: single.start,
            end: single.end,
            stroke: style.stroke,
            strokeWidth,
            dashed: style.dashed,
            capStyle: style.capStyle,
            dashLengthRatio,
            dashGapRatio,
            collapseNegativeGaps,
            collapseCapThresholdEffectiveGapRatio,
          }),
          ...createScreenPointSvgLineVisualizers({
            id: `${style.id}-chain-0`,
            start: chain.a,
            end: chain.b,
            stroke: style.stroke,
            strokeWidth,
            dashed: style.dashed,
            capStyle: style.capStyle,
            dashLengthRatio,
            dashGapRatio,
            collapseNegativeGaps,
            collapseCapThresholdEffectiveGapRatio,
          }),
          ...createScreenPointSvgLineVisualizers({
            id: `${style.id}-chain-1`,
            start: chain.b,
            end: chain.c,
            stroke: style.stroke,
            strokeWidth,
            dashed: style.dashed,
            capStyle: style.capStyle,
            dashLengthRatio,
            dashGapRatio,
            collapseNegativeGaps,
            collapseCapThresholdEffectiveGapRatio,
          }),
          ...createScreenPointSvgLineVisualizers({
            id: `${style.id}-chain-2`,
            start: chain.c,
            end: chain.d,
            stroke: style.stroke,
            strokeWidth,
            dashed: style.dashed,
            capStyle: style.capStyle,
            dashLengthRatio,
            dashGapRatio,
            collapseNegativeGaps,
            collapseCapThresholdEffectiveGapRatio,
          }),
        ];
      }),
    [
      chainAnchors,
      collapseNegativeGaps,
      collapseCapThresholdEffectiveGapRatio,
      dashGapRatio,
      dashLengthRatio,
      liveInstanceStyles,
      singleAnchors,
      strokeWidth,
    ]
  );

  useLineVisualizers(lines, true);

  return (
    <>
      <DraggableDebugAnchor
        anchorId="selected-dashed-single-start"
        position={singleAnchors[0]?.start ?? toCssPixelPosition(0, 0)}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setSingleAnchors((previous) =>
            previous.map((value, index) =>
              index === 0 ? { ...value, start: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-dashed-single-end"
        position={singleAnchors[0]?.end ?? toCssPixelPosition(0, 0)}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setSingleAnchors((previous) =>
            previous.map((value, index) =>
              index === 0 ? { ...value, end: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-solid-single-start"
        position={singleAnchors[1]?.start ?? toCssPixelPosition(0, 0)}
        color="#059669"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setSingleAnchors((previous) =>
            previous.map((value, index) =>
              index === 1 ? { ...value, start: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-solid-single-end"
        position={singleAnchors[1]?.end ?? toCssPixelPosition(0, 0)}
        color="#059669"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setSingleAnchors((previous) =>
            previous.map((value, index) =>
              index === 1 ? { ...value, end: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="square-dashed-single-start"
        position={singleAnchors[2]?.start ?? toCssPixelPosition(0, 0)}
        color="#be185d"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setSingleAnchors((previous) =>
            previous.map((value, index) =>
              index === 2 ? { ...value, start: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="square-dashed-single-end"
        position={singleAnchors[2]?.end ?? toCssPixelPosition(0, 0)}
        color="#be185d"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setSingleAnchors((previous) =>
            previous.map((value, index) =>
              index === 2 ? { ...value, end: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-dashed-chain-a"
        position={chainAnchors[0]?.a ?? toCssPixelPosition(0, 0)}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 0 ? { ...value, a: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-dashed-chain-b"
        position={chainAnchors[0]?.b ?? toCssPixelPosition(0, 0)}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 0 ? { ...value, b: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-dashed-chain-c"
        position={chainAnchors[0]?.c ?? toCssPixelPosition(0, 0)}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 0 ? { ...value, c: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-dashed-chain-d"
        position={chainAnchors[0]?.d ?? toCssPixelPosition(0, 0)}
        color="#1d4ed8"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 0 ? { ...value, d: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-solid-chain-a"
        position={chainAnchors[1]?.a ?? toCssPixelPosition(0, 0)}
        color="#059669"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 1 ? { ...value, a: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-solid-chain-b"
        position={chainAnchors[1]?.b ?? toCssPixelPosition(0, 0)}
        color="#059669"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 1 ? { ...value, b: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-solid-chain-c"
        position={chainAnchors[1]?.c ?? toCssPixelPosition(0, 0)}
        color="#059669"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 1 ? { ...value, c: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="selected-solid-chain-d"
        position={chainAnchors[1]?.d ?? toCssPixelPosition(0, 0)}
        color="#059669"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 1 ? { ...value, d: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="square-dashed-chain-a"
        position={chainAnchors[2]?.a ?? toCssPixelPosition(0, 0)}
        color="#be185d"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 2 ? { ...value, a: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="square-dashed-chain-b"
        position={chainAnchors[2]?.b ?? toCssPixelPosition(0, 0)}
        color="#be185d"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 2 ? { ...value, b: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="square-dashed-chain-c"
        position={chainAnchors[2]?.c ?? toCssPixelPosition(0, 0)}
        color="#be185d"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 2 ? { ...value, c: nextPosition } : value
            )
          )
        }
      />
      <DraggableDebugAnchor
        anchorId="square-dashed-chain-d"
        position={chainAnchors[2]?.d ?? toCssPixelPosition(0, 0)}
        color="#be185d"
        containerRef={containerRef}
        onChange={(nextPosition) =>
          setChainAnchors((previous) =>
            previous.map((value, index) =>
              index === 2 ? { ...value, d: nextPosition } : value
            )
          )
        }
      />
    </>
  );
};

const LiveLineGeneratorStory = (args: LineGeneratorStoryArgs) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const statusValues = useMemo(
    () => [
      `distance ${formatStatusNumber(args.screenPointDistancePx, 1)}px`,
      `stroke ${formatStatusNumber(args.strokeWidth, 1)}px`,
      `caps ${args.capStyle}`,
      `dashLen ${formatStatusNumber(args.dashLengthRatio, 2)}x`,
      `dashGap ${formatStatusNumber(args.dashGapRatio, 2)}x`,
      `collapse ${args.collapseNegativeGaps ? "on" : "off"}`,
      `collapseThresh ${formatStatusNumber(
        args.collapseCapThresholdEffectiveGapRatio,
        2
      )}`,
    ],
    [
      args.capStyle,
      args.collapseCapThresholdEffectiveGapRatio,
      args.collapseNegativeGaps,
      args.dashGapRatio,
      args.dashLengthRatio,
      args.screenPointDistancePx,
      args.strokeWidth,
    ]
  );
  const overlayHost = useLabelOverlayHost({
    kind: "svg",
    containerRef: rootRef,
  });

  return (
    <div ref={rootRef} style={frameStyle}>
      <LabelOverlayProvider host={overlayHost}>
        <LiveLineGeneratorOverlay {...args} containerRef={rootRef} />
      </LabelOverlayProvider>
      <div style={TOP_STATUS_BAR_OVERLAY_STYLE}>
        <ResponsiveStatusBar label="svg line generator" values={statusValues} />
      </div>
    </div>
  );
};

type RepresentativeSectionRow = {
  id: string;
  label: string;
  dashed: boolean;
  strokeWidth: number;
  lineLengthMultiplier: number;
  dashLengthRatio?: number;
  dashGapRatio?: number;
};

type RepresentativeSection = {
  id: string;
  label: string;
  rows: RepresentativeSectionRow[];
};

const INLINE_DEFAULT_DASH_LENGTH_RATIO = 4;
const INLINE_DEFAULT_DASH_GAP_RATIO = 8 / 6;
const INLINE_MIN_LINE_LENGTH_PX = 0.0001;
const INLINE_MIN_STROKE_WIDTH_PX = 0.1;
const INLINE_MAX_DASH_COUNT = 2048;
const INLINE_MIN_DOT_RAW_DASH_LENGTH_PX = 0.01;
const INLINE_DASH_MATH_EPSILON_PX = 0.000001;
const INLINE_NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO = 0.001;

const resolveInlineDasharray = ({
  lineLengthPx,
  strokeWidth,
  capStyle,
  dashLengthRatio,
  dashGapRatio,
  collapseNegativeGaps = true,
  collapseCapThresholdEffectiveGapRatio = -0.1,
}: {
  lineLengthPx: number;
  strokeWidth: number;
  capStyle: SvgLineCapStyle;
  dashLengthRatio?: number;
  dashGapRatio?: number;
  collapseNegativeGaps?: boolean;
  collapseCapThresholdEffectiveGapRatio?: number;
}): string | undefined => {
  if (
    !Number.isFinite(lineLengthPx) ||
    lineLengthPx <= INLINE_MIN_LINE_LENGTH_PX
  ) {
    return undefined;
  }

  const strokeWidthPx = Math.max(strokeWidth, INLINE_MIN_STROKE_WIDTH_PX);
  const dashLengthToStrokeWidthRatio =
    Number.isFinite(dashLengthRatio) && (dashLengthRatio as number) >= 1
      ? (dashLengthRatio as number)
      : INLINE_DEFAULT_DASH_LENGTH_RATIO;
  const dashGapToDashLengthRatio =
    Number.isFinite(dashGapRatio) && (dashGapRatio as number) >= -1
      ? (dashGapRatio as number)
      : INLINE_DEFAULT_DASH_GAP_RATIO;
  const shouldApplyNegativeGapCollapse =
    collapseNegativeGaps &&
    dashGapToDashLengthRatio < -INLINE_NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO;
  const shouldNormalizeDashLengthForNearZeroGap =
    dashGapToDashLengthRatio <= INLINE_NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO;
  const collapseThresholdWithEpsilon =
    collapseCapThresholdEffectiveGapRatio -
    INLINE_NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO;
  if (
    shouldApplyNegativeGapCollapse &&
    dashGapToDashLengthRatio < collapseThresholdWithEpsilon
  ) {
    return undefined;
  }
  const capCompensationPx =
    capStyle === "round" || capStyle === "square" ? strokeWidthPx : 0;
  // Keep near-zero/negative gap behavior independent from larger dash-length ratios.
  const effectiveDashLengthToStrokeWidthRatio =
    shouldNormalizeDashLengthForNearZeroGap ? 1 : dashLengthToStrokeWidthRatio;

  const targetVisibleDashLengthPx = Math.max(
    strokeWidthPx * effectiveDashLengthToStrokeWidthRatio,
    INLINE_MIN_LINE_LENGTH_PX
  );
  const targetRawDashLengthPx = targetVisibleDashLengthPx - capCompensationPx;
  const fixedRawDashLengthPx =
    capCompensationPx > 0 && targetRawDashLengthPx <= 0
      ? INLINE_MIN_DOT_RAW_DASH_LENGTH_PX
      : Math.max(targetRawDashLengthPx, 0);
  const fixedVisibleDashLengthPx = Math.max(
    fixedRawDashLengthPx + capCompensationPx,
    INLINE_MIN_LINE_LENGTH_PX
  );
  const targetVisibleGapPx =
    fixedVisibleDashLengthPx * dashGapToDashLengthRatio;
  const minVisibleDashFitPx = Math.max(
    targetVisibleDashLengthPx - INLINE_DASH_MATH_EPSILON_PX,
    INLINE_MIN_LINE_LENGTH_PX
  );
  if (
    dashGapToDashLengthRatio >= -INLINE_NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO &&
    lineLengthPx < minVisibleDashFitPx
  ) {
    return undefined;
  }
  const targetEffectiveGapRatio = targetVisibleGapPx / fixedVisibleDashLengthPx;
  if (
    shouldApplyNegativeGapCollapse &&
    targetEffectiveGapRatio < collapseThresholdWithEpsilon
  ) {
    return undefined;
  }
  const targetRawGapPx = Math.max(targetVisibleGapPx + capCompensationPx, 0);

  const maxDashCountByLength =
    fixedRawDashLengthPx <= INLINE_MIN_LINE_LENGTH_PX
      ? INLINE_MAX_DASH_COUNT
      : Math.floor(lineLengthPx / fixedRawDashLengthPx);
  const maxDashCount = Math.max(
    1,
    Math.min(maxDashCountByLength, INLINE_MAX_DASH_COUNT)
  );

  if (maxDashCount < 2) {
    const forcedRawDashLengthPx = Math.max(
      Math.min(lineLengthPx * 0.5, fixedRawDashLengthPx),
      INLINE_MIN_DOT_RAW_DASH_LENGTH_PX
    );
    if (
      !Number.isFinite(forcedRawDashLengthPx) ||
      forcedRawDashLengthPx <= 0 ||
      forcedRawDashLengthPx * 2 > lineLengthPx + INLINE_DASH_MATH_EPSILON_PX
    ) {
      return undefined;
    }
    const forcedVisibleGapPx = INLINE_DASH_MATH_EPSILON_PX - capCompensationPx;
    const forcedEffectiveGapRatio =
      forcedVisibleGapPx / fixedVisibleDashLengthPx;
    if (
      shouldApplyNegativeGapCollapse &&
      forcedEffectiveGapRatio < collapseThresholdWithEpsilon
    ) {
      return undefined;
    }
    return `${forcedRawDashLengthPx} ${INLINE_DASH_MATH_EPSILON_PX}`;
  }

  const idealDashCountReal =
    fixedRawDashLengthPx + targetRawGapPx <= INLINE_MIN_LINE_LENGTH_PX
      ? maxDashCount
      : (lineLengthPx + targetRawGapPx) /
        (fixedRawDashLengthPx + targetRawGapPx);
  const baseDashCount = Number.isFinite(idealDashCountReal)
    ? Math.max(2, Math.min(maxDashCount, Math.floor(idealDashCountReal)))
    : 2;
  const candidateDashCounts = new Set<number>([
    2,
    maxDashCount,
    baseDashCount - 1,
    baseDashCount,
    baseDashCount + 1,
    Math.ceil(idealDashCountReal),
  ]);

  let best: { dashCount: number; rawGapPx: number; score: number } | null =
    null;
  candidateDashCounts.forEach((dashCount) => {
    const n = Math.max(2, Math.min(maxDashCount, Math.floor(dashCount)));
    const denominator = n - 1;
    if (denominator <= 0) {
      return;
    }

    const rawGapPx = (lineLengthPx - n * fixedRawDashLengthPx) / denominator;
    if (!Number.isFinite(rawGapPx) || rawGapPx < -INLINE_DASH_MATH_EPSILON_PX) {
      return;
    }

    const clampedRawGapPx = Math.max(rawGapPx, 0);
    const effectiveVisibleGapPx = clampedRawGapPx - capCompensationPx;
    const effectiveGapRatio = effectiveVisibleGapPx / fixedVisibleDashLengthPx;
    if (
      shouldApplyNegativeGapCollapse &&
      effectiveGapRatio < collapseThresholdWithEpsilon
    ) {
      return;
    }
    const score = Math.abs(clampedRawGapPx - targetRawGapPx);
    if (!best) {
      best = { dashCount: n, rawGapPx: clampedRawGapPx, score };
      return;
    }
    if (score + INLINE_DASH_MATH_EPSILON_PX < best.score) {
      best = { dashCount: n, rawGapPx: clampedRawGapPx, score };
      return;
    }
    if (
      Math.abs(score - best.score) <= INLINE_DASH_MATH_EPSILON_PX &&
      n > best.dashCount
    ) {
      best = { dashCount: n, rawGapPx: clampedRawGapPx, score };
    }
  });

  if (!best) {
    return undefined;
  }
  return `${fixedRawDashLengthPx} ${
    best.rawGapPx + INLINE_DASH_MATH_EPSILON_PX
  }`;
};

const buildRepresentativeSections = (): RepresentativeSection[] =>
  representativeLineCases.map((lineCase) => {
    if (lineCase.lengthMultipliers) {
      return {
        id: lineCase.id,
        label: lineCase.label,
        rows: lineCase.lengthMultipliers.map((multiplier) => ({
          id: `${lineCase.id}-${multiplier}`,
          label: `${multiplier}x`,
          dashed: lineCase.dashed,
          strokeWidth: lineCase.strokeWidth,
          lineLengthMultiplier: multiplier,
          dashLengthRatio: lineCase.dashLengthRatio,
          dashGapRatio: lineCase.dashGapRatio,
        })),
      };
    }
    if (lineCase.dashLengthRatioSeries) {
      return {
        id: lineCase.id,
        label: lineCase.label,
        rows: lineCase.dashLengthRatioSeries.map((ratio) => ({
          id: `${lineCase.id}-${ratio}`,
          label: `${ratio}`,
          dashed: true,
          strokeWidth: lineCase.strokeWidth,
          lineLengthMultiplier: lineCase.lineLengthMultiplier ?? 20,
          dashLengthRatio: ratio,
          dashGapRatio: lineCase.dashGapRatio,
        })),
      };
    }
    if (lineCase.dashGapRatioSeries) {
      return {
        id: lineCase.id,
        label: lineCase.label,
        rows: lineCase.dashGapRatioSeries.map((ratio) => ({
          id: `${lineCase.id}-${ratio}`,
          label: `${ratio}`,
          dashed: true,
          strokeWidth: lineCase.strokeWidth,
          lineLengthMultiplier: lineCase.lineLengthMultiplier ?? 20,
          dashLengthRatio: lineCase.dashLengthRatio,
          dashGapRatio: ratio,
        })),
      };
    }
    if (lineCase.dashRatioPairs) {
      return {
        id: lineCase.id,
        label: lineCase.label,
        rows: lineCase.dashRatioPairs.map((pair) => ({
          id: `${lineCase.id}-${pair.dashLengthRatio}-${pair.dashGapRatio}`,
          label: `${pair.dashLengthRatio}/${pair.dashGapRatio}`,
          dashed: true,
          strokeWidth: lineCase.strokeWidth,
          lineLengthMultiplier: lineCase.lineLengthMultiplier ?? 20,
          dashLengthRatio: pair.dashLengthRatio,
          dashGapRatio: pair.dashGapRatio,
        })),
      };
    }
    return { id: lineCase.id, label: lineCase.label, rows: [] };
  });

const InlineRepresentativeLineGraphic = ({
  row,
  capStyle,
  collapseNegativeGaps,
  collapseCapThresholdEffectiveGapRatio,
}: {
  row: RepresentativeSectionRow;
  capStyle: SvgLineCapStyle;
  collapseNegativeGaps: boolean;
  collapseCapThresholdEffectiveGapRatio: number;
}) => {
  const strokeWidthPx = Math.max(row.strokeWidth, INLINE_MIN_STROKE_WIDTH_PX);
  const lineLengthPx = Math.max(row.lineLengthMultiplier * strokeWidthPx, 0);
  const sidePaddingPx = strokeWidthPx + 2;
  const widthPx = Math.max(lineLengthPx + sidePaddingPx * 2, 24);
  const heightPx = Math.max(strokeWidthPx + 6, 18);
  const centerY = heightPx * 0.5;
  const dasharray = row.dashed
    ? resolveInlineDasharray({
        lineLengthPx,
        strokeWidth: strokeWidthPx,
        capStyle,
        dashLengthRatio: row.dashLengthRatio,
        dashGapRatio: row.dashGapRatio,
        collapseNegativeGaps,
        collapseCapThresholdEffectiveGapRatio,
      })
    : undefined;

  return (
    <svg
      width={widthPx}
      height={heightPx}
      viewBox={`0 0 ${widthPx} ${heightPx}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <line
        x1={sidePaddingPx}
        y1={centerY}
        x2={sidePaddingPx + lineLengthPx}
        y2={centerY}
        stroke="rgba(30, 64, 175, 0.95)"
        strokeWidth={strokeWidthPx}
        strokeLinecap={capStyle}
        strokeDasharray={dasharray ?? "none"}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const RepresentativeCasesStory = ({
  capStyle,
  collapseNegativeGaps,
  collapseCapThresholdEffectiveGapRatio,
}: {
  capStyle: SvgLineCapStyle;
  collapseNegativeGaps: boolean;
  collapseCapThresholdEffectiveGapRatio: number;
}) => {
  const sections = useMemo(() => buildRepresentativeSections(), []);
  const statusValues = useMemo(
    () => [
      `cap ${capStyle}`,
      `collapse ${collapseNegativeGaps ? "on" : "off"}`,
      `collapseThresh ${formatStatusNumber(
        collapseCapThresholdEffectiveGapRatio,
        2
      )}`,
    ],
    [capStyle, collapseNegativeGaps, collapseCapThresholdEffectiveGapRatio]
  );

  return (
    <div style={{ ...matrixFrameBaseStyle, overflow: "auto" }}>
      <div style={STICKY_STATUS_BAR_OVERLAY_STYLE}>
        <ResponsiveStatusBar tone="light" values={statusValues} />
      </div>
      <div
        style={{
          maxWidth: 1800,
          margin: "0 auto",
          padding: "8px 12px 16px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            alignItems: "flex-start",
            columnGap: 10,
            rowGap: 0,
          }}
        >
          {sections.map((section, sectionIndex) => (
            <section
              key={section.id}
              style={{
                width: "100%",
                minWidth: 0,
                maxWidth: 340,
                marginBottom: sectionIndex === sections.length - 1 ? 0 : 8,
              }}
            >
              <div
                style={{
                  color: "#334155",
                  fontSize: 14,
                  lineHeight: 1.35,
                  fontWeight: 600,
                  fontFamily: REPRESENTATIVE_FONT_FAMILY,
                  userSelect: "text",
                  marginBottom: 3,
                  maxWidth: 360,
                  whiteSpace: "pre-line",
                }}
              >
                {formatRepresentativeSectionLabel(section.label)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {section.rows.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 60,
                        textAlign: "left",
                        whiteSpace: "nowrap",
                        color: "#475569",
                        fontSize: 13,
                        lineHeight: 1.35,
                        fontFamily: REPRESENTATIVE_FONT_FAMILY,
                        userSelect: "text",
                      }}
                    >
                      {row.label}
                    </div>
                    <InlineRepresentativeLineGraphic
                      row={row}
                      capStyle={capStyle}
                      collapseNegativeGaps={collapseNegativeGaps}
                      collapseCapThresholdEffectiveGapRatio={
                        collapseCapThresholdEffectiveGapRatio
                      }
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

const meta: Meta<LineGeneratorStoryArgs> = {
  title: "Common/Svg",
  component: LiveLineGeneratorStory,
  parameters: {
    layout: "fullscreen",
  },
  argTypes: {
    screenPointDistancePx: {
      control: { type: "range", min: 10, max: 3780, step: 1 },
    },
    strokeWidth: {
      control: { type: "range", min: 0.5, max: 24, step: 0.5 },
    },
    capStyle: {
      options: ["round", "square"],
      control: { type: "inline-radio" },
    },
    dashLengthRatio: {
      control: { type: "range", min: 1, max: 12, step: 0.1 },
    },
    dashGapRatio: {
      control: { type: "range", min: -1, max: 12, step: 0.1 },
    },
    collapseNegativeGaps: {
      control: { type: "boolean" },
    },
    collapseCapThresholdEffectiveGapRatio: {
      control: { type: "range", min: -1, max: 1, step: 0.05 },
    },
  },
};

export default meta;

export const LiveDemo: StoryObj<LineGeneratorStoryArgs> = {
  name: "Length-Aware Dash Playground",
  args: {
    screenPointDistancePx: 2250,
    strokeWidth: 10,
    capStyle: "round",
    dashLengthRatio: 1,
    dashGapRatio: 2,
    collapseNegativeGaps: true,
    collapseCapThresholdEffectiveGapRatio: -0.1,
  },
  parameters: {
    controls: {
      include: [
        "screenPointDistancePx",
        "strokeWidth",
        "dashLengthRatio",
        "dashGapRatio",
        "collapseNegativeGaps",
        "collapseCapThresholdEffectiveGapRatio",
      ],
    },
  },
  render: (args) => <LiveLineGeneratorStory {...args} />,
};

export const RepresentativeCases: StoryObj<LineGeneratorStoryArgs> = {
  name: "Length-Aware Dash Cases",
  args: {
    capStyle: "round",
    collapseNegativeGaps: true,
    collapseCapThresholdEffectiveGapRatio: -0.1,
  },
  parameters: {
    controls: {
      include: [
        "capStyle",
        "collapseNegativeGaps",
        "collapseCapThresholdEffectiveGapRatio",
      ],
    },
  },
  render: (args) => (
    <RepresentativeCasesStory
      capStyle={args.capStyle ?? "round"}
      collapseNegativeGaps={args.collapseNegativeGaps ?? true}
      collapseCapThresholdEffectiveGapRatio={
        args.collapseCapThresholdEffectiveGapRatio ?? -0.1
      }
    />
  ),
};
