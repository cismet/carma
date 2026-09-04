import { useId, useMemo, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { getDayOfYear, getDaysInYear } from "@carma-commons/utils";

import {
  clampSelectionToDaylight,
  getDaylightWindow,
  type SolarLocation,
  type SolarPosition,
  type SolarSelection,
} from "../core/solar-position";
import { formatClockMinutes } from "./format-shadow-selection";

const SVG_WIDTH = 336;
const SVG_HEIGHT = 112;
const PLOT_LEFT = 36;
const PLOT_RIGHT = 10;
const PLOT_TOP = 4;
const PLOT_BOTTOM = 18;
const PLOT_WIDTH = SVG_WIDTH - PLOT_LEFT - PLOT_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - PLOT_TOP - PLOT_BOTTOM;
const MINUTES_PER_DAY = 24 * 60;

export type SolarDayTimeControlProps = {
  expanded?: boolean;
  location: SolarLocation;
  selection: SolarSelection;
  position: SolarPosition;
  onChange: (selection: SolarSelection) => void;
};

const formatDay = (year: number, dayOfYear: number) =>
  new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, 0, dayOfYear)));

const getMonthTicks = (year: number) =>
  Array.from({ length: 12 }, (_, month) => {
    const date = new Date(Date.UTC(year, month, 1));
    return {
      dayOfYear: getDayOfYear(year, month, 1),
      label: new Intl.DateTimeFormat("de-DE", {
        month: "short",
        timeZone: "UTC",
      }).format(date),
    };
  });

export const SolarDayTimeControl = ({
  expanded = false,
  location,
  selection,
  position,
  onChange,
}: SolarDayTimeControlProps) => {
  const dragging = useRef(false);
  const clipId = useId().replaceAll(":", "");
  const dayCount = getDaysInYear(selection.year);
  const monthTicks = useMemo(
    () => getMonthTicks(selection.year),
    [selection.year]
  );
  const daylight = useMemo(
    () =>
      Array.from({ length: dayCount }, (_, index) =>
        getDaylightWindow(
          { ...selection, dayOfYear: index + 1 },
          location
        )
      ),
    [dayCount, location, selection]
  );

  const toX = (dayOfYear: number) =>
    PLOT_LEFT + ((dayOfYear - 1) / Math.max(1, dayCount - 1)) * PLOT_WIDTH;
  const toY = (minutes: number) =>
    PLOT_TOP + (1 - minutes / MINUTES_PER_DAY) * PLOT_HEIGHT;

  const sunrisePath = daylight
    .map(
      (window, index) =>
        `${index === 0 ? "M" : "L"}${toX(index + 1).toFixed(2)},${toY(
          window.sunriseMinutes
        ).toFixed(2)}`
    )
    .join(" ");
  const sunsetPath = daylight
    .map(
      (window, index) =>
        `${index === 0 ? "M" : "L"}${toX(index + 1).toFixed(2)},${toY(
          window.sunsetMinutes
        ).toFixed(2)}`
    )
    .join(" ");
  const daylightAreaPath = [
    ...daylight.map(
      (window, index) =>
        `${index === 0 ? "M" : "L"}${toX(index + 1).toFixed(2)},${toY(
          window.sunriseMinutes
        ).toFixed(2)}`
    ),
    ...daylight
      .map((window, index) => ({ window, day: index + 1 }))
      .reverse()
      .map(
        ({ window, day }) =>
          `L${toX(day).toFixed(2)},${toY(window.sunsetMinutes).toFixed(2)}`
      ),
    "Z",
  ].join(" ");

  const publishCandidate = (dayOfYear: number, minutes: number) => {
    const next = clampSelectionToDaylight(
      { ...selection, dayOfYear, minutes },
      location
    );
    if (next) onChange(next);
  };

  const updateFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleX = SVG_WIDTH / bounds.width;
    const scaleY = SVG_HEIGHT / bounds.height;
    const x = (event.clientX - bounds.left) * scaleX;
    const y = (event.clientY - bounds.top) * scaleY;
    const dayOfYear = Math.round(
      1 + ((x - PLOT_LEFT) / PLOT_WIDTH) * (dayCount - 1)
    );
    const minutes = (1 - (y - PLOT_TOP) / PLOT_HEIGHT) * MINUTES_PER_DAY;
    publishCandidate(dayOfYear, minutes);
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const dayStep = event.shiftKey ? 7 : 1;
    const minuteStep = event.shiftKey ? 60 : 10;
    let nextDay = selection.dayOfYear;
    let nextMinutes = selection.minutes;
    switch (event.key) {
      case "ArrowLeft":
        nextDay -= dayStep;
        break;
      case "ArrowRight":
        nextDay += dayStep;
        break;
      case "ArrowDown":
        nextMinutes -= minuteStep;
        break;
      case "ArrowUp":
        nextMinutes += minuteStep;
        break;
      case "Home":
        nextDay = 1;
        break;
      case "End":
        nextDay = dayCount;
        break;
      default:
        return;
    }
    event.preventDefault();
    publishCandidate(nextDay, nextMinutes);
  };

  const activeX = toX(selection.dayOfYear);
  const activeY = toY(selection.minutes);
  const activeDaylight = daylight[selection.dayOfYear - 1];

  return (
    <div
      className={`pointer-events-auto text-slate-800 ${
        expanded ? "w-full" : "w-[360px]"
      }`}
      data-test-id="shadow-simulation-control"
    >
      <div className="relative">
        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="block w-full select-none bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
          style={{ touchAction: "none" }}
          role="group"
          tabIndex={0}
          aria-label={`Tag und Tageszeit für die Schattensimulation: ${formatDay(
            selection.year,
            selection.dayOfYear
          )}, ${formatClockMinutes(
            selection.minutes
          )} Uhr; Sonne: Azimut ${position.azimuthDegrees.toFixed(
            0
          )} Grad, Höhe ${position.elevationDegrees.toFixed(1)} Grad`}
          onKeyDown={handleKeyDown}
          onPointerDown={(event) => {
            event.stopPropagation();
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            updateFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (!dragging.current) return;
            event.stopPropagation();
            updateFromPointer(event);
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
            dragging.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={PLOT_LEFT}
                y={PLOT_TOP}
                width={PLOT_WIDTH}
                height={PLOT_HEIGHT}
              />
            </clipPath>
          </defs>

          <rect
            x={PLOT_LEFT}
            y={PLOT_TOP}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            fill="#f1f5f9"
            stroke="rgba(15,23,42,0.10)"
          />

          {[0, 6, 12, 18, 24].map((hour) => {
            const y = toY(hour * 60);
            return (
              <g key={hour}>
                <line
                  x1={PLOT_LEFT}
                  x2={PLOT_LEFT + PLOT_WIDTH}
                  y1={y}
                  y2={y}
                  stroke="rgba(15,23,42,0.12)"
                />
                <text
                  x={PLOT_LEFT - 5}
                  y={y + 3}
                  textAnchor="end"
                  fill="rgba(15,23,42,0.58)"
                  fontSize="9"
                >
                  {String(hour).padStart(2, "0")}
                </text>
              </g>
            );
          })}

          {monthTicks.map(({ dayOfYear, label }) => {
            const x = toX(dayOfYear);
            return (
              <g key={dayOfYear}>
                <line
                  x1={x}
                  x2={x}
                  y1={PLOT_TOP}
                  y2={PLOT_TOP + PLOT_HEIGHT}
                  stroke="rgba(15,23,42,0.09)"
                />
                <text
                  x={x + 2}
                  y={SVG_HEIGHT - 4}
                  fill="rgba(15,23,42,0.58)"
                  fontSize="8"
                >
                  {label}
                </text>
              </g>
            );
          })}

          <g clipPath={`url(#${clipId})`}>
            <path d={daylightAreaPath} fill="rgba(251,191,36,0.20)" />
            <path
              d={sunrisePath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.6"
            />
            <path
              d={sunsetPath}
              fill="none"
              stroke="#fb923c"
              strokeWidth="1.6"
            />
            <line
              x1={activeX}
              x2={activeX}
              y1={toY(activeDaylight.sunsetMinutes)}
              y2={toY(activeDaylight.sunriseMinutes)}
              stroke="rgba(180,83,9,0.55)"
              strokeDasharray="2 3"
            />
            <circle
              cx={activeX}
              cy={activeY}
              r="5"
              fill="#fbbf24"
              stroke="#ffffff"
              strokeWidth="2"
            />
          </g>
        </svg>
      </div>
    </div>
  );
};
