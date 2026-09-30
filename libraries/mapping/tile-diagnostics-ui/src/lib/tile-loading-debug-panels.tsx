import type { ReactNode, MutableRefObject } from "react";
import { Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faChartLine,
  faCircleInfo,
  faDrawPolygon,
  faFileExport,
  faGaugeHigh,
  faLayerGroup,
  faMinus,
  faSliders,
  faTableCells,
  faTerminal,
} from "@fortawesome/free-solid-svg-icons";
import {
  MetricLog,
  StripChartPanel,
  type MetricRecorder,
  type StripChart,
} from "@carma-commons/ui/components";
import { TILE_PIPELINE_CHART_ROWS as CHART_ROWS } from "./core/tile-pipeline-chart-rows";
import type { ResolvedDebugOptions } from "./tile-loading-debug-options";
import {
  TILE_LOADING_DEBUG_OVERVIEW_MODE,
  TILE_LOADING_DEBUG_PANEL_ID,
  type TileLoadingDebugOverviewMode,
} from "./tile-loading-debug-tokens";

export const createTileLoadingDebugPanels = ({
  options,
  onOptionsChange,
  onExport,
  overviewMode,
  renderMeshStyle,
  renderOverview,
  renderOverviewOptions,
  legend,
  renderQueue,
  renderStats,
  chartHistoryRef,
  chartRef,
  recorder,
}: {
  options: ResolvedDebugOptions;
  onOptionsChange: (patch: Partial<ResolvedDebugOptions>) => void;
  onExport: () => void;
  overviewMode: TileLoadingDebugOverviewMode;
  renderMeshStyle: () => ReactNode;
  renderOverview: (windowed: boolean) => ReactNode;
  renderOverviewOptions: () => ReactNode;
  legend: ReactNode;
  renderQueue: () => ReactNode;
  renderStats: () => ReactNode;
  chartHistoryRef: MutableRefObject<StripChart | null>;
  chartRef: MutableRefObject<StripChart | null>;
  recorder: MetricRecorder;
}) => {
  return [
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.DIAGNOSTIC_TOOLS,
      label: "Diagnostics",
      icon: faGaugeHigh,
      flag: "showDiagnosticTools",
      width: 304,
      height: 220,
      left: 330,
      top: 56,
      resize: "vertical",
      content: () => (
        <div className="tile-debug-form">
          <div
            role="group"
            aria-label="Diagnostic windows"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {(
              [
                ["showQueue", "Queue", faBars],
                ["showStats", "Statistics", faTableCells],
                ["showCharts", "Stats timeline", faChartLine],
                ["showEventLog", "Event log", faTerminal],
              ] as const
            ).map(([flag, label, icon]) => (
              <Button
                key={flag}
                type={options[flag] ? "primary" : "default"}
                aria-pressed={options[flag]}
                icon={<FontAwesomeIcon icon={icon} />}
                onClick={() => onOptionsChange({ [flag]: !options[flag] })}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button
            icon={<FontAwesomeIcon icon={faFileExport} />}
            onClick={() => onExport()}
          >
            Export state, screenshot and logs
          </Button>
          <Button
            type="text"
            icon={<FontAwesomeIcon icon={faMinus} />}
            onClick={() => onOptionsChange({ hideAllDebugPanels: true })}
          >
            Hide all panels
          </Button>
        </div>
      ),
    },
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.MESH_STYLE,
      label: "Mesh style",
      icon: faDrawPolygon,
      flag: "showMeshStylePanel",
      width: 320,
      height: 460,
      left: 650,
      top: 56,
      resize: "both",
      content: renderMeshStyle,
    },
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW,
      label: "Overview",
      icon: faLayerGroup,
      flag: "showOverviewPanel",
      width:
        overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.OVERLAY ? 390 : 500,
      height:
        overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.OVERLAY ? 335 : 420,
      left: 12,
      top: 56,
      resize: "both",
      content: () =>
        renderOverview(
          overviewMode === TILE_LOADING_DEBUG_OVERVIEW_MODE.WINDOW
        ),
    },
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.OVERVIEW_OPTIONS,
      label: "Overview options",
      icon: faSliders,
      flag: "showOverviewOptions",
      width: 310,
      height: 460,
      left: 330,
      top: 56,
      resize: "vertical",
      content: renderOverviewOptions,
    },
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.LEGEND,
      label: "Overview legend",
      icon: faCircleInfo,
      flag: "showLegend",
      width: 240,
      height: 480,
      left: 12,
      top: 56,
      resize: "both",
      content: () => legend,
    },
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.QUEUE,
      label: "Queue",
      icon: faBars,
      flag: "showQueue",
      width: 520,
      height: 270,
      left: 430,
      top: 56,
      resize: "both",
      content: renderQueue,
    },
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.STATS,
      label: "Statistics",
      icon: faTableCells,
      flag: "showStats",
      width: 480,
      height: 170,
      left: 12,
      top: 390,
      resize: "both",
      content: renderStats,
    },
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.CHARTS,
      label: "Stats timeline",
      icon: faChartLine,
      flag: "showCharts",
      width: 620,
      height: 625,
      left: 580,
      top: 420,
      resize: "both",
      content: () => (
        <>
          <details className="tile-debug-timeline-help">
            <summary>Reading these metrics</summary>
            <p>
              All lanes share real time; each lane has its own numeric origin.
              Since start retains older peaks in compacted buckets; last 30 s
              follows the live view. Dashed horizontal lines show known limits
              or labelled assumptions: 600 Mbit/s fibre and a 60 Hz frame
              budget. Rates count completed responses, so bursts can exceed the
              line. Encoded bodies include cache hits; decoded bytes are not
              wire traffic. CPU/GPU capacity is unknown; slots are concurrency
              limits. – means unavailable. Vertical markers: blue move start,
              violet move end, cyan view-frustum demand, ochre sun-frustum
              demand.
            </p>
          </details>
          <StripChartPanel
            dataTestId="tile-pipeline-timeline"
            rows={CHART_ROWS}
            retainedChart={chartHistoryRef}
            rowHeight={64}
            onChart={(chart) => {
              chartRef.current = chart;
            }}
          />
        </>
      ),
    },
    {
      id: TILE_LOADING_DEBUG_PANEL_ID.LOG,
      label: "Event log",
      icon: faTerminal,
      flag: "showEventLog",
      width: 520,
      height: 240,
      left: 520,
      top: 360,
      resize: "both",
      content: () => (
        <MetricLog
          recorder={recorder}
          style={{ height: "100%", minHeight: 0 }}
        />
      ),
    },
  ] as const;
};
