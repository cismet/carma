import { StyleProvider } from "@ant-design/cssinjs";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialShadowSimulationState } from "../core/create-shadow-simulation-state";
import { ShadowSimulationSurfaceSettings } from "./ShadowSimulationSurfaceSettings";

const runtime = vi.hoisted(() => ({ present: false }));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: () =>
    runtime.present
      ? [{ providesTerrain: true, setErrorTarget: () => {} }]
      : [],
  subscribeSharedThreeSceneContent: () => () => {},
}));
afterEach(() => {
  cleanup();
  runtime.present = false;
});

describe("shadow surface display settings", () => {
  it("keeps terrain colour available without loading the debug view or a mesh", () => {
    const { getByText, queryByText } = render(
      <StyleProvider mock="server">
        <ShadowSimulationSurfaceSettings
          state={createInitialShadowSimulationState(undefined)}
          setState={vi.fn()}
        />
      </StyleProvider>
    );
    expect(getByText("Terrain")).toBeTruthy();
    expect(queryByText("Mesh-LOD")).toBeNull();
    expect(queryByText("Sonnenvektor")).toBeNull();
    expect(queryByText("Tile-Kanten + IDs")).toBeNull();
    expect(queryByText("Qualitätsziel")).toBeNull();
  });

  it("edits the existing mesh state without changing other display options", () => {
    runtime.present = true;
    const state = createInitialShadowSimulationState(undefined);
    const setState = vi.fn();
    const { getByRole, getByText } = render(
      <StyleProvider mock="server">
        <ShadowSimulationSurfaceSettings
          state={state}
          setState={setState}
          map={{} as MaplibreMap}
        />
      </StyleProvider>
    );
    fireEvent.click(getByRole("radio", { name: "4 px" }));
    expect(setState).toHaveBeenLastCalledWith({ ...state, meshErrorTarget: 4 });
    const budget = getByRole("spinbutton", { name: "Mesh-Cache in GiB" });
    expect(budget.getAttribute("aria-valuemax")).toBe("24");
    fireEvent.change(budget, { target: { value: "8" } });
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      meshCacheBudgetBytes: 8 * 1024 ** 3,
    });
    fireEvent.click(getByRole("checkbox", { name: "Gebäude volle Deckkraft" }));
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      buildingsFullOpacity: false,
    });
    expect(
      getByRole("slider", { name: "Mischung aus Meshtextur und Farbe" })
    ).toBeTruthy();
    expect(
      getByRole("slider", { name: "Sättigung der Meshtextur" })
    ).toBeTruthy();
    expect(getByText("0%")).toBeTruthy();
    expect(getByText("100%")).toBeTruthy();
    const correction = getByRole("checkbox", {
      name: "Farbkorrektur (Mesh 2024)",
    }) as HTMLInputElement;
    expect(correction.checked).toBe(true);
    fireEvent.click(correction);
    expect(setState).toHaveBeenLastCalledWith({
      ...state,
      meshTextureColorCorrection: false,
    });
  });
});
