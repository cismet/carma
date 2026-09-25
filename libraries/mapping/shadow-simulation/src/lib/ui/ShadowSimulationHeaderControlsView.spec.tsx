import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialShadowSimulationState } from "../core/create-shadow-simulation-state";
import { getDaylightWindow } from "../core/solar-position";
import { formatClockMinutes } from "./format-shadow-selection";
import { ShadowAnimationSpeedControl } from "./ShadowAnimationSpeedControl";
import { ShadowSimulationHeaderControlsView } from "./ShadowSimulationHeaderControlsView";

vi.mock("../runtime/hooks/use-map-center-solar-location", () => ({
  useMapCenterSolarLocation: () => ({ latitude: 51.25, longitude: 7.12 }),
}));
afterEach(cleanup);

describe("shared shadow time controls", () => {
  it("shows full dates, day length, exclusive plays and both sliders in the unified controls", () => {
    const setState = vi.fn();
    const setDateState = vi.fn();
    const onTimeInteractionChange = vi.fn();
    const state = {
      ...createInitialShadowSimulationState(undefined),
      animationDaylightOnly: false,
      isAnimating: true,
      animationMode: "day" as const,
    };
    const props = {
      libreMap: null,
      state,
      setState,
      setDateState,
      onTimeInteractionChange,
      dateState: {
        year: 2026,
        dayOfYear: 267,
        minutes: 865,
        timeZone: "Europe/Berlin",
      },
      showYearSlider: true,
    };
    const view = render(<ShadowSimulationHeaderControlsView {...props} />);
    expect(
      view.getByRole("button", { name: "Datum auswählen" }).textContent
    ).toBe("24. September 2026");
    expect(view.getByRole("button", { name: "Datum auswählen" }).title).toBe(
      "24. September 2026"
    );
    expect(view.getAllByRole("slider")).toHaveLength(2);
    expect(view.getByText("MESZ").title).toBe("Europe/Berlin");
    const time = view.getByRole("slider", { name: "Uhrzeit" });
    expect(time.getAttribute("min")).toBe("0");
    expect(time.getAttribute("max")).toBe("1440");
    const daylight = getDaylightWindow(props.dateState, {
      latitude: 51.25,
      longitude: 7.12,
    });
    const daylightMinutes = Math.round(
      daylight.sunsetMinutes - daylight.sunriseMinutes
    );
    expect(
      view.getByText(
        `Tageslänge ${Math.floor(daylightMinutes / 60)} h ${String(
          daylightMinutes % 60
        ).padStart(2, "0")} min`
      )
    ).toBeDefined();
    fireEvent.change(time, { target: { value: "0" } });
    expect(setDateState).toHaveBeenLastCalledWith({
      ...props.dateState,
      minutes: Math.ceil(daylight.sunriseMinutes),
    });
    fireEvent.change(time, { target: { value: "1440" } });
    expect(setDateState).toHaveBeenLastCalledWith({
      ...props.dateState,
      minutes: Math.floor(daylight.sunsetMinutes),
    });
    expect(
      view.getByTitle(
        `Sonnenaufgang ${formatClockMinutes(
          Math.ceil(daylight.sunriseMinutes)
        )}`
      )
    ).toBeDefined();
    expect(
      view.container.querySelectorAll(
        ".shadow-simulation-header-year-range .shadow-simulation-slider-ticks > span"
      )
    ).toHaveLength(12);
    expect(
      view.container.querySelectorAll(
        ".shadow-simulation-header-range .shadow-simulation-slider-ticks > span"
      )
    ).toHaveLength(25);
    expect(
      [
        ...view.container.querySelectorAll(
          ".shadow-simulation-header-year-range .shadow-simulation-slider-ticks > span"
        ),
      ]
        .map((tick) => tick.textContent)
        .filter(Boolean)
    ).toEqual(["Jan", "Apr", "Jul", "Okt"]);
    expect(
      [
        ...view.container.querySelectorAll(
          ".shadow-simulation-header-range .shadow-simulation-slider-ticks > span"
        ),
      ]
        .map((tick) => tick.textContent)
        .filter(Boolean)
    ).toEqual(["00", "06", "12", "18", "24"]);
    const noon = view.getByTitle(
      `Sonnenhöchststand ${formatClockMinutes(daylight.solarNoonMinutes)}`
    );
    expect(noon.querySelector("svg")).not.toBeNull();
    expect(noon.textContent).toBe(
      formatClockMinutes(daylight.solarNoonMinutes)
    );
    expect(noon.style.left).toBe(
      `${(daylight.solarNoonMinutes / 1440) * 100}%`
    );
    expect(
      view.container.querySelectorAll(
        ".shadow-simulation-sun-markers > span svg"
      )
    ).toHaveLength(3);
    expect(
      view.container.querySelectorAll(".shadow-simulation-sun-time")
    ).toHaveLength(3);
    view.rerender(
      <ShadowSimulationHeaderControlsView
        {...props}
        state={{ ...state, animationDaylightOnly: true }}
      />
    );
    expect(time.getAttribute("min")).toBe("0");
    expect(time.getAttribute("max")).toBe("1440");
    view.rerender(<ShadowSimulationHeaderControlsView {...props} />);
    const year = view.getByRole("slider", { name: "Tag des Jahres" });
    fireEvent.keyDown(year, { key: "ArrowRight" });
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(true);
    fireEvent.change(year, { target: { value: "268" } });
    expect(setDateState).toHaveBeenLastCalledWith({
      ...props.dateState,
      dayOfYear: 268,
    });
    fireEvent.keyUp(year, { key: "ArrowRight" });
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(view.getByRole("button", { name: "Jahreslauf starten" }));
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      enabled: true,
      animationMode: "year",
      isAnimating: true,
    });
    view.rerender(
      <ShadowSimulationHeaderControlsView
        {...props}
        state={{ ...state, animationMode: "year" }}
        compact
      />
    );
    expect(view.queryAllByRole("slider")).toHaveLength(0);
    expect(view.queryByText("MESZ")).toBeNull();
    expect(
      view.getByRole("button", { name: "Datum auswählen" }).textContent
    ).toBe("24. September");
    expect(view.getByRole("button", { name: "Datum auswählen" }).title).toBe(
      "24. September 2026"
    );
    fireEvent.click(view.getByRole("button", { name: "Tageslauf starten" }));
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      enabled: true,
      animationMode: "day",
      isAnimating: true,
    });
    fireEvent.click(view.getByRole("button", { name: "Jahreslauf pausieren" }));
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      enabled: true,
      animationMode: "year",
      isAnimating: false,
    });
    view.rerender(
      <ShadowSimulationHeaderControlsView
        {...props}
        dateState={{ ...props.dateState, minutes: 1439.99 }}
      />
    );
    expect(
      (view.getByLabelText("Uhrzeit auswählen") as HTMLInputElement).value
    ).toBe("23:59");
  });

  it.each([
    [1, 720, "MEZ"],
    [88, 90, "MEZ"],
    [88, 210, "MESZ"],
    [172, 720, "MESZ"],
    [298, 90, "MESZ"],
    [298, 210, "MEZ"],
  ])(
    "shows the clock timezone for day %s at minute %s",
    (dayOfYear, minutes, zone) => {
      const view = render(
        <ShadowSimulationHeaderControlsView
          libreMap={null}
          state={createInitialShadowSimulationState(undefined)}
          setState={vi.fn()}
          dateState={{
            year: 2026,
            dayOfYear,
            minutes,
            timeZone: "Europe/Berlin",
          }}
          setDateState={vi.fn()}
          showYearSlider
        />
      );
      expect(view.getByText(zone).title).toBe("Europe/Berlin");
    }
  );

  it("shades nights across the year without restricting date or clock selection", () => {
    const setDateState = vi.fn();
    const props = {
      libreMap: null,
      state: createInitialShadowSimulationState(undefined),
      setState: vi.fn(),
      setDateState,
      dateState: {
        year: 2026,
        dayOfYear: 172,
        minutes: 7 * 60,
        timeZone: "Europe/Berlin",
      },
      showYearSlider: true,
    };
    const view = render(<ShadowSimulationHeaderControlsView {...props} />);
    const year = view.getByRole("slider", { name: "Tag des Jahres" });
    const rail = year.parentElement!;
    expect(rail.style.getPropertyValue("--shadow-range-background")).toContain(
      "#64748b"
    );
    expect(rail.style.getPropertyValue("--shadow-range-background")).toContain(
      "#d97706"
    );
    expect(rail.style.getPropertyValue("--shadow-range-background")).toContain(
      "#a8a29e"
    );
    const timeRail = view.getByRole("slider", { name: "Uhrzeit" })
      .parentElement!;
    for (const color of [
      "#d97706",
      "#a8a29e",
      "#64748b",
      "#334155",
      "#0f172a",
    ]) {
      expect(
        timeRail.style.getPropertyValue("--shadow-range-background")
      ).toContain(color);
    }
    fireEvent.change(year, { target: { value: "1" } });
    expect(setDateState).toHaveBeenLastCalledWith({
      ...props.dateState,
      dayOfYear: 1,
    });
    fireEvent.change(view.getByLabelText("Uhrzeit auswählen"), {
      target: { value: "00:00" },
    });
    expect(setDateState).toHaveBeenLastCalledWith({
      ...props.dateState,
      minutes: 0,
    });
    view.rerender(
      <ShadowSimulationHeaderControlsView
        {...props}
        dateState={{ ...props.dateState, minutes: 0 }}
      />
    );
    expect(
      rail.style.getPropertyValue("--shadow-range-background")
    ).not.toContain("#d97706");
    expect((year as HTMLInputElement).disabled).toBe(false);
    view.rerender(
      <ShadowSimulationHeaderControlsView
        {...props}
        dateState={{ ...props.dateState, year: 2024, minutes: 720 }}
      />
    );
    expect(year.getAttribute("max")).toBe("366");
    expect(
      rail.style.getPropertyValue("--shadow-range-background")
    ).not.toContain("#64748b");
  });

  it("reports pointer, keyboard and cancelled time interactions", () => {
    const onTimeInteractionChange = vi.fn();
    const view = render(
      <ShadowSimulationHeaderControlsView
        libreMap={null}
        state={createInitialShadowSimulationState(undefined)}
        setState={vi.fn()}
        dateState={{
          year: 2026,
          dayOfYear: 267,
          minutes: 865,
          timeZone: "Europe/Berlin",
        }}
        setDateState={vi.fn()}
        onTimeInteractionChange={onTimeInteractionChange}
      />
    );
    const slider = view.getByRole("slider", { name: "Uhrzeit" });
    slider.setPointerCapture = vi.fn();
    fireEvent.pointerDown(slider, { pointerId: 1 });
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(true);
    fireEvent.pointerCancel(slider);
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyUp(slider, { key: "ArrowRight" });
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(false);
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.lostPointerCapture(slider);
    expect(onTimeInteractionChange).toHaveBeenLastCalledWith(false);
  });

  it("offers the same 1x, 4x and 12x speed selector to both addons", () => {
    const onChange = vi.fn();
    const view = render(
      <ShadowAnimationSpeedControl value={4} onChange={onChange} />
    );
    expect(
      view.getAllByRole("button").map((button) => button.textContent)
    ).toEqual(["1×", "4×", "12×"]);
    expect(
      view.getByRole("button", { name: "4×" }).getAttribute("aria-pressed")
    ).toBe("true");
    fireEvent.click(view.getByRole("button", { name: "12×" }));
    expect(onChange).toHaveBeenCalledWith(12);
  });
});
