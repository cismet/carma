import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as solar from "../core/solar-position";
import { SolarDayTimeControl } from "./SolarDayTimeControl";
import { buildSolarDayTimeControlModel } from "./solar-day-time-control-model";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("solar curve presentation model", () => {
  const daylight = Array.from({ length: 365 }, () => ({
    sunriseMinutes: 360,
    sunsetMinutes: 1080,
    solarNoonMinutes: 720,
    polarDay: false,
    polarNight: false,
  }));

  it("reuses annual astronomy and paths when only the selected minute changes", () => {
    const annual = vi
      .spyOn(solar, "getYearDaylightWindows")
      .mockReturnValue(daylight);
    const props = {
      location: { latitude: 51.27, longitude: 7.2 },
      selection: {
        year: 2026,
        dayOfYear: 172,
        minutes: 720,
        timeZone: "Europe/Berlin",
      },
      position: {
        azimuthDegrees: 180,
        elevationDegrees: 45,
      } as solar.SolarPosition,
      onChange: vi.fn(),
    };
    const view = render(<SolarDayTimeControl {...props} />);
    const paths = Array.from(view.container.querySelectorAll("path"), (p) =>
      p.getAttribute("d")
    );
    view.rerender(
      <SolarDayTimeControl
        {...props}
        location={{ ...props.location }}
        selection={{ ...props.selection, minutes: 800 }}
      />
    );
    expect(annual).toHaveBeenCalledTimes(1);
    expect(
      Array.from(view.container.querySelectorAll("path"), (p) =>
        p.getAttribute("d")
      )
    ).toEqual(paths);
    view.rerender(
      <SolarDayTimeControl
        {...props}
        selection={{ ...props.selection, timeZone: "UTC" }}
      />
    );
    expect(annual).toHaveBeenCalledTimes(2);
  });

  it("round-trips plot coordinates and retains both curve edges without mutating inputs", () => {
    const model = buildSolarDayTimeControlModel(2026, Object.freeze(daylight));
    expect(model.selectionAtPoint(model.toX(172), model.toY(720))).toEqual({
      dayOfYear: 172,
      minutes: 720,
    });
    expect(model.daylightAreaPath.startsWith(model.sunrisePath)).toBe(true);
    expect(model.daylightAreaPath.endsWith("Z")).toBe(true);
    expect(model.sunsetPath.split(" ")).toHaveLength(365);
    expect(model.monthTicks).toHaveLength(12);
  });
});
