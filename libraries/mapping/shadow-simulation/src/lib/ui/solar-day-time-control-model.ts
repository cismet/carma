import type { DaylightWindow } from "../core/solar-position";
import { getSolarMonthTicks } from "./format-shadow-selection";

export const SVG_WIDTH = 336;
export const SVG_HEIGHT = 112;
export const PLOT_LEFT = 36;
export const PLOT_TOP = 4;
export const PLOT_WIDTH = SVG_WIDTH - PLOT_LEFT - 10;
export const PLOT_HEIGHT = SVG_HEIGHT - PLOT_TOP - 18;
const MINUTES_PER_DAY = 24 * 60;

/** Pure presentation model: astronomy remains in solar-position, DOM in the view. */
export const buildSolarDayTimeControlModel = (
  year: number,
  daylight: readonly DaylightWindow[]
) => {
  const dayCount = daylight.length;
  const toX = (dayOfYear: number) =>
    PLOT_LEFT + ((dayOfYear - 1) / Math.max(1, dayCount - 1)) * PLOT_WIDTH;
  const toY = (minutes: number) =>
    PLOT_TOP + (1 - minutes / MINUTES_PER_DAY) * PLOT_HEIGHT;
  const point = (day: number, minutes: number) =>
    `${toX(day).toFixed(2)},${toY(minutes).toFixed(2)}`;
  const sunrisePoints = daylight.map((window, index) =>
    point(index + 1, window.sunriseMinutes)
  );
  const sunsetPoints = daylight.map((window, index) =>
    point(index + 1, window.sunsetMinutes)
  );
  const path = (points: readonly string[]) =>
    points
      .map((value, index) => `${index === 0 ? "M" : "L"}${value}`)
      .join(" ");
  const sunrisePath = path(sunrisePoints);
  return {
    daylight,
    dayCount,
    monthTicks: getSolarMonthTicks(year),
    toX,
    toY,
    sunrisePath,
    sunsetPath: path(sunsetPoints),
    daylightAreaPath: [
      sunrisePath,
      ...[...sunsetPoints].reverse().map((value) => `L${value}`),
      "Z",
    ].join(" "),
    selectionAtPoint: (x: number, y: number) => ({
      dayOfYear: Math.round(
        1 + ((x - PLOT_LEFT) / PLOT_WIDTH) * (dayCount - 1)
      ),
      minutes: (1 - (y - PLOT_TOP) / PLOT_HEIGHT) * MINUTES_PER_DAY,
    }),
  };
};
