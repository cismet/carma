// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StripChartPanel } from "./StripChartPanel";
import type { StripChart } from "../utils/strip-chart";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("shares one canvas/time axis, keeps history on mode switches, and releases the chart", () => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as never);
  let chart: StripChart | null = null;
  const onChart = (value: StripChart | null) => {
    chart = value;
  };
  const retained = { current: null as StripChart | null };
  const rows = [
    {
      id: "wire",
      label: "Wire",
      color: "blue",
      unit: "MiB/s",
      section: "Network",
      plot: "Transfer",
    },
    {
      id: "body",
      label: "Body",
      color: "orange",
      unit: "MiB/s",
      section: "Network",
      plot: "Transfer",
    },
    {
      id: "heap",
      label: "Heap",
      color: "purple",
      unit: "MB",
      section: "Memory",
    },
  ];
  const { container, rerender, unmount } = render(
    <StripChartPanel rows={rows} onChart={onChart} retainedChart={retained} />
  );
  expect(container.querySelectorAll("canvas")).toHaveLength(1);
  expect(
    screen
      .getByRole("group", { name: "Transfer" })
      .querySelectorAll("[data-metric-id]")
  ).toHaveLength(2);
  act(() => {
    chart!.push({ wire: 4, body: 8 }, 0);
    chart!.push({ wire: 10, body: 12 }, 40_000);
    chart!.mark({ at: 40_000, label: "Sun frustum", color: "gold" });
    vi.advanceTimersByTime(250);
  });
  expect(container.querySelector('[data-metric-id="wire"]')?.textContent).toBe(
    "10 MiB/s"
  );
  expect(screen.getByText(/Sun frustum at 40 s/)).toBeTruthy();
  const original = chart;
  fireEvent.click(
    screen.getByRole("button", { name: "Collapse legend to units" })
  );
  expect(
    container.querySelector('[data-legend-collapsed="true"]')
  ).not.toBeNull();
  expect(chart).toBe(original);
  expect(chart!.rowCenter("heap")).toBe(70);
  expect(chart!.current("wire")).toBe(10);
  fireEvent.click(screen.getByRole("button", { name: "Expand legend" }));
  expect(chart!.rowCenter("heap")).toBe(176);
  fireEvent.click(screen.getByRole("button", { name: "Since start" }));
  expect(chart).toBe(original);
  expect(chart!.timeRange()).toEqual({ from: 0, to: 40_000 });
  rerender(
    <StripChartPanel rows={rows} onChart={onChart} retainedChart={retained} />
  );
  expect(chart).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: "Last 30 s" }));
  expect(chart!.timeRange()).toEqual({ from: 10_000, to: 40_000 });
  fireEvent.click(screen.getByRole("button", { name: "Since start" }));
  unmount();
  expect(chart).toBeNull();
  render(
    <StripChartPanel rows={rows} onChart={onChart} retainedChart={retained} />
  );
  expect(chart).toBe(original);
  expect(chart!.current("wire")).toBe(10);
  expect(chart!.timeRange()).toEqual({ from: 0, to: 40_000 });
  expect(
    screen
      .getByRole("button", { name: "Since start" })
      .getAttribute("aria-pressed")
  ).toBe("true");
});

it("keeps plot rows aligned when a label interval change recreates the chart", () => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as never);
  let chart: StripChart | null = null;
  const onChart = (value: StripChart | null) => {
    chart = value;
  };
  const rows = [
    { id: "wire", label: "Wire", color: "blue" },
    { id: "heap", label: "Heap", color: "purple" },
  ];
  const { rerender } = render(<StripChartPanel rows={rows} onChart={onChart} />);
  const original = chart;
  expect(chart!.rowCenter("heap")).toBe(176);

  rerender(
    <StripChartPanel rows={rows} onChart={onChart} labelIntervalMs={500} />
  );

  expect(chart).not.toBe(original);
  expect(chart!.rowCenter("heap")).toBe(176);
});
