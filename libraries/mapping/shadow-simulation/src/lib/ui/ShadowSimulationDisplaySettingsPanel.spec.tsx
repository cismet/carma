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
import { SHADOW_QUALITY } from "../core/shadow-types";
import { ShadowSimulationDisplaySettingsPanel } from "./ShadowSimulationDisplaySettingsPanel";

afterEach(cleanup);

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
  it.each([
    ["nrw-dgm1", NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.id],
    [
      NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN.id,
      NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN.id,
    ],
  ])(
    "resolves stored source %s without exposing zoom offsets",
    (storedId, selectedId) => {
      const { getByLabelText, container } = render(
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

  it("explains that map and label rendering stays at native display resolution", () => {
    const { getByText } = render(
      <ShadowSimulationDisplaySettingsPanel
        state={createInitialShadowSimulationState(undefined)}
        setState={vi.fn()}
      />
    );

    expect(
      getByText(
        /Bei Bewegung werden Update-Takt und Schattenpuffer an das FPS-Ziel angepasst/
      ).textContent
    ).toContain(
      "Basiskarte und Beschriftungen bleiben in nativen Displaypixeln; die Farbauflösung wird nicht reduziert."
    );
  });
});
