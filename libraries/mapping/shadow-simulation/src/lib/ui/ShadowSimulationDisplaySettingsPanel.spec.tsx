import type { ReactNode } from "react";

import { StyleProvider } from "@ant-design/cssinjs";
import {
  cleanup,
  fireEvent,
  render as renderComponent,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN,
} from "@carma-commons/resources";

import {
  createInitialShadowSimulationState,
  selectShadowQualityPreset,
} from "../core/create-shadow-simulation-state";
import { SHADOW_BUFFER_LAYOUT, SHADOW_QUALITY } from "../core/shadow-types";
import { ShadowSimulationDisplaySettingsPanel } from "./ShadowSimulationDisplaySettingsPanel";

const meshPresence = vi.hoisted(() => ({ active: false }));
vi.mock("./use-shadow-mesh-presence", () => ({
  useShadowMeshPresence: () => meshPresence.active,
}));
afterEach(() => {
  cleanup();
  meshPresence.active = false;
});

// jsdom's selector engine cannot parse AntD's nested :has/:not stylesheet rules.
const render = (ui: ReactNode) =>
  renderComponent(ui, {
    wrapper: ({ children }) => (
      <StyleProvider mock="server">{children}</StyleProvider>
    ),
  });

const terrainSources = [
  { label: "Gelände (DGM)", terrain: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN },
  {
    label: "Oberfläche (DOM/DSM)",
    terrain: NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN,
  },
];

describe("shadow terrain settings", () => {
  it("keeps map style controls in an independent full-width section", () => {
    const state = createInitialShadowSimulationState(undefined);
    const setState = vi.fn();
    const { getByText, getByRole, queryByRole } = render(
      <ShadowSimulationDisplaySettingsPanel state={state} setState={setState} />
    );
    expect(
      queryByRole("checkbox", { name: "Basiskarte auf dem Terrain anzeigen" })
    ).toBeNull();
    fireEvent.click(getByText("Kartenstil", { exact: true }));
    fireEvent.click(
      getByRole("checkbox", { name: "Basiskarte auf dem Terrain anzeigen" })
    );
    expect(setState).toHaveBeenCalledWith({
      ...state,
      showMapStyleContent: false,
    });
    expect(document.querySelector(".ant-collapse-borderless")).not.toBeNull();
  });

  it("closes and disables the inapplicable surface group on mesh changes", () => {
    const state = createInitialShadowSimulationState({ terrainSources });
    const panel = () => (
      <ShadowSimulationDisplaySettingsPanel
        state={state}
        setState={vi.fn()}
        terrainSources={terrainSources}
      />
    );
    const { getByText, queryByLabelText, queryByRole, rerender } = render(
      panel()
    );
    expect(
      getByText("Mesh (kein Mesh aktiv)")
        .closest('[role="button"]')
        ?.getAttribute("aria-disabled")
    ).toBe("true");
    fireEvent.click(getByText("Terrain", { exact: true }));
    expect(
      queryByLabelText("Höhenmodell für die Verschattung", {
        selector: "input",
      })
    ).not.toBeNull();
    meshPresence.active = true;
    rerender(panel());
    expect(
      queryByLabelText("Höhenmodell für die Verschattung", {
        selector: "input",
      })
    ).toBeNull();
    expect(
      getByText("Terrain (durch Mesh ersetzt)")
        .closest('[role="button"]')
        ?.getAttribute("aria-disabled")
    ).toBe("true");
    fireEvent.click(getByText("Mesh", { exact: true }));
    expect(queryByRole("radio", { name: "2 px" })).not.toBeNull();
    meshPresence.active = false;
    rerender(panel());
    expect(queryByRole("radio", { name: "2 px" })).toBeNull();
  });

  it("keeps atmosphere options separate from shadow quality", () => {
    const state = createInitialShadowSimulationState(undefined);
    const setState = vi.fn();
    const { getByText, getByRole, queryByRole } = render(
      <ShadowSimulationDisplaySettingsPanel state={state} setState={setState} />
    );
    expect(queryByRole("checkbox", { name: "Transmittanz-LUT" })).toBeNull();
    fireEvent.click(getByText("Atmosphäre", { exact: true }));
    fireEvent.click(getByRole("checkbox", { name: "Transmittanz-LUT" }));
    expect(setState).toHaveBeenCalledWith({
      ...state,
      useTransmittanceLut: false,
    });
    fireEvent.click(getByRole("checkbox", { name: "Sky-Irradianz-LUT" }));
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      useSkyIrradianceLut: false,
    });
  });

  it.each([
    ["nrw-dgm1", NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.id],
    [
      NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN.id,
      NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN.id,
    ],
  ])(
    "resolves stored source %s without exposing zoom offsets",
    (storedId, selectedId) => {
      const { getByLabelText, getByText, container } = render(
        <ShadowSimulationDisplaySettingsPanel
          state={{
            ...createInitialShadowSimulationState({ terrainSources }),
            terrainSourceId: storedId,
          }}
          setState={vi.fn()}
          terrainSources={terrainSources}
        />
      );
      const selectedLabel = terrainSources.find(
        ({ terrain }) => terrain.id === selectedId
      )?.label;
      fireEvent.click(getByText("Terrain", { exact: true }));
      expect(
        getByLabelText("Höhenmodell für die Verschattung", {
          selector: "input",
        }).closest(".ant-select")?.textContent
      ).toContain(selectedLabel);
      expect(document.body.textContent).not.toMatch(
        /z\+[1-4]|Terrainqualität|Mapbox/
      );
      expect(container.textContent).toBe("");
    }
  );
});

describe("whole-scene shadow quality presets", () => {
  it.each([
    ["120 FPS", 4],
    ["60 FPS", 16],
    ["30 FPS", 64],
    ["Ultra", 256],
  ] as const)(
    "selects %s without changing map content or date",
    (label, quality) => {
      const state = {
        ...createInitialShadowSimulationState(undefined),
        shadowSunDiscSamples: 32 as const,
        shadowMsaaSamples: 8 as const,
      };
      const setState = vi.fn();
      const { getByRole } = render(
        <ShadowSimulationDisplaySettingsPanel
          state={state}
          setState={setState}
        />
      );
      fireEvent.mouseDown(getByRole("combobox", { name: "Qualitätsziel" }));
      fireEvent.click(getByRole("option", { name: label, exact: true }));
      expect(setState).toHaveBeenCalledWith(
        selectShadowQualityPreset(state, quality)
      );
    }
  );
});

describe("adaptive shadow quality", () => {
  it.each([undefined, true, false])(
    "toggles the stored preference %s without changing other settings",
    (shadowAdaptiveQuality) => {
      const state = {
        ...createInitialShadowSimulationState(undefined),
        shadowAdaptiveQuality,
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
      };
      const setState = vi.fn();
      const { getByRole } = render(
        <ShadowSimulationDisplaySettingsPanel
          state={state}
          setState={setState}
        />
      );
      const checkbox = getByRole("checkbox", {
        name: "Adaptive Schattenqualität",
      }) as HTMLInputElement;
      expect(checkbox.checked).toBe(shadowAdaptiveQuality ?? true);
      expect(checkbox.disabled).toBe(false);

      fireEvent.click(checkbox);

      expect(setState).toHaveBeenCalledWith({
        ...state,
        shadowAdaptiveQuality: !(shadowAdaptiveQuality ?? true),
      });
    }
  );

  it.each([undefined, true, false])(
    "disables adaptation for Ultra with stored preference %s",
    (shadowAdaptiveQuality) => {
      const setState = vi.fn();
      const { getByRole } = render(
        <ShadowSimulationDisplaySettingsPanel
          state={{
            ...createInitialShadowSimulationState(undefined),
            shadowQuality: SHADOW_QUALITY.ULTRA,
            shadowAdaptiveQuality,
          }}
          setState={setState}
        />
      );
      const checkbox = getByRole("checkbox", {
        name: "Adaptive Schattenqualität",
      }) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
      expect(checkbox.disabled).toBe(true);

      fireEvent.click(checkbox);

      expect(setState).not.toHaveBeenCalled();
    }
  );

  it("keeps explanations behind keyboard-accessible info buttons", async () => {
    const { getByRole, findByRole, queryByText } = render(
      <ShadowSimulationDisplaySettingsPanel
        state={createInitialShadowSimulationState(undefined)}
        setState={vi.fn()}
      />
    );

    expect(queryByText(/keine FPS-Garantie/)).toBeNull();
    fireEvent.focus(getByRole("button", { name: "Info zum Qualitätsziel" }));
    expect((await findByRole("tooltip")).textContent).toContain(
      "nativen Displaypixeln"
    );
    expect(
      (
        getByRole("checkbox", {
          name: "Adaptive Schattenqualität",
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);
  });
});

describe("elevation map details", () => {
  it("defaults both options off and changes them independently", () => {
    const state = createInitialShadowSimulationState(undefined);
    const setState = vi.fn();
    const { getByLabelText, getByText } = render(
      <ShadowSimulationDisplaySettingsPanel state={state} setState={setState} />
    );
    fireEvent.click(getByText("Kartenstil", { exact: true }));
    const lines = getByLabelText("Höhenlinien") as HTMLInputElement;
    const labels = getByLabelText("Höhenbeschriftungen") as HTMLInputElement;
    expect(lines.checked).toBe(false);
    expect(labels.checked).toBe(false);
    fireEvent.click(lines);
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      showMapStyleElevationLines: true,
    });
    fireEvent.click(labels);
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      showMapStyleElevationLabels: true,
    });
  });
});
