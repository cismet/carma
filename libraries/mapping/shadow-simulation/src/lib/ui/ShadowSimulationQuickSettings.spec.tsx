import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN,
} from "@carma-commons/resources";

import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
  selectShadowQualityPreset,
} from "../core/create-shadow-simulation-state";
import { DEFAULT_SHADOW_SIMULATION_LOCATION } from "../core/solar-position";
import { ShadowSimulationQuickSettings } from "./ShadowSimulationQuickSettings";

afterEach(cleanup);

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
      const html = renderToStaticMarkup(
        <ShadowSimulationQuickSettings
          location={DEFAULT_SHADOW_SIMULATION_LOCATION}
          state={{
            ...createInitialShadowSimulationState({ terrainSources }),
            terrainSourceId: storedId,
          }}
          setState={vi.fn()}
          dateState={{
            year: 2026,
            dayOfYear: 345,
            minutes: 660,
            timeZone: "Europe/Berlin",
          }}
          setDateState={vi.fn()}
          terrainSources={terrainSources}
        />
      );
      const document = new DOMParser().parseFromString(html, "text/html");
      expect(document.querySelector("select")?.value).toBe(selectedId);
      expect(html).toContain("Höhenmodell für die Verschattung");
      expect(html).not.toMatch(/z\+[1-4]|Terrainqualität|Mapbox/);
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
      const location = DEFAULT_SHADOW_SIMULATION_LOCATION;
      const setState = vi.fn();
      const setDateState = vi.fn();
      const { getByRole } = render(
        <ShadowSimulationQuickSettings
          state={state}
          setState={setState}
          dateState={createInitialShadowDateState(undefined, location)}
          setDateState={setDateState}
          location={location}
        />
      );
      fireEvent.click(getByRole("button", { name: label, exact: true }));
      expect(setState).toHaveBeenCalledWith(
        selectShadowQualityPreset(state, quality)
      );
      expect(setDateState).not.toHaveBeenCalled();
    }
  );
});
