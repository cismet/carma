import type { ReactNode } from "react";

import { StyleProvider } from "@ant-design/cssinjs";
import {
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialShadowSimulationState } from "../core/create-shadow-simulation-state";
import {
  SHADOW_BUFFER_FORMAT,
  SHADOW_BUFFER_LAYOUT,
} from "../core/shadow-types";
import { ShadowSimulationRenderSettings } from "./ShadowSimulationRenderSettings";

afterEach(cleanup);

// jsdom's selector engine cannot parse AntD's nested :has/:not stylesheet rules.
const render = (ui: ReactNode) =>
  renderComponent(ui, {
    wrapper: ({ children }) => (
      <StyleProvider mock="server">{children}</StyleProvider>
    ),
  });

const selectOption = async (control: HTMLElement, option: string) => {
  const details = control.closest("details");
  if (details) details.open = true;
  fireEvent.mouseDown(control);
  fireEvent.click(
    await screen.findByRole("option", { name: option, exact: true })
  );
};

const selectedText = (control: HTMLElement) =>
  control.closest(".ant-select")?.querySelector(".ant-select-selection-item")
    ?.textContent;

describe("advanced shadow render settings", () => {
  it("leaves atmosphere switches to their display group", () => {
    const state = createInitialShadowSimulationState(undefined);
    const setState = vi.fn();
    const { queryByRole } = render(
      <ShadowSimulationRenderSettings state={state} setState={setState} />
    );
    expect(queryByRole("checkbox", { name: "Transmittanz-LUT" })).toBeNull();
    expect(queryByRole("checkbox", { name: "Sky-Irradianz-LUT" })).toBeNull();
  });
  it("shows the buffer selector while advanced quality settings stay collapsed", () => {
    const state = createInitialShadowSimulationState(undefined);
    const { getByLabelText } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    const layout = getByLabelText("Schattenpuffer", { selector: "input" });
    expect(selectedText(layout)).toBe("Einzelpuffer");
    const details = getByLabelText("Farbpuffer der Schattenakkumulation", {
      selector: "input",
    }).closest("details");
    expect(layout.closest("details")).toBeNull();
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(
      getByLabelText("Samples der Sonnenscheibe", {
        selector: "input",
      }).closest("details")
    ).toBe(details);
  });

  it("switches buffer layout independently from the quality preset and samples", async () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
      shadowSunDiscSamples: 256 as const,
    };
    const setState = vi.fn();
    const { getByLabelText, getByRole, queryByRole, rerender } = render(
      <ShadowSimulationRenderSettings state={state} setState={setState} />
    );
    const layout = getByLabelText("Schattenpuffer", {
      selector: "input",
    }) as HTMLInputElement;
    expect(selectedText(layout)).toBe("Einzelpuffer");
    expect(queryByRole("status")).toBeNull();
    await selectOption(layout, "Gekachelt (experimentell)");
    const tiledState = {
      ...state,
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    };
    expect(setState).toHaveBeenLastCalledWith(tiledState);
    rerender(
      <ShadowSimulationRenderSettings state={tiledState} setState={setState} />
    );
    expect(selectedText(layout)).toBe("Gekachelt (experimentell)");
    expect(queryByRole("status")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Info zum Schattenpuffer" }));
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "begrenzter Cache"
    );
    await selectOption(layout, "Einzelpuffer");
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
  });

  it.each([false, true])(
    "disables ground fitting for tiled buffers while preserving the mono preference %s",
    (shadowGroundTexelFit) => {
      const state = {
        ...createInitialShadowSimulationState(undefined),
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
        shadowGroundTexelFit,
      };
      const setState = vi.fn();
      const { getByLabelText, getByRole, rerender } = render(
        <ShadowSimulationRenderSettings state={state} setState={setState} />
      );
      const fitting = getByLabelText(
        "Schattenauflösung an der Bodenfläche ausrichten",
        { selector: "input" }
      ) as HTMLInputElement;
      expect(fitting.disabled).toBe(true);
      expect(fitting.checked).toBe(true);
      fitting.click();
      expect(setState).not.toHaveBeenCalled();
      const monoState = {
        ...state,
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
      };
      rerender(
        <ShadowSimulationRenderSettings state={monoState} setState={setState} />
      );
      expect(fitting.disabled).toBe(false);
      expect(fitting.checked).toBe(shadowGroundTexelFit);
      fireEvent.click(fitting);
      expect(setState).toHaveBeenCalledWith({
        ...monoState,
        shadowGroundTexelFit: !shadowGroundTexelFit,
      });
    }
  );

  it("offers only scene-color formats and shows the SDR warning", async () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    };
    const setState = vi.fn();
    const { getByLabelText, queryByRole, rerender } = render(
      <ShadowSimulationRenderSettings state={state} setState={setState} />
    );
    const formats = getByLabelText("Farbpuffer der Schattenakkumulation", {
      selector: "input",
    }) as HTMLInputElement;
    expect(selectedText(formats)).toBe("HDR · 16/32 Bit (Standard)");
    expect(queryByRole("status")).toBeNull();
    await selectOption(formats, "SDR · 8 Bit (Experiment)");
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
    expect(queryByRole("status")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Info zur erweiterten Schattenqualität",
      })
    );
    expect((await screen.findByRole("tooltip")).textContent).toContain(
      "8 Bit können Stufen erzeugen"
    );
  });

  it.each([256, 4096] as const)(
    "changes to %i samples without changing terrain or other display state",
    async (samples) => {
      const state = {
        ...createInitialShadowSimulationState(undefined),
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
      };
      const setState = vi.fn();
      const { getByLabelText, rerender } = render(
        <ShadowSimulationRenderSettings state={state} setState={setState} />
      );
      await selectOption(
        getByLabelText("Samples der Sonnenscheibe", { selector: "input" }),
        String(samples)
      );
      expect(setState).toHaveBeenLastCalledWith({
        ...state,
        shadowSunDiscSamples: samples,
      });
      rerender(
        <ShadowSimulationRenderSettings
          state={{ ...state, shadowSunDiscSamples: samples }}
          setState={setState}
        />
      );
      await selectOption(
        getByLabelText("Samples der Sonnenscheibe", { selector: "input" }),
        "Automatisch nach Schattenqualität"
      );
      expect(setState).toHaveBeenLastCalledWith({
        ...state,
        shadowSunDiscSamples: undefined,
      });
    }
  );

  it("keeps layout and ground fitting available for point sun", () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
      softSunShadows: false,
    };
    const { getByLabelText } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    expect(
      (
        getByLabelText("Schattenpuffer", {
          selector: "input",
        }) as HTMLInputElement
      ).disabled
    ).toBe(false);
    expect(
      (
        getByLabelText("Samples der Sonnenscheibe", {
          selector: "input",
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);
    expect(
      (
        getByLabelText("Farbpuffer der Schattenakkumulation", {
          selector: "input",
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);
    expect(
      (
        getByLabelText("Schattenauflösung an der Bodenfläche ausrichten", {
          selector: "input",
        }) as HTMLInputElement
      ).disabled
    ).toBe(false);
  });

  it("shows the effective native-pixel corridor mode without advertising MSAA", () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
      shadowMsaaSamples: 4 as const,
    };
    const { getByLabelText, getByRole } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    const msaa = getByLabelText(
      "Geometrie-Kantenglättung im Schattenfarbpuffer",
      { selector: "input" }
    ) as HTMLInputElement;
    expect(msaa.disabled).toBe(true);
    expect(selectedText(msaa)).toBe("0×");
    expect(
      getByRole("button", { name: "Info zum Schattenpuffer" })
    ).toBeTruthy();
  });

  it("does not advertise MSAA for Float32", () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_32,
    };
    const { getByLabelText } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    const msaa = getByLabelText(
      "Geometrie-Kantenglättung im Schattenfarbpuffer",
      { selector: "input" }
    ) as HTMLInputElement;
    expect(msaa.disabled).toBe(true);
    expect(selectedText(msaa)).toBe("0×");
  });

  it("offers hybrid HDR without disabling scene MSAA", () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_16_32,
    };
    const { getByLabelText } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    const msaa = getByLabelText(
      "Geometrie-Kantenglättung im Schattenfarbpuffer",
      { selector: "input" }
    ) as HTMLInputElement;
    expect(msaa.disabled).toBe(false);
    expect(selectedText(msaa)).toBe("Automatisch nach Qualitätsziel");
    expect(
      selectedText(
        getByLabelText("Farbpuffer der Schattenakkumulation", {
          selector: "input",
        })
      )
    ).toBe("HDR · 16/32 Bit (Standard)");
  });

  it("explains format limits on demand without expanding the panel", async () => {
    const state = {
      ...createInitialShadowSimulationState(undefined),
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_16,
      shadowSunDiscSamples: 512 as const,
    };
    const { getByRole } = render(
      <ShadowSimulationRenderSettings state={state} setState={vi.fn()} />
    );
    const info = getByRole("button", {
      name: "Info zur erweiterten Schattenqualität",
    });
    const details = info.closest("details")!;
    details.open = true;
    fireEvent.click(info);
    expect(details.open).toBe(true);
    const warning = (await screen.findByRole("tooltip")).textContent;
    expect(warning).toContain("bei jedem Sample erneut");
    expect(warning).not.toContain("begrenzt HDR");
  });
});
