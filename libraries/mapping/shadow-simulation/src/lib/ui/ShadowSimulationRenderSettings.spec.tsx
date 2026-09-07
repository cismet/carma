import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialShadowSimulationState } from "../core/create-shadow-simulation-state";
import { SHADOW_BUFFER_FORMAT } from "../core/shadow-types";
import { ShadowSimulationRenderSettings } from "./ShadowSimulationRenderSettings";

afterEach(cleanup);

describe("advanced shadow render settings", () => {
  it("offers only scene-color formats and shows the SDR warning", () => {
    const state = createInitialShadowSimulationState(undefined);
    const setState = vi.fn();
    const { getByLabelText, queryByRole, rerender } = render(
      <ShadowSimulationRenderSettings state={state} setState={setState} />
    );
    const formats = getByLabelText(
      "Farbpuffer der Schattenakkumulation"
    ) as HTMLSelectElement;
    expect([...formats.options].map(({ value }) => value)).toEqual([
      "rgba16f",
      "rgba16f-32f",
      "rgba32f",
      "rgba8",
    ]);
    expect(queryByRole("status")).toBeNull();
    fireEvent.change(formats, {
      target: { value: SHADOW_BUFFER_FORMAT.SDR_8 },
    });
    expect(setState).toHaveBeenCalledWith({
      ...state,
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.SDR_8,
    });
    rerender(
      <ShadowSimulationRenderSettings
        state={{ ...state, shadowBufferFormat: SHADOW_BUFFER_FORMAT.SDR_8 }}
        setState={setState}
      />
    );
    expect(queryByRole("status")?.textContent).toContain("begrenzt HDR");
  });

  it.each([256, 4096])(
    "changes to %i samples without changing terrain or other display state",
    (samples) => {
      const state = createInitialShadowSimulationState(undefined);
      const setState = vi.fn();
      const { getByLabelText } = render(
        <ShadowSimulationRenderSettings state={state} setState={setState} />
      );
      fireEvent.change(getByLabelText("Samples der Sonnenscheibe"), {
        target: { value: String(samples) },
      });
      expect(setState).toHaveBeenLastCalledWith({
        ...state,
        shadowSunDiscSamples: samples,
      });
      fireEvent.change(getByLabelText("Samples der Sonnenscheibe"), {
        target: { value: "" },
      });
      expect(setState).toHaveBeenLastCalledWith({
        ...state,
        shadowSunDiscSamples: undefined,
      });
    }
  );

  it("disables accumulation-only controls for point sun, not ground fitting", () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      softSunShadows: false,
    };
    const { getByLabelText } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    expect(
      (getByLabelText("Samples der Sonnenscheibe") as HTMLSelectElement)
        .disabled
    ).toBe(true);
    expect(
      (
        getByLabelText(
          "Farbpuffer der Schattenakkumulation"
        ) as HTMLSelectElement
      ).disabled
    ).toBe(true);
    expect(
      (
        getByLabelText(
          "Schattenauflösung an der Bodenfläche ausrichten"
        ) as HTMLInputElement
      ).disabled
    ).toBe(false);
  });

  it("does not advertise MSAA for Float32", () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_32,
    };
    const { getByLabelText } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    const msaa = getByLabelText(
      "Geometrie-Kantenglättung im Schattenfarbpuffer"
    ) as HTMLSelectElement;
    expect(msaa.disabled).toBe(true);
    expect(msaa.value).toBe("");
  });

  it("offers hybrid HDR without disabling scene MSAA", () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_16_32,
    };
    const { getByLabelText } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    const msaa = getByLabelText(
      "Geometrie-Kantenglättung im Schattenfarbpuffer"
    ) as HTMLSelectElement;
    expect(msaa.disabled).toBe(false);
    expect(msaa.value).toBe("");
    expect(
      (
        getByLabelText(
          "Farbpuffer der Schattenakkumulation"
        ) as HTMLSelectElement
      ).value
    ).toBe("rgba16f-32f");
  });

  it("warns about repeated FP16 rounding, not HDR clipping", () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_16,
      shadowSunDiscSamples: 512 as const,
    };
    const { getByRole } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    const warning = getByRole("status").textContent;
    expect(warning).toContain("bei jedem Sample erneut");
    expect(warning).toContain("Rundungsfehler summieren");
    expect(warning).not.toContain("begrenzt HDR");
  });
});
