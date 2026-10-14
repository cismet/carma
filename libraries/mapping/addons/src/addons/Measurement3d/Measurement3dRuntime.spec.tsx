import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Measurement3dRuntime } from "./Measurement3dRuntime";
import type { Measurement3dConfig } from "./measurement3d-config";
const state = vi.hoisted(() => ({
  showAllTools: false,
  factory: vi.fn((options: { annotationLineStyle: unknown }) => [
    { id: "distance", style: options.annotationLineStyle },
  ]),
}));
vi.mock("@carma-mapping/annotations/builtin-tools", () => ({
  createDefaultAnnotationToolPlugins: state.factory,
  defaultAnnotationToolTexts: {},
  resolveAnnotationModeText: () => ({ labelTextModal: {} }),
}));
vi.mock("@carma-mapping/annotations/maplibre", () => ({
  useMapLibreAnnotationEngine: () => ({}),
  useMapLibreAnnotationOverlayHost: () => ({
    overlayContainer: null,
    overlayHost: null,
    ready: true,
  }),
}));
vi.mock("@carma-mapping/annotations/runtime", () => ({
  ANNOTATION_ENTRY_ROLES: { EXTERNAL: "external" },
  AnnotationsProvider: () => null,
  resolveVisibleMeasurementAnnotationToolPlugins: (plugins: unknown) => plugins,
  AnnotationToolShortcutBindings: () => null,
  RuntimeAnnotationInfoBox: () => null,
  SharedAnnotationsImport: () => null,
  useAnnotationLabelTextDialogState: () => ({}),
}));
vi.mock("@carma-mapping/annotations/ui", () => ({
  AnnotationLabelTextModal: () => null,
  STABLE_ANNOTATION_TOOL_IDS: ["select", "point", "distance"],
  confirmSharedAnnotationsConflicts: () => undefined,
}));
vi.mock("./Measurement3dEntriesSync", () => ({
  Measurement3dEntriesSync: () => null,
}));
vi.mock("./Measurement3dRuntimeServicesSync", () => ({
  Measurement3dRuntimeServicesSync: () => null,
}));
vi.mock("./Measurement3dToolbar", () => ({
  Measurement3dToolbarPortal: () => null,
}));
vi.mock("./measurement3d-host", () => ({ useMeasurement3dHostUi: () => null }));
vi.mock("./measurement3d-state", () => ({
  useMeasurement3dActions: () => ({
    isOn: true,
    available: true,
    showAllTools: state.showAllTools,
  }),
}));
const map = {} as MaplibreMap;
const latestStyle = () =>
  state.factory.mock.calls.at(-1)![0].annotationLineStyle as {
    meterMarkers: string;
    strokeWidthPx: number;
  };
beforeEach(() => {
  state.showAllTools = false;
  vi.clearAllMocks();
});
afterEach(cleanup);
describe("Three meter marker feature gate", () => {
  it("keeps regular tools free of rulers despite default selected configuration", () => {
    render(<Measurement3dRuntime map={map} />);
    expect(latestStyle().meterMarkers).toBe("off");
  });
  it("keeps a configured always ruler off while alltools is disabled and preserves unrelated style", () => {
    render(
      <Measurement3dRuntime
        map={map}
        config={{
          style: { lines: { meterMarkers: "always", strokeWidthPx: 4 } },
        }}
      />
    );
    expect(latestStyle()).toMatchObject({
      meterMarkers: "off",
      strokeWidthPx: 4,
    });
  });
  it("restores selected rulers by default only when alltools is enabled", () => {
    state.showAllTools = true;
    render(<Measurement3dRuntime map={map} />);
    expect(latestStyle().meterMarkers).toBe("selected");
  });
  it.each(["off", "selected", "always"] as const)(
    "honours explicit %s only with alltools enabled",
    (meterMarkers) => {
      state.showAllTools = true;
      render(
        <Measurement3dRuntime
          map={map}
          config={{ style: { lines: { meterMarkers } } }}
        />
      );
      expect(latestStyle().meterMarkers).toBe(meterMarkers);
    }
  );
  it("reacts to live flag changes with the same config object and refreshes memoized plugins", () => {
    const config: Measurement3dConfig = {
      style: { lines: { meterMarkers: "always" } },
    };
    const view = render(<Measurement3dRuntime map={map} config={config} />);
    expect(latestStyle().meterMarkers).toBe("off");
    state.showAllTools = true;
    view.rerender(<Measurement3dRuntime map={map} config={config} />);
    expect(latestStyle().meterMarkers).toBe("always");
    state.showAllTools = false;
    view.rerender(<Measurement3dRuntime map={map} config={config} />);
    expect(latestStyle().meterMarkers).toBe("off");
    expect(state.factory).toHaveBeenCalledTimes(3);
    expect(config.style!.lines!.meterMarkers).toBe("always");
  });
});
