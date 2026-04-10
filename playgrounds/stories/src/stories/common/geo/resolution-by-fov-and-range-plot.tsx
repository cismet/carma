import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

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

import type { Meters } from "@carma-units";

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
export const RESOLUTION_PLOT_X_AXIS_MODES = DOLLY_ZOOM_X_AXIS_MODES;
export type ResolutionPlotXAxisMode = DollyZoomXAxisMode;

export type ResolutionByFovAndRangeStoryArgs = {
  xAxisMode: ResolutionPlotXAxisMode;
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

type RangeRow = {
  rangeM: number;
};

type ResolutionContourPoint = {
  fovDeg: number;
  rangeM: number;
};

const MIN_EFFECTIVE_FOV_DEG = 1;
const MAX_EFFECTIVE_FOV_DEG = 120;
const MIN_RANGE_M = 10;
const MAX_RANGE_M = 100_000;
const FOV_STEP_DEG = 0.25;
const HEATMAP_LOG2_RANGE_STEP = 0.025;
const PLOT_OUTER_WIDTH_PX = 980;
const PLOT_OUTER_HEIGHT_PX = 560;
const PLOT_MARGIN = {
  top: 28,
  right: 28,
  bottom: 96,
  left: 92,
} as const;
const Y_READOUT_WIDTH = 112;
const Y_AXIS_LABEL = "range (m)";
const Y_AXIS_STATUS_VALUE = "y log2(range)";
const RESOLUTION_CONTOUR_VALUES_M_PER_PX = [0.01, 0.1, 1, 10, 100] as const;

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

const buildRangeRows = (): RangeRow[] =>
  buildSteppedRange(
    Math.log2(MIN_RANGE_M),
    Math.log2(MAX_RANGE_M),
    HEATMAP_LOG2_RANGE_STEP
  ).map((log2Range) => ({
    rangeM: Math.pow(2, log2Range),
  }));

const buildRangeTickValues = () => [10, 100, 1_000, 10_000, 100_000];

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

const formatResolutionValue = (value: number) =>
  Number.isFinite(value)
    ? d3Format(value >= 1 ? ".2f" : value >= 0.01 ? ".3f" : ".4f")(value)
    : "—";

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
    start: index === 0 ? Math.floor(bound.start) : Math.round(bound.start),
    end:
      index === columnBounds.length - 1
        ? Math.ceil(bound.end)
        : Math.round(bound.end),
  }));
  const rowPixelBounds = rowBounds.map((bound, index) => ({
    start: index === 0 ? Math.floor(bound.start) : Math.round(bound.start),
    end:
      index === rowBounds.length - 1
        ? Math.ceil(bound.end)
        : Math.round(bound.end),
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

export const ResolutionByFovAndRangePanel = ({
  xAxisMode,
}: {
  xAxisMode: ResolutionPlotXAxisMode;
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

  const plotData = useMemo(() => {
    const fovSamples = buildFovSamples();
    const rangeRows = buildRangeRows();
    const resolutionRows = rangeRows.map((row) =>
      fovSamples.map((fovDeg) =>
        readCenterResolutionMetersPerPixel({
          rangeM: row.rangeM as Meters,
          fovDeg,
        })
      )
    );
    const finiteResolutions = resolutionRows.flat().filter(Number.isFinite);
    const resolutionExtent = extent(finiteResolutions) as
      | [number, number]
      | [undefined, undefined];

    return {
      fovSamples,
      rangeRows,
      resolutionRows,
      resolutionExtent:
        Number.isFinite(resolutionExtent[0]) &&
        Number.isFinite(resolutionExtent[1])
          ? (resolutionExtent as [number, number])
          : [0.01, 100],
    };
  }, []);

  const xSampleValues = useMemo(
    () =>
      plotData.fovSamples.map((fovDeg) =>
        readDollyZoomXAxisValue(fovDeg, xAxisMode)
      ),
    [plotData.fovSamples, xAxisMode]
  );
  const ySampleValues = useMemo(
    () => plotData.rangeRows.map((row) => row.rangeM),
    [plotData.rangeRows]
  );

  const xScale = useMemo(() => {
    const xDomain = extent(xSampleValues) as
      | [number, number]
      | [undefined, undefined];

    return scaleLinear()
      .domain([
        Number.isFinite(xDomain[0]) ? xDomain[0] : 0,
        Number.isFinite(xDomain[1]) ? xDomain[1] : 1,
      ])
      .range([0, innerWidth]);
  }, [innerWidth, xSampleValues]);

  const yScale = useMemo(
    () =>
      scaleLog()
        .base(2)
        .domain([MIN_RANGE_M, MAX_RANGE_M])
        .range([innerHeight, 0]),
    [innerHeight]
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
    const [minResolution, maxResolution] = plotData.resolutionExtent;
    return scaleSequential(interpolateViridis).domain([
      Math.log2(minResolution),
      Math.log2(maxResolution),
    ]);
  }, [plotData.resolutionExtent]);

  const contourLines = useMemo(() => {
    const [minimumResolutionMPerPx, maximumResolutionMPerPx] =
      plotData.resolutionExtent;
    const lineGenerator = d3Line<ResolutionContourPoint>()
      .x(
        (point) =>
          PLOT_MARGIN.left +
          xScale(readDollyZoomXAxisValue(point.fovDeg, xAxisMode))
      )
      .y((point) => PLOT_MARGIN.top + yScale(point.rangeM))
      .curve(curveLinear);

    return RESOLUTION_CONTOUR_VALUES_M_PER_PX.map((resolutionMPerPx) => {
      if (
        resolutionMPerPx < minimumResolutionMPerPx ||
        resolutionMPerPx > maximumResolutionMPerPx
      ) {
        return null;
      }

      const points = plotData.fovSamples.flatMap((fovDeg) => {
        const rangeM = readRangeFromCenterResolutionAtFov({
          centerResolutionMPerPx: resolutionMPerPx,
          fovDeg,
        });

        if (
          !Number.isFinite(rangeM) ||
          rangeM < MIN_RANGE_M ||
          rangeM > MAX_RANGE_M
        ) {
          return [];
        }

        return [{ fovDeg, rangeM }];
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
        resolutionMPerPx,
        labelPoint,
        path: lineGenerator(points),
      };
    }).filter(
      (
        contourLine
      ): contourLine is {
        resolutionMPerPx: number;
        labelPoint: ResolutionContourPoint;
        path: string;
      } => contourLine !== null && typeof contourLine.path === "string"
    );
  }, [
    plotData.fovSamples,
    plotData.resolutionExtent,
    xAxisMode,
    xScale,
    yScale,
  ]);

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
        filterTickValuesByPixelDistance(
          buildRangeTickValues().slice().reverse(),
          (rangeM) => yScale(rangeM),
          22
        )
      )
      .tickFormat((value) => formatRangeM(Number(value)));

    select(xAxisRef.current).call(xAxis);
    select(yAxisRef.current).call(yAxis);
    styleAxis(xAxisRef.current);
    styleAxis(yAxisRef.current);
  }, [xAxisMode, xScale, yScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    drawHeatmapRaster({
      canvas,
      width: canvas.width,
      height: canvas.height,
      values: plotData.resolutionRows.map((row) =>
        row.map((resolutionMPerPx) => Math.log2(resolutionMPerPx))
      ),
      colorScale,
      columnCenters: xSampleCenters,
      rowCenters: ySampleCenters,
      targetX: PLOT_MARGIN.left,
      targetY: PLOT_MARGIN.top,
      targetWidth: innerWidth,
      targetHeight: innerHeight,
    });
  }, [
    colorScale,
    innerHeight,
    innerWidth,
    plotData,
    xSampleCenters,
    ySampleCenters,
  ]);

  const readReadoutBox = (readout: HeatmapReadout) =>
    readSampleAnchoredTooltipBox({
      plotX: readout.plotX,
      plotY: readout.plotY,
      width: 212,
      height: 28,
    });

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

    setHoverReadout({
      fovDeg: plotData.fovSamples[fovIndex] ?? Number.NaN,
      rangeM: plotData.rangeRows[rowIndex]?.rangeM ?? Number.NaN,
      centerResolutionMPerPx:
        plotData.resolutionRows[rowIndex]?.[fovIndex] ?? Number.NaN,
      plotX,
      plotY,
    });
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

    pinnedReadoutIdRef.current += 1;
    setPinnedReadouts((current) => [
      ...current,
      {
        id: `resolution-by-fov-${pinnedReadoutIdRef.current}`,
        fovDeg: plotData.fovSamples[fovIndex] ?? Number.NaN,
        rangeM: plotData.rangeRows[rowIndex]?.rangeM ?? Number.NaN,
        centerResolutionMPerPx:
          plotData.resolutionRows[rowIndex]?.[fovIndex] ?? Number.NaN,
        plotX,
        plotY,
      },
    ]);
  };

  return (
    <section style={GEO_STORY_STYLES.layout.panel}>
      <svg
        width={PLOT_OUTER_WIDTH_PX}
        height={PLOT_OUTER_HEIGHT_PX}
        role="img"
        aria-label="Center resolution by field of view and range"
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
            key={`resolution-contour-${contourLine.resolutionMPerPx}`}
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
            PLOT_MARGIN.top + yScale(contourLine.labelPoint.rangeM) - 6;

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
              key={`resolution-contour-label-${contourLine.resolutionMPerPx}`}
              x={labelX}
              y={labelY}
              fill="#0f172a"
              fontSize={11}
              style={GEO_STORY_STYLES.text.svg}
            >
              {formatResolutionValue(contourLine.resolutionMPerPx)}
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
            text: formatRangeM(readout.rangeM),
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
                children: (
                  <span>
                    {formatResolutionValue(readout.centerResolutionMPerPx)} m/px
                  </span>
                ),
              }}
            />
          );
        })}
        {hoverReadout
          ? (() => {
              const yAxisValueLabel = createPrimaryYAxisReadoutLabel({
                axisLineX: PLOT_MARGIN.left,
                text: formatRangeM(hoverReadout.rangeM),
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
                    children: (
                      <span>
                        {formatResolutionValue(
                          hoverReadout.centerResolutionMPerPx
                        )}{" "}
                        m/px
                      </span>
                    ),
                  }}
                />
              );
            })()
          : null}
      </svg>
    </section>
  );
};

export const ResolutionByFovAndRangePlot = ({
  xAxisMode,
}: ResolutionByFovAndRangeStoryArgs) => {
  const statusValues = useMemo(
    () => [readDollyZoomXAxisStatusValue(xAxisMode), Y_AXIS_STATUS_VALUE],
    [xAxisMode]
  );

  return (
    <GeoChartStoryFrame
      label="Resolution by FOV and Range"
      values={statusValues}
    >
      <section style={GEO_STORY_STYLES.layout.intro}>
        <p style={GEO_STORY_STYLES.text.introText}>
          Dolly zoom keeps subject size fixed by trading field of view against
          distance. This view flips the previous plot: range is now an input,
          while center resolution is the output.
        </p>
      </section>
      <ResolutionByFovAndRangePanel xAxisMode={xAxisMode} />
    </GeoChartStoryFrame>
  );
};
