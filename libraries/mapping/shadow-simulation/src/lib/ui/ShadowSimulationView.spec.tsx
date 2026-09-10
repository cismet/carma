import { useState, type ReactNode } from "react";

import { StyleProvider } from "@ant-design/cssinjs";
import {
  act,
  cleanup,
  fireEvent,
  render as renderComponent,
  within,
} from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ControlLayout } from "@carma-mapping/map-controls-layout";

import {
  SHADOW_CONTROL_STYLE,
  type ShadowControlStyle,
  type ShadowDateState,
  type ShadowSimulationState,
} from "../contracts/shadow-simulation";
import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "../core/create-shadow-simulation-state";
import { DEFAULT_SHADOW_SIMULATION_LOCATION } from "../core/solar-position";
import { ShadowSimulationView } from "./ShadowSimulationView";

const debugLifecycle = vi.hoisted(() => ({
  imported: vi.fn(),
  mounted: vi.fn(),
  unmounted: vi.fn(),
}));

vi.mock("../runtime/ShadowSimulationRuntime", () => ({
  ShadowSimulationRuntime: () => null,
}));
vi.mock("./ShadowProjectionDebugView", async () => {
  const { useEffect } = await import("react");
  debugLifecycle.imported();
  return {
    ShadowProjectionDebugView: () => {
      useEffect(() => {
        debugLifecycle.mounted();
        return () => debugLifecycle.unmounted();
      }, []);
      return <div role="region" aria-label="Projektions-Debug geladen" />;
    },
  };
});
vi.mock("./ShadowSimulationCurveSettings", () => ({
  ShadowSimulationCurveSettings: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Kurvenansicht">
      <button onClick={onClose}>Kurvenansicht schließen</button>Kurvenauswahl
    </div>
  ),
}));

afterEach(cleanup);

// jsdom's selector engine cannot parse AntD's nested :has/:not stylesheet rules.
const render = (ui: ReactNode) =>
  renderComponent(ui, {
    wrapper: ({ children }) => (
      <StyleProvider mock="server">{children}</StyleProvider>
    ),
  });

const ShadowPanels = ({
  controlStyle,
}: {
  controlStyle: ShadowControlStyle;
}) => {
  const [state, setState] = useState<ShadowSimulationState | undefined>({
    ...createInitialShadowSimulationState(undefined),
    controlStyle,
  });
  const [dateState, setDateState] = useState<ShadowDateState | undefined>(
    createInitialShadowDateState(undefined, DEFAULT_SHADOW_SIMULATION_LOCATION)
  );
  const [showMainPanel, setShowMainPanel] = useState(true);
  const props = {
    libreMap: null,
    sharedState: state,
    setSharedState: setState,
    sharedDateState: dateState,
    setSharedDateState: setDateState,
  };
  return (
    <>
      <button type="button" onClick={() => setShowMainPanel(!showMainPanel)}>
        Hauptpanel umschalten
      </button>
      {showMainPanel && <ShadowSimulationView {...props} targeted />}
      <ShadowSimulationView {...props} targeted={false} />
    </>
  );
};

describe("shadow display panel integration", () => {
  it("initializes missing addon channels in effects without provider seed state", () => {
    const setSharedState = vi.fn();
    const setSharedDateState = vi.fn();
    const props = {
      config: { year: 2026, initialDayOfYear: 172, initialMinutes: 720 },
      libreMap: null,
      targeted: false,
      sharedState: undefined,
      sharedDateState: undefined,
      setSharedState,
      setSharedDateState,
    };
    const { rerender } = render(<ShadowSimulationView {...props} />);
    expect(setSharedState).toHaveBeenCalledTimes(1);
    expect(setSharedDateState).toHaveBeenCalledWith(
      expect.objectContaining({ year: 2026, dayOfYear: 172, minutes: 720 })
    );
    rerender(
      <ShadowSimulationView
        {...props}
        sharedState={setSharedState.mock.calls[0][0]}
        sharedDateState={setSharedDateState.mock.calls[0][0]}
      />
    );
    expect(setSharedState).toHaveBeenCalledTimes(1);
    expect(setSharedDateState).toHaveBeenCalledTimes(1);
  });

  it("opens curves from display settings without replacing quick controls", async () => {
    const { getByRole, findByRole, queryByRole } = render(
      <ShadowPanels controlStyle={SHADOW_CONTROL_STYLE.QUICK} />
    );
    expect(
      queryByRole("button", { name: "Kurvenansicht", exact: true })
    ).toBeNull();
    fireEvent.click(getByRole("button", { name: "Darstellungseinstellungen" }));
    const panel = await findByRole("dialog", { name: "Schattendarstellung" });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Kurvenansicht", exact: true })
    );
    const curves = await findByRole("dialog", { name: "Kurvenansicht" });
    expect(getByRole("button", { name: "Heute", exact: true })).toBeTruthy();
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Schattendarstellung schließen",
      })
    );
    expect(curves.isConnected).toBe(true);
    fireEvent.click(
      within(curves).getByRole("button", { name: "Kurvenansicht schließen" })
    );
    expect(queryByRole("dialog", { name: "Kurvenansicht" })).toBeNull();
  });

  it.each([SHADOW_CONTROL_STYLE.QUICK, SHADOW_CONTROL_STYLE.CURVE])(
    "keeps intensity and a visible display opener on the %s main panel",
    async (controlStyle) => {
      const { findByRole, getByRole, getByLabelText, queryByRole } = render(
        <ShadowPanels controlStyle={controlStyle} />
      );
      expect(queryByRole("dialog", { name: "Schattendarstellung" })).toBeNull();
      expect(queryByRole("button", { name: "Debug" })).toBeNull();
      const intensity = getByLabelText("Schattenintensität", {
        selector: "input",
      });
      const opener = getByRole("button", { name: "Darstellungseinstellungen" });
      expect(opener.getAttribute("aria-expanded")).toBe("false");
      expect(
        opener.compareDocumentPosition(intensity) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(opener.textContent).not.toContain("Darstellungseinstellungen");
      fireEvent.change(intensity, { target: { value: "0.42" } });
      expect((intensity as HTMLInputElement).value).toBe("0.42");
      fireEvent.click(opener);
      expect(opener.getAttribute("aria-expanded")).toBe("true");
      const panel = await findByRole("dialog", {
        name: "Schattendarstellung",
      });
      expect(within(panel).queryByLabelText("Schattenintensität")).toBeNull();
      expect(panel.parentElement).toBe(document.body);
      expect(
        within(panel).getByTitle("Schattendarstellung verschieben")
      ).toBeTruthy();
      const debug = within(panel).getByRole("button", { name: "Debug" });
      expect(debug.className).not.toContain("opacity-0");
      fireEvent.click(debug);
      expect(debug.getAttribute("aria-pressed")).toBe("true");
    }
  );

  it("keeps settings live after the main panel closes and retains them on reopening", async () => {
    const { findByRole, getByRole, queryByRole, queryByLabelText } = render(
      <ShadowPanels controlStyle={SHADOW_CONTROL_STYLE.QUICK} />
    );
    fireEvent.click(getByRole("button", { name: "Darstellungseinstellungen" }));
    fireEvent.click(getByRole("button", { name: "Hauptpanel umschalten" }));
    expect(queryByLabelText("Schattenintensität")).toBeNull();
    const panel = await findByRole("dialog", { name: "Schattendarstellung" });
    fireEvent.click(within(panel).getByText("Kartenstil", { exact: true }));
    const basemap = within(panel).getByLabelText(
      "Basiskarte auf dem Terrain anzeigen",
      { selector: "input" }
    ) as HTMLInputElement;
    const labels = within(panel).getByLabelText(
      "Freigestellte Kartenbeschriftungen über dem Modell anzeigen",
      { selector: "input" }
    ) as HTMLInputElement;
    fireEvent.click(basemap);
    expect(basemap.checked).toBe(false);
    expect(labels.disabled).toBe(true);
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Schattendarstellung schließen",
      })
    );
    expect(queryByRole("dialog", { name: "Schattendarstellung" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Hauptpanel umschalten" }));
    fireEvent.click(getByRole("button", { name: "Darstellungseinstellungen" }));
    const reopenedPanel = await findByRole("dialog", {
      name: "Schattendarstellung",
    });
    fireEvent.click(
      within(reopenedPanel).getByText("Kartenstil", { exact: true })
    );
    expect(
      (
        within(reopenedPanel).getByLabelText(
          "Basiskarte auf dem Terrain anzeigen",
          {
            selector: "input",
          }
        ) as HTMLInputElement
      ).checked
    ).toBe(false);
  });

  it("imports debug only on first enabled opening and unmounts it when closed or disabled", async () => {
    const location = DEFAULT_SHADOW_SIMULATION_LOCATION;
    const libreMap = {
      getCenter: () => ({ lat: location.latitude, lng: location.longitude }),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as MaplibreMap;
    const initialState = {
      ...createInitialShadowSimulationState(undefined),
      enabled: true,
    };
    const dateState = createInitialShadowDateState(undefined, location);
    const viewForState = (state: ShadowSimulationState) => (
      <ControlLayout>
        <ShadowSimulationView
          libreMap={libreMap}
          targeted={false}
          sharedState={state}
          setSharedState={vi.fn()}
          sharedDateState={dateState}
          setSharedDateState={vi.fn()}
        />
      </ControlLayout>
    );
    const { findByRole, queryByRole, rerender } = render(
      viewForState(initialState)
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(debugLifecycle.imported).not.toHaveBeenCalled();
    expect(debugLifecycle.mounted).not.toHaveBeenCalled();
    expect(
      queryByRole("region", { name: "Projektions-Debug geladen" })
    ).toBeNull();

    rerender(
      viewForState({
        ...initialState,
        enabled: false,
        showProjectionDebugView: true,
      })
    );
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(debugLifecycle.imported).not.toHaveBeenCalled();

    rerender(viewForState({ ...initialState, showProjectionDebugView: true }));
    await findByRole("region", { name: "Projektions-Debug geladen" });
    expect(debugLifecycle.imported).toHaveBeenCalledTimes(1);
    expect(debugLifecycle.mounted).toHaveBeenCalledTimes(1);

    rerender(viewForState(initialState));
    expect(
      queryByRole("region", { name: "Projektions-Debug geladen" })
    ).toBeNull();
    expect(debugLifecycle.unmounted).toHaveBeenCalledTimes(1);

    rerender(viewForState({ ...initialState, showProjectionDebugView: true }));
    await findByRole("region", { name: "Projektions-Debug geladen" });
    expect(debugLifecycle.imported).toHaveBeenCalledTimes(1);
    expect(debugLifecycle.mounted).toHaveBeenCalledTimes(2);

    rerender(
      viewForState({
        ...initialState,
        enabled: false,
        showProjectionDebugView: true,
      })
    );
    expect(
      queryByRole("region", { name: "Projektions-Debug geladen" })
    ).toBeNull();
    expect(debugLifecycle.unmounted).toHaveBeenCalledTimes(2);
  });
});
