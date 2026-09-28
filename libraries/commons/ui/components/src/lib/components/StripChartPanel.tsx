import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  createStripChart,
  type StripChart,
  type StripChartRow,
} from "../utils/strip-chart";
import styles from "./StripChartPanel.module.css";
import chartCss from "./StripChartPanel.module.css?inline";

export interface StripChartPanelProps {
  rows: readonly StripChartRow[];
  onChart: (chart: StripChart | null) => void;
  /** Host-owned history survives dock/undock; the host destroys it on disposal. */
  retainedChart?: { current: StripChart | null };
  rowHeight?: number;
  labelIntervalMs?: number;
  style?: CSSProperties;
  dataTestId?: string;
}

/** Parallel metric origins on one canvas and one timestamp axis. */
export const StripChartPanel = ({
  rows,
  onChart,
  retainedChart,
  rowHeight = 64,
  labelIntervalMs = 250,
  style,
  dataTestId = "strip-chart",
}: StripChartPanelProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<StripChart | null>(null);
  const valueRefs = useRef(new Map<string, HTMLSpanElement>());
  const scaleRefs = useRef(new Map<string, HTMLSpanElement>());
  const limitRefs = useRef(new Map<string, HTMLSpanElement>());
  const tickRefs = useRef(new Map<number, HTMLSpanElement>());
  const eventsRef = useRef<HTMLSpanElement>(null);
  const onChartRef = useRef(onChart);
  onChartRef.current = onChart;
  const [windowMs, setWindowMs] = useState<number | null>(() =>
    retainedChart?.current ? retainedChart.current.window() : 30_000
  );
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const labelHeight = legendCollapsed ? 14 : narrow ? 64 : 40;
  const laneHeight = labelHeight + (legendCollapsed ? 28 : rowHeight);
  const plots = useMemo(() => {
    const grouped = new Map<string, StripChartRow[]>();
    for (const row of rows) {
      const key = `${row.section ?? ""}/${row.plot ?? row.id}`;
      const metrics = grouped.get(key) ?? [];
      metrics.push(row);
      grouped.set(key, metrics);
    }
    return [...grouped.values()];
  }, [rows]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const chart =
      retainedChart?.current ??
      createStripChart({
        canvas: canvasRef.current!,
        rows,
        rowHeight,
        background: "transparent",
      });
    chart.attach(canvasRef.current!);
    if (retainedChart) retainedChart.current = chart;
    chartRef.current = chart;
    onChartRef.current(chart);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;
            if (width > 0) {
              setNarrow(width <= 450);
              chart.resize();
            }
          });
    observer?.observe(canvasRef.current!);
    const number = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 1,
    });
    const labels = window.setInterval(() => {
      for (const [id, element] of valueRefs.current)
        element.textContent = chart.formatted(id);
      for (const [id, element] of limitRefs.current)
        element.textContent = chart.reference(id);
      for (const [id, element] of scaleRefs.current) {
        const { min, max } = chart.range(id);
        element.textContent = `${number.format(min)}–${number.format(max)}`;
      }
      const { from, to } = chart.timeRange();
      for (const [tick, element] of tickRefs.current) {
        const at = from + ((to - from) * tick) / 4;
        element.textContent =
          chart.window() === null
            ? `${number.format(at / 1000)} s`
            : tick === 4
            ? "now"
            : `${number.format((at - to) / 1000)} s`;
      }
      const events = chart
        .markers()
        .filter((marker) => marker.at >= from && marker.at <= to);
      if (eventsRef.current) {
        const last = events.at(-1);
        eventsRef.current.textContent = last
          ? `${events.length} markers · ${last.label} at ${number.format(
              last.at / 1000
            )} s`
          : "No view changes";
        eventsRef.current.title = events
          .slice(-12)
          .map(
            (event) => `${number.format(event.at / 1000)} s · ${event.label}`
          )
          .join("\n");
      }
    }, labelIntervalMs);
    return () => {
      window.clearInterval(labels);
      observer?.disconnect();
      if (!retainedChart) chart.destroy();
      chartRef.current = null;
      if (chart.detach(canvas)) onChartRef.current(null);
    };
  }, [rows, rowHeight, labelIntervalMs, retainedChart]);
  useEffect(() => {
    chartRef.current?.setWindow(windowMs);
  }, [windowMs, rows, rowHeight, labelIntervalMs]);

  useEffect(() => {
    chartRef.current?.resize(laneHeight, labelHeight);
  }, [
    laneHeight,
    labelHeight,
    rows,
    rowHeight,
    labelIntervalMs,
    retainedChart,
  ]);

  return (
    <div
      data-test-id={dataTestId}
      data-legend-collapsed={legendCollapsed}
      className={styles.panel}
      style={style}
    >
      <style>{chartCss}</style>
      <div className={styles.toolbar}>
        <div role="group" aria-label="Time range">
          <button
            type="button"
            aria-pressed={windowMs === null}
            onClick={() => setWindowMs(null)}
          >
            Since start
          </button>
          <button
            type="button"
            aria-pressed={windowMs !== null}
            onClick={() => setWindowMs(30_000)}
          >
            Last 30 s
          </button>
        </div>
        <button
          type="button"
          className={styles.legendToggle}
          aria-label={
            legendCollapsed ? "Expand legend" : "Collapse legend to units"
          }
          aria-expanded={!legendCollapsed}
          title={legendCollapsed ? "Show metric legend" : "Show units only"}
          onClick={() => setLegendCollapsed((collapsed) => !collapsed)}
        >
          {legendCollapsed ? "▸ Legend" : "▾ Legend"}
        </button>
        <span className={styles.events} ref={eventsRef}>
          No view changes
        </span>
      </div>
      <div className={styles.axis} aria-label="Shared time axis">
        <div>
          {[0, 1, 2, 3, 4].map((tick) => (
            <span
              key={tick}
              style={{ left: `${tick * 25}%` }}
              ref={(element) => {
                if (element) tickRefs.current.set(tick, element);
                else tickRefs.current.delete(tick);
              }}
            >
              –
            </span>
          ))}
        </div>
      </div>
      <div className={styles.parallel}>
        <div className={styles.legend}>
          {plots.map((metrics, index) => {
            const first = metrics[0];
            return (
              <div
                key={first.id}
                className={styles.lane}
                style={{ height: laneHeight }}
                role="group"
                aria-label={first.plot ?? first.label}
                title={first.plot ?? first.label}
              >
                <div
                  className={styles.labelBand}
                  style={{ height: labelHeight }}
                >
                  <span className={styles.unitOnly}>{first.unit ?? "#"}</span>
                  <div className={styles.headingLine}>
                    {first.section !== plots[index - 1]?.[0].section && (
                      <span className={styles.section}>{first.section}</span>
                    )}
                    <strong
                      className={styles.heading}
                      title={first.plot ?? first.label}
                    >
                      {first.plot ?? first.label}
                    </strong>
                    <span className={styles.scale}>
                      <span
                        ref={(element) => {
                          if (element) scaleRefs.current.set(first.id, element);
                          else scaleRefs.current.delete(first.id);
                        }}
                      >
                        –
                      </span>{" "}
                      {first.unit}
                    </span>
                  </div>
                  <div className={styles.metrics}>
                    {metrics.map((row) => (
                      <div
                        key={row.id}
                        className={styles.metric}
                        title={row.description}
                      >
                        <span
                          className={styles.swatch}
                          style={{ background: row.color }}
                        />
                        <span className={styles.label}>{row.label}</span>
                        <span
                          className={styles.value}
                          data-metric-id={row.id}
                          ref={(element) => {
                            if (element) valueRefs.current.set(row.id, element);
                            else valueRefs.current.delete(row.id);
                          }}
                        >
                          –
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.limits}>
                    {metrics
                      .filter((row) => row.reference)
                      .map((row) => (
                        <span
                          key={row.id}
                          className={styles.limit}
                          style={{ color: row.color }}
                          ref={(element) => {
                            if (element) limitRefs.current.set(row.id, element);
                            else limitRefs.current.delete(row.id);
                          }}
                        >
                          –
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <canvas
          ref={canvasRef}
          aria-label="Parallel metrics with shared time axis and frustum markers"
          role="img"
        />
      </div>
    </div>
  );
};
