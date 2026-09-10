import { useId, useMemo, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import {
  clampSelectionToDaylight,
  getYearDaylightWindows,
  type SolarLocation,
  type SolarPosition,
  type SolarSelection,
} from "../core/solar-position";
import { formatClockMinutes, formatSolarDay } from "./format-shadow-selection";
import {
  buildSolarDayTimeControlModel,
  SVG_WIDTH,
  SVG_HEIGHT,
  PLOT_LEFT,
  PLOT_TOP,
  PLOT_WIDTH,
  PLOT_HEIGHT,
} from "./solar-day-time-control-model";

export type SolarDayTimeControlProps = {
  expanded?: boolean;
  location: SolarLocation;
  selection: SolarSelection;
  position: SolarPosition;
  onChange: (selection: SolarSelection) => void;
};

export const SolarDayTimeControl = ({
  expanded = false,
  location,
  selection,
  position,
  onChange,
}: SolarDayTimeControlProps) => {
  const dragging = useRef(false);
  const clipId = useId().replaceAll(":", "");
  const { year, timeZone } = selection;
  const { latitude, longitude } = location;
  const model = useMemo(
    () =>
      buildSolarDayTimeControlModel(
        year,
        getYearDaylightWindows({ year, timeZone }, { latitude, longitude })
      ),
    [year, timeZone, latitude, longitude]
  );
  const {
    dayCount,
    monthTicks,
    daylight,
    toX,
    toY,
    sunrisePath,
    sunsetPath,
    daylightAreaPath,
  } = model;

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
    const { dayOfYear, minutes } = model.selectionAtPoint(x, y);
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
          aria-label={`Tag und Tageszeit für die Schattensimulation: ${formatSolarDay(
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
