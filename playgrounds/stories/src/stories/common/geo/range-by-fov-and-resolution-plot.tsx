import type { Meters } from "@carma/units/types";
import {
  axisBottom,
  axisLeft,
  curveLinear,
  extent,
  format as d3Format,
  interpolateViridis,
  line as d3Line,
  scaleLinear,
  scaleLog,
  scaleSequential,
  select,
} from "d3";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  DOLLY_ZOOM_X_AXIS_MODES,
  buildDollyZoomXAxisTickEntries,
  formatDollyZoomXAxisReadoutValue,
  readDollyZoomXAxisLabel,
  readDollyZoomXAxisStatusValue,
  readDollyZoomXAxisValue,
  type DollyZoomXAxisMode,
} from "./dolly-zoom-axis";
import { GeoChartStoryFrame } from "./geo-chart-story-frame";
import { GEO_STORY_STYLES } from "./geo-story-styles";
import {
  readCenterResolutionMetersPerPixel,
  readRangeFromCenterResolutionAtFov,
} from "./mercator-zoom.shared";
import {
  PlotHoverReadoutLayers,
  createBottomXAxisReadoutLabel,
  createPrimaryYAxisReadoutLabel,
  readGuideBottomYFromBottomXAxisReadout,
  readGuideLeftXFromPrimaryYAxisReadout,
  readSampleAnchoredTooltipBox,
} from "./plot-hover-readout";

export const RANGE_PLOT_X_AXIS_MODES = DOLLY_ZOOM_X_AXIS_MODES;
export type RangePlotXAxisMode = DollyZoomXAxisMode;

export type RangeByFovAndResolutionStoryArgs = {
  xAxisMode: RangePlotXAxisMode;
};

type HeatmapReadout = {
  fovDeg: number;
  rangeM: number;
  centerResolutionMPerPx: number;
  plotX: number;
  plotY: number;
};

type PinnedHeatmapReadout = HeatmapReadout & {
  id: string;
};

type ResolutionRow = {
  resolutionMPerPx: number;
};

type RangeContourPoint = {
  fovDeg: number;
  centerResolutionMPerPx: number;
};

const DEFAULT_STANDARD_RANGE_M = 1_000 as Meters;
const MIN_EFFECTIVE_FOV_DEG = 1;
const MAX_EFFECTIVE_FOV_DEG = 120;
const FOV_STEP_DEG = 0.25;
const HEATMAP_LOG2_RESOLUTION_STEP = 0.025;
const VIEWPORT_WIDTH_PX = 1280;
const VIEWPORT_HEIGHT_PX = 720;
const PLOT_OUTER_WIDTH_PX = 980;
const PLOT_OUTER_HEIGHT_PX = 560;

const PLOT_MARGIN = {
  top: 28,
  right: 28,
  bottom: 96,
  left: 92,
} as const;

const Y_READOUT_WIDTH = 112;

const RANGE_CONTOUR_VALUES_M = [10, 100, 1_000, 10_000, 100_000] as const;
const buildSteppedRange = (minimum: number, maximum: number, step: number) => {
  const values: number[] = [];
  const epsilon = step / 1_000;

  for (let value = minimum; value <= maximum + epsilon; value += step) {
    values.push(Number(value.toFixed(12)));
  }

  return values;
};

const buildFovSamples = () =>
  buildSteppedRange(MIN_EFFECTIVE_FOV_DEG, MAX_EFFECTIVE_FOV_DEG, FOV_STEP_DEG);

const buildResolutionRowsForDomain = (
  minimumResolutionMPerPx: number,
  maximumResolutionMPerPx: number
): ResolutionRow[] =>
  buildSteppedRange(
    Math.log2(minimumResolutionMPerPx),
    Math.log2(maximumResolutionMPerPx),
    HEATMAP_LOG2_RESOLUTION_STEP
  ).map((log2Resolution) => ({
    resolutionMPerPx: Math.pow(2, log2Resolution),
  }));

const buildResolutionTickValuesForDomain = (
  minimumResolutionMPerPx: number,
  maximumResolutionMPerPx: number
) => {
  const minimumExponent = Math.ceil(Math.log2(minimumResolutionMPerPx));
  const maximumExponent = Math.floor(Math.log2(maximumResolutionMPerPx));
  const tickValues: number[] = [];

  for (
    let exponent = minimumExponent;
    exponent <= maximumExponent;
    exponent += 1
  ) {
    const tickValue = Math.pow(2, exponent);
    if (
      tickValue >= minimumResolutionMPerPx &&
      tickValue <= maximumResolutionMPerPx
    ) {
      tickValues.push(tickValue);
    }
  }

  return tickValues;
};

const formatRangeM = (value: number) => {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return value >= 1_000
    ? `${d3Format(".3~g")(value / 1_000)} km`
    : `${d3Format(value >= 1 ? ".3~g" : value >= 0.01 ? ".3f" : ".4f")(
        value
      )} m`;
};

const formatResolutionAxisValue = (value: number) =>
  Number.isFinite(value)
    ? d3Format(value >= 1 ? ".2f" : value >= 0.01 ? ".3f" : ".4f")(value)
    : "—";

const Y_AXIS_LABEL = "center resolution (log2 m/px)";
const Y_AXIS_STATUS_VALUE = "y log2(m/px)";

const buildResolutionAxisTickValues = ({
  minimumResolutionMPerPx,
  maximumResolutionMPerPx,
  yScale,
}: {
  minimumResolutionMPerPx: number;
  maximumResolutionMPerPx: number;
  yScale: { (value: number): number };
}) =>
  filterTickValuesByPixelDistance(
    buildResolutionTickValuesForDomain(
      minimumResolutionMPerPx,
      maximumResolutionMPerPx
    )
      .slice()
      .reverse(),
    (resolutionMPerPx) => yScale(resolutionMPerPx),
    22
  );

const styleAxis = (axisNode: SVGGElement | null) => {
  if (!axisNode) {
    return;
  }

  const axisSelection = select(axisNode);
  axisSelection.selectAll("text").attr("fill", "#334155").attr("font-size", 12);
  axisSelection.selectAll(".domain").attr("stroke", "none");
  axisSelection.selectAll("line").attr("stroke", "rgba(100, 116, 139, 0.78)");
};

const findNearestIndex = (values: readonly number[], target: number) => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  values.forEach((value, index) => {
    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const filterTickValuesByPixelDistance = <T,>(
  values: readonly T[],
  readY: (value: T) => number,
  minimumDistancePx: number
) => {
  let lastY = Number.NEGATIVE_INFINITY;

  return values.filter((value) => {
    const y = readY(value);
    if (!Number.isFinite(y) || y - lastY < minimumDistancePx) {
      return false;
    }

    lastY = y;
    return true;
  });
};

const readSampleBandBounds = (
  samplePositions: readonly number[],
  minimumBound: number,
  maximumBound: number
) =>
  samplePositions.map((position, index, positions) => {
    const previousPosition = positions[index - 1];
    const nextPosition = positions[index + 1];
    const rawStart =
      index === 0
        ? position - ((nextPosition ?? position) - position) * 0.5
        : (position + (previousPosition ?? position)) * 0.5;
    const rawEnd =
      index === positions.length - 1
        ? position + (position - (previousPosition ?? position)) * 0.5
        : (position + (nextPosition ?? position)) * 0.5;
    const clampedStart = Math.max(
      minimumBound,
      Math.min(maximumBound, rawStart)
    );
    const clampedEnd = Math.max(minimumBound, Math.min(maximumBound, rawEnd));

    return {
      start: Math.min(clampedStart, clampedEnd),
      end: Math.max(clampedStart, clampedEnd),
    };
  });

const drawHeatmapRaster = ({
  canvas,
  width,
  height,
  values,
  colorScale,
  columnCenters,
  rowCenters,
  targetX,
  targetY,
  targetWidth,
  targetHeight,
}: {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  values: number[][];
  colorScale: (value: number) => string;
  columnCenters: number[];
  rowCenters: number[];
  targetX: number;
  targetY: number;
  targetWidth: number;
  targetHeight: number;
}) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;

  const columnBounds = readSampleBandBounds(columnCenters, 0, targetWidth);
  const rowBounds = readSampleBandBounds(rowCenters, 0, targetHeight);

  const columnPixelBounds = columnBounds.map((bound, index) => ({
    start:
      index === 0 ? Math.floor(bound.start) : Math.round(bound.start),
    end:
      index === columnBounds.length - 1
        ? Math.ceil(bound.end)
        : Math.round(bound.end),
  }));
  const rowPixelBounds = rowBounds.map((bound, index) => ({
    start: index === 0 ? Math.floor(bound.start) : Math.round(bound.start),
    end:
      index === rowBounds.length - 1 ? Math.ceil(bound.end) : Math.round(bound.end),
  }));

  rowPixelBounds.forEach((rowBound, rowIndex) => {
    const rowValues = values[rowIndex];
    const rowTop = targetY + rowBound.start;
    const rowHeight = rowBound.end - rowBound.start;

    if (!(rowHeight > 0)) {
      return;
    }

    columnPixelBounds.forEach((columnBound, columnIndex) => {
      const value = rowValues?.[columnIndex];
      const columnLeft = targetX + columnBound.start;
      const columnWidth = columnBound.end - columnBound.start;

      if (!(columnWidth > 0) || !Number.isFinite(value)) {
        return;
      }

      context.fillStyle = colorScale(value);
      context.fillRect(columnLeft, rowTop, columnWidth, rowHeight);
    });
  });
};

export const RangeByFovAndResolutionPanel = ({
  xAxisMode,
}: {
  xAxisMode: RangePlotXAxisMode;
}) => {
  const xAxisRef = useRef<SVGGElement | null>(null);
  const yAxisRef = useRef<SVGGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinnedReadoutIdRef = useRef(0);
  const [hoverReadout, setHoverReadout] = useState<HeatmapReadout | null>(null);
  const [pinnedReadouts, setPinnedReadouts] = useState<PinnedHeatmapReadout[]>(
    []
  );

  const innerWidth = PLOT_OUTER_WIDTH_PX - PLOT_MARGIN.left - PLOT_MARGIN.right;
  const innerHeight =
    PLOT_OUTER_HEIGHT_PX - PLOT_MARGIN.top - PLOT_MARGIN.bottom;

  const resolutionDomain = useMemo(
    () => ({
      minimumResolutionMPerPx: readCenterResolutionMetersPerPixel({
        rangeM: DEFAULT_STANDARD_RANGE_M,
        fovDeg: MIN_EFFECTIVE_FOV_DEG,
      }),
      maximumResolutionMPerPx: readCenterResolutionMetersPerPixel({
        rangeM: DEFAULT_STANDARD_RANGE_M,
        fovDeg: MAX_EFFECTIVE_FOV_DEG,
      }),
    }),
    []
  );

  const plotData = useMemo(() => {
    const fovSamples = buildFovSamples();
    const resolutionRows = buildResolutionRowsForDomain(
      resolutionDomain.minimumResolutionMPerPx,
      resolutionDomain.maximumResolutionMPerPx
    );
    const rawRangeRows = resolutionRows.map((row) =>
      fovSamples.map((fovDeg) =>
        readRangeFromCenterResolutionAtFov({
          centerResolutionMPerPx: row.resolutionMPerPx,
          fovDeg,
        })
      )
    );
    const finiteRanges = rawRangeRows.flat().filter(Number.isFinite);
    const rangeExtent = extent(finiteRanges) as
      | [number, number]
      | [undefined, undefined];

    return {
      fovSamples,
      resolutionRows,
      rawRangeRows,
      rangeExtent:
        Number.isFinite(rangeExtent[0]) && Number.isFinite(rangeExtent[1])
          ? (rangeExtent as [number, number])
          : [1, 1_000],
    };
  }, [resolutionDomain]);

  const xSampleValues = useMemo(
    () =>
      plotData.fovSamples.map((fovDeg) =>
        readDollyZoomXAxisValue(fovDeg, xAxisMode)
      ),
    [plotData.fovSamples, xAxisMode]
  );

  const ySampleValues = useMemo(
    () => plotData.resolutionRows.map((row) => row.resolutionMPerPx),
    [plotData.resolutionRows]
  );

  const xScale = useMemo(
    () => {
      const xDomain = extent(xSampleValues) as
        | [number, number]
        | [undefined, undefined];

      return scaleLinear()
        .domain([
          Number.isFinite(xDomain[0]) ? xDomain[0] : 0,
          Number.isFinite(xDomain[1]) ? xDomain[1] : 1,
        ])
        .range([0, innerWidth]);
    },
    [innerWidth, xSampleValues]
  );

  const yScale = useMemo(
    () =>
      scaleLog()
        .base(2)
        .domain([
          resolutionDomain.minimumResolutionMPerPx,
          resolutionDomain.maximumResolutionMPerPx,
        ])
        .range([innerHeight, 0]),
    [innerHeight, resolutionDomain]
  );

  const xSampleCenters = useMemo(
    () => xSampleValues.map((value) => xScale(value)),
    [xSampleValues, xScale]
  );

  const ySampleCenters = useMemo(
    () => ySampleValues.map((value) => yScale(value)),
    [ySampleValues, yScale]
  );

  const colorScale = useMemo(() => {
    const [minRange, maxRange] = plotData.rangeExtent;
    return scaleSequential(interpolateViridis).domain([
      Math.log2(minRange),
      Math.log2(maxRange),
    ]);
  }, [plotData.rangeExtent]);

  const contourLines = useMemo(() => {
    const lineGenerator = d3Line<RangeContourPoint>()
      .x(
        (point) =>
          xScale(readDollyZoomXAxisValue(point.fovDeg, xAxisMode))
          + PLOT_MARGIN.left
      )
      .y((point) => PLOT_MARGIN.top + yScale(point.centerResolutionMPerPx))
      .curve(curveLinear);

    return RANGE_CONTOUR_VALUES_M.map((rangeM) => {
      const points = plotData.fovSamples.flatMap((fovDeg) => {
        const centerResolutionMPerPx = readCenterResolutionMetersPerPixel({
          rangeM: rangeM as Meters,
          fovDeg,
        });

        if (
          !Number.isFinite(centerResolutionMPerPx) ||
          centerResolutionMPerPx < resolutionDomain.minimumResolutionMPerPx ||
          centerResolutionMPerPx > resolutionDomain.maximumResolutionMPerPx
        ) {
          return [];
        }

        return [{ fovDeg, centerResolutionMPerPx }];
      });

      if (points.length < 2 || points[0] === undefined) {
        return null;
      }

      const labelPoint =
        points.reduce((best, point) =>
          Math.abs(point.fovDeg - 45) < Math.abs(best.fovDeg - 45)
            ? point
            : best
        ) ?? points[0];

      return {
        rangeM,
        labelPoint,
        path: lineGenerator(points),
      };
    }).filter(
      (
        contourLine
      ): contourLine is {
        rangeM: number;
        labelPoint: RangeContourPoint;
        path: string;
      } => contourLine !== null && typeof contourLine.path === "string"
    );
  }, [plotData.fovSamples, resolutionDomain, xAxisMode, xScale, yScale]);

  useEffect(() => {
    const xTickEntries = buildDollyZoomXAxisTickEntries(xAxisMode);
    const xTickLabelByValue = new Map(
      xTickEntries.map((entry) => [entry.value.toFixed(12), entry.label])
    );
    const xAxis = axisBottom(xScale)
      .tickValues(xTickEntries.map((entry) => entry.value))
      .tickFormat(
        (value) => xTickLabelByValue.get(Number(value).toFixed(12)) ?? ""
      );
    const yAxis = axisLeft(yScale)
      .tickValues(
        buildResolutionAxisTickValues({
          minimumResolutionMPerPx: resolutionDomain.minimumResolutionMPerPx,
          maximumResolutionMPerPx: resolutionDomain.maximumResolutionMPerPx,
          yScale,
        })
      )
      .tickFormat((value) => {
        const resolutionMPerPx = Number(value);
        return Number.isFinite(resolutionMPerPx)
          ? formatResolutionAxisValue(resolutionMPerPx)
          : "";
      });

    select(xAxisRef.current).call(xAxis);
    select(yAxisRef.current).call(yAxis);
    styleAxis(xAxisRef.current);
    styleAxis(yAxisRef.current);
  }, [resolutionDomain, xAxisMode, xScale, yScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawHeatmapRaster({
      canvas,
      width: canvas.width,
      height: canvas.height,
      values: plotData.rawRangeRows.map((row) =>
        row.map((rangeM) => Math.log2(rangeM))
      ),
      colorScale,
      columnCenters: xSampleCenters,
      rowCenters: ySampleCenters,
      targetX: PLOT_MARGIN.left,
      targetY: PLOT_MARGIN.top,
      targetWidth: innerWidth,
      targetHeight: innerHeight,
    });
  }, [colorScale, innerHeight, innerWidth, plotData, xSampleCenters, ySampleCenters]);

  const handleHeatmapMove = (event: ReactMouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotX = Math.max(
      0,
      Math.min(event.clientX - bounds.left, innerWidth)
    );
    const plotY = Math.max(
      0,
      Math.min(event.clientY - bounds.top, innerHeight)
    );

    const fovIndex = findNearestIndex(xSampleValues, xScale.invert(plotX));
    const rowIndex = findNearestIndex(ySampleValues, yScale.invert(plotY));

    const fovDeg = plotData.fovSamples[fovIndex] ?? Number.NaN;
    const centerResolutionMPerPx =
      plotData.resolutionRows[rowIndex]?.resolutionMPerPx ?? Number.NaN;
    const rangeM = plotData.rawRangeRows[rowIndex]?.[fovIndex] ?? Number.NaN;

    const nextReadout = {
      fovDeg,
      rangeM,
      centerResolutionMPerPx,
      plotX,
      plotY,
    };

    setHoverReadout(nextReadout);
  };

  const handleHeatmapClick = (event: ReactMouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotX = Math.max(
      0,
      Math.min(event.clientX - bounds.left, innerWidth)
    );
    const plotY = Math.max(
      0,
      Math.min(event.clientY - bounds.top, innerHeight)
    );

    const fovIndex = findNearestIndex(xSampleValues, xScale.invert(plotX));
    const rowIndex = findNearestIndex(ySampleValues, yScale.invert(plotY));

    const fovDeg = plotData.fovSamples[fovIndex] ?? Number.NaN;
    const centerResolutionMPerPx =
      plotData.resolutionRows[rowIndex]?.resolutionMPerPx ?? Number.NaN;
    const rangeM = plotData.rawRangeRows[rowIndex]?.[fovIndex] ?? Number.NaN;

    pinnedReadoutIdRef.current += 1;
    setPinnedReadouts((current) => [
      ...current,
      {
        id: `range-by-fov-${pinnedReadoutIdRef.current}`,
        fovDeg,
        rangeM,
        centerResolutionMPerPx,
        plotX,
        plotY,
      },
    ]);
  };

  const readReadoutBox = (readout: HeatmapReadout) =>
    readSampleAnchoredTooltipBox({
      plotX: readout.plotX,
      plotY: readout.plotY,
      width: 212,
      height: 28,
    });

  return (
    <section style={GEO_STORY_STYLES.layout.panel}>
      <svg
        width={PLOT_OUTER_WIDTH_PX}
        height={PLOT_OUTER_HEIGHT_PX}
        role="img"
        aria-label="Required camera range by field of view and center resolution"
        style={{ display: "block" }}
      >
        <foreignObject
          x={0}
          y={0}
          width={PLOT_OUTER_WIDTH_PX}
          height={PLOT_OUTER_HEIGHT_PX}
        >
          <canvas
            ref={canvasRef}
            width={PLOT_OUTER_WIDTH_PX}
            height={PLOT_OUTER_HEIGHT_PX}
            style={{ display: "block" }}
          />
        </foreignObject>
        <g
          ref={xAxisRef}
          transform={`translate(${PLOT_MARGIN.left}, ${
            PLOT_MARGIN.top + innerHeight
          })`}
        />
        <g
          ref={yAxisRef}
          transform={`translate(${PLOT_MARGIN.left}, ${PLOT_MARGIN.top})`}
        />
        <rect
          x={PLOT_MARGIN.left}
          y={PLOT_MARGIN.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          style={{ cursor: "none" }}
          onMouseMove={handleHeatmapMove}
          onMouseLeave={() => setHoverReadout(null)}
          onClick={handleHeatmapClick}
        />
        {contourLines.map((contourLine) => (
          <path
            key={`range-contour-${contourLine.rangeM}`}
            d={contourLine.path}
            fill="none"
            stroke="rgba(248, 250, 252, 0.82)"
            strokeWidth={1}
          />
        ))}
        {contourLines.map((contourLine) => {
          const labelX =
            PLOT_MARGIN.left +
            xScale(
              readDollyZoomXAxisValue(contourLine.labelPoint.fovDeg, xAxisMode)
            ) +
            6;
          const labelY =
            PLOT_MARGIN.top +
            yScale(contourLine.labelPoint.centerResolutionMPerPx) -
            6;

          if (
            labelX < PLOT_MARGIN.left + 4 ||
            labelX > PLOT_MARGIN.left + innerWidth - 36 ||
            labelY < PLOT_MARGIN.top + 12 ||
            labelY > PLOT_MARGIN.top + innerHeight - 4
          ) {
            return null;
          }

          return (
            <text
              key={`range-contour-label-${contourLine.rangeM}`}
              x={labelX}
              y={labelY}
              fill="#0f172a"
              fontSize={11}
              style={GEO_STORY_STYLES.text.svg}
            >
              {formatRangeM(contourLine.rangeM)}
            </text>
          );
        })}
        <text
          x={PLOT_MARGIN.left + innerWidth * 0.5}
          y={PLOT_MARGIN.top + innerHeight + 34}
          textAnchor="middle"
          style={GEO_STORY_STYLES.text.svg}
        >
          {readDollyZoomXAxisLabel(xAxisMode)}
        </text>
        <text
          x={20}
          y={PLOT_MARGIN.top + innerHeight * 0.5}
          textAnchor="middle"
          transform={`rotate(-90 20 ${PLOT_MARGIN.top + innerHeight * 0.5})`}
          style={GEO_STORY_STYLES.text.svg}
        >
          {Y_AXIS_LABEL}
        </text>
        {pinnedReadouts.map((readout) => {
          const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
            axisLineX: PLOT_MARGIN.left,
            text: formatResolutionAxisValue(readout.centerResolutionMPerPx),
            y: PLOT_MARGIN.top + readout.plotY,
            width: Y_READOUT_WIDTH,
          });
          const xAxisValueLabel = createBottomXAxisReadoutLabel({
            axisLineY: PLOT_MARGIN.top + innerHeight,
            text: formatDollyZoomXAxisReadoutValue(readout.fovDeg),
            x: PLOT_MARGIN.left + readout.plotX,
          });
          const readoutBox = readReadoutBox(readout);

          return (
            <PlotHoverReadoutLayers
              key={readout.id}
              readoutKey={readout.id}
              plotLeft={PLOT_MARGIN.left}
              plotTop={PLOT_MARGIN.top}
              innerWidth={innerWidth}
              innerHeight={innerHeight}
              plotX={readout.plotX}
              plotY={readout.plotY}
              showGuides
              guideLeftX={readGuideLeftXFromPrimaryYAxisReadout(
                yAxisValueLabel
              )}
              guideBottomY={readGuideBottomYFromBottomXAxisReadout(
                xAxisValueLabel
              )}
              axisValueLabels={[xAxisValueLabel, yAxisValueLabel]}
              tooltip={{
                x: PLOT_MARGIN.left + readoutBox.x,
                y: PLOT_MARGIN.top + readoutBox.y,
                width: readoutBox.width,
                height: readoutBox.height,
                anchorAttach: "left",
                anchorAtSemicircleCenter: true,
                onClose: () =>
                  setPinnedReadouts((current) =>
                    current.filter((entry) => entry.id !== readout.id)
                  ),
                children: <span>{formatRangeM(readout.rangeM)}</span>,
              }}
            />
          );
        })}
        {hoverReadout
          ? (() => {
              const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
                axisLineX: PLOT_MARGIN.left,
                text: formatResolutionAxisValue(
                  hoverReadout.centerResolutionMPerPx
                ),
                y: PLOT_MARGIN.top + hoverReadout.plotY,
                width: Y_READOUT_WIDTH,
              });
              const xAxisValueLabel = createBottomXAxisReadoutLabel({
                axisLineY: PLOT_MARGIN.top + innerHeight,
                text: formatDollyZoomXAxisReadoutValue(hoverReadout.fovDeg),
                x: PLOT_MARGIN.left + hoverReadout.plotX,
              });
              const readoutBox = readReadoutBox(hoverReadout);

              return (
                <PlotHoverReadoutLayers
                  plotLeft={PLOT_MARGIN.left}
                  plotTop={PLOT_MARGIN.top}
                  innerWidth={innerWidth}
                  innerHeight={innerHeight}
                  plotX={hoverReadout.plotX}
                  plotY={hoverReadout.plotY}
                  showGuides
                  guideLeftX={readGuideLeftXFromPrimaryYAxisReadout(
                    yAxisValueLabel
                  )}
                  guideBottomY={readGuideBottomYFromBottomXAxisReadout(
                    xAxisValueLabel
                  )}
                  axisValueLabels={[xAxisValueLabel, yAxisValueLabel]}
                  tooltip={{
                    x: PLOT_MARGIN.left + readoutBox.x,
                    y: PLOT_MARGIN.top + readoutBox.y,
                    width: readoutBox.width,
                    height: readoutBox.height,
                    anchorAttach: "left",
                    anchorAtSemicircleCenter: true,
                    children: <span>{formatRangeM(hoverReadout.rangeM)}</span>,
                  }}
                />
              );
            })()
          : null}
      </svg>
    </section>
  );
};

export const RangeByFovAndResolutionPlot = ({
  xAxisMode,
}: RangeByFovAndResolutionStoryArgs) => {
  const statusValues = useMemo(
    () => [readDollyZoomXAxisStatusValue(xAxisMode), Y_AXIS_STATUS_VALUE],
    [xAxisMode]
  );

  return (
    <GeoChartStoryFrame
      label="Range by FOV and Resolution"
      values={statusValues}
    >
      <section style={GEO_STORY_STYLES.layout.intro}>
        <p style={GEO_STORY_STYLES.text.introText}>
          True dolly zoom compensation follows the tangent half-angle, not a
          linear FOV scale.{" "}
          <a
            href="https://en.wikipedia.org/wiki/Dolly_zoom"
            target="_blank"
            rel="noreferrer"
          >
            Wikipedia
          </a>
          .
        </p>
        <p style={GEO_STORY_STYLES.text.introText}>
          range = k / tan(fov / 2)
        </p>
        <p style={GEO_STORY_STYLES.text.introText}>
          fov = 2 · atan(k / range)
        </p>
        <p style={GEO_STORY_STYLES.text.introText}>
          Use plain FOV for intuition, log(fov) to flatten small-angle power
          behavior, or log(tan(fov / 2)) for the exact compensation form.
        </p>
      </section>
      <RangeByFovAndResolutionPanel xAxisMode={xAxisMode} />
    </GeoChartStoryFrame>
  );
};
