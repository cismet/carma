// @vitest-environment jsdom

import type { AriaRole, ReactNode } from "react";

import { StyleProvider } from "@ant-design/cssinjs";
import {
  cleanup,
  fireEvent,
  render as renderComponent,
} from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialShadowDateState } from "../core/create-shadow-simulation-state";
import {
  DEFAULT_SHADOW_SIMULATION_LOCATION,
  getSolarPosition,
} from "../core/solar-position";
import { SHADOW_BUFFER_LAYOUT } from "../core/shadow-types";
import type { ShadowProjectionDebugModel } from "../runtime/shadow-projection-debug-model";
import {
  ShadowProjectionDebugPortal,
  ShadowProjectionDebugView,
  type ShadowProjectionDebugSettings,
} from "./ShadowProjectionDebugView";

const source = vi.hoisted(() => ({
  snapshot: {},
  model: undefined as ShadowProjectionDebugModel | undefined,
  runtimes: [] as Array<{
    providesTerrain?: boolean;
    setErrorTarget?: () => void;
    setTileBoundsVisible?: () => void;
  }>,
}));

vi.mock("@carma-commons/ui/components", () => ({
  CarmaResponsiveInfoBox: ({
    heading,
    content,
    role,
    "aria-label": ariaLabel,
  }: {
    heading?: ReactNode;
    content?: ReactNode;
    role?: AriaRole;
    "aria-label"?: string;
  }) => (
    <div role={role} aria-label={ariaLabel}>
      {heading}
      {content}
    </div>
  ),
  useHostElementSizeRef: () => ({
    ref: () => undefined,
    isReady: false,
    size: { width: 640 },
  }),
}));
vi.mock("@carma-mapping/components", () => ({
  ViewStateVisualizer: () => null,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: () => source.runtimes,
  subscribeSharedThreeSceneContent: () => () => undefined,
}));
vi.mock("../runtime/shadow-projection-debug-model", () => ({
  buildShadowProjectionDebugModel: () => source.model,
}));
vi.mock("../runtime/shadow-projection-debug-store", () => ({
  readShadowProjectionDebugSnapshot: () => source.snapshot,
  subscribeShadowProjectionDebugSnapshot: () => () => undefined,
}));

const render = (ui: ReactNode) =>
  renderComponent(ui, {
    wrapper: ({ children }) => (
      <StyleProvider mock="server">{children}</StyleProvider>
    ),
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => true,
    }))
  );
  source.runtimes = [];
  source.model = {
    bufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    sunDiscSamples: 256,
    tiledStats: {
      pages: 3,
      cachedSamplePages: 7,
      cacheBytes: 1048576,
      scratchBytes: 2097152,
      hits: 9,
      misses: 3,
      depthRenders: 4,
      colorPasses: 5,
      limitedPages: 1,
      dimensions: ["1024 × 512"],
      corridorAccumulation: {
        pageSamples: [
          {
            id: "a",
            samples: 256,
            totalSamples: 256,
            ready: true,
            published: true,
          },
          {
            id: "b",
            samples: 128,
            totalSamples: 256,
            ready: true,
            published: false,
          },
        ],
        memoryBytes: 4 * 1024 ** 2,
        fallbackReason: null,
      },
    },
    viewStates: [],
    tileVolumes: [],
    viewportWidthMeters: 100,
    viewportHeightMeters: 100,
    receiverCoverageWidthMeters: 100,
    receiverCoverageHeightMeters: 100,
    shadowTexelWidthMeters: 1,
    shadowTexelHeightMeters: 1,
    horizontalProjectionPerHeight: 1,
    elevationSpanMeters: 10,
    shadowBuffer: {
      receiverLeftMeters: -50,
      receiverRightMeters: 50,
      receiverBottomMeters: -50,
      receiverTopMeters: 50,
      leftMeters: -50,
      rightMeters: 50,
      bottomMeters: -50,
      topMeters: 50,
      widthMeters: 100,
      heightMeters: 100,
      guardMeters: 0,
      texelMeters: 1,
      shadowMapWidth: 2048,
      shadowMapHeight: 2048,
    },
    totalShadowTexels: 2048 ** 2,
    casterReachMeters: 100,
    visualizationWorldScaleMeters: 100,
  };
});

const map = {} as MaplibreMap;
const settings: ShadowProjectionDebugSettings = {
  showSunDebugVector: false,
  showTileBounds: false,
};
const solarPosition = getSolarPosition(
  createInitialShadowDateState(undefined, DEFAULT_SHADOW_SIMULATION_LOCATION),
  DEFAULT_SHADOW_SIMULATION_LOCATION
);
const debugView = (
  <ShadowProjectionDebugView
    map={map}
    settings={settings}
    solarPosition={solarPosition}
    onSettingsChange={vi.fn()}
    onClose={vi.fn()}
  />
);

describe("projection debug availability", () => {
  it("starts compact and closes without toggling the visualizer", () => {
    const onClose = vi.fn();
    const { getByRole, queryByText } = render(
      <ShadowProjectionDebugView
        map={map}
        settings={settings}
        solarPosition={solarPosition}
        onSettingsChange={vi.fn()}
        onClose={onClose}
      />
    );
    expect(queryByText("Samples (Ziel)")).toBeNull();
    expect(
      getByRole("button", { name: /Visualisierungsoptionen/ }).getAttribute(
        "aria-expanded"
      )
    ).toBe("false");
    fireEvent.click(
      getByRole("button", { name: "Projektions-Debug schließen" })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("shows tiled statistics without presenting a mono buffer as a tiled page", () => {
    const { getByText, queryByText, getByRole } = render(debugView);
    fireEvent.click(getByRole("button", { name: /Schattenstatistik/ }));
    expect(getByText("Samples (Ziel)")).toBeTruthy();
    expect(getByText("256")).toBeTruthy();
    expect(getByText("1: 1024 × 512")).toBeTruthy();
    expect(getByText("9 / 3")).toBeTruthy();
    expect(getByText("Pro Korridor")).toBeTruthy();
    expect(getByText("1 / 2")).toBeTruthy();
    expect(getByText("4.0 MiB")).toBeTruthy();
    expect(queryByText("2048 × 2048")).toBeNull();
    expect(
      (getByRole("radio", { name: "Sonnenansicht" }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(
      getByRole("button", { name: "Info zum Projektions-Debug" })
    ).toBeTruthy();
    expect(
      getByRole("region", { name: "Schattenstatistik" }).style.overflowY
    ).toBe("auto");
    expect(
      getByRole("region", { name: "Schattenseitenformate" }).style.maxHeight
    ).toBe("88px");
  });

  it("makes unsupported corridor integration visible instead of claiming local means", () => {
    const stats = source.model!.tiledStats!;
    source.model = {
      ...source.model!,
      tiledStats: {
        ...stats,
        corridorAccumulation: {
          ...stats.corridorAccumulation!,
          fallbackReason: "receivers",
        },
      },
    };
    const { getByText, queryByText, getByRole } = render(debugView);
    fireEvent.click(getByRole("button", { name: /Schattenstatistik/ }));
    expect(getByText("Fallback: receivers")).toBeTruthy();
    expect(queryByText("Pro Korridor")).toBeNull();
  });

  it("returns an active mono sun view to overview when tiled mode is selected", () => {
    source.model = {
      ...source.model!,
      bufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    };
    const { getByRole, rerender } = render(debugView);
    fireEvent.click(getByRole("radio", { name: "Sonnenansicht" }));
    expect(
      (getByRole("radio", { name: "Sonnenansicht" }) as HTMLInputElement)
        .checked
    ).toBe(true);
    source.model = {
      ...source.model!,
      bufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    };
    source.snapshot = {};
    rerender(
      <ShadowProjectionDebugView
        map={map}
        settings={{ ...settings }}
        solarPosition={solarPosition}
        onSettingsChange={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(
      (getByRole("radio", { name: "Übersicht" }) as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (getByRole("radio", { name: "Sonnenansicht" }) as HTMLInputElement)
        .disabled
    ).toBe(true);
  });

  it("keeps only debug overlays, never surface or quality controls", () => {
    const { queryByText, getByRole, rerender } = render(debugView);
    expect(queryByText("Mesh-LOD")).toBeNull();
    expect(queryByText("Gebäude volle Deckkraft")).toBeNull();
    expect(queryByText("Tile-Kanten + IDs")).toBeNull();
    source.runtimes = [
      {
        providesTerrain: true,
        setErrorTarget: vi.fn(),
        setTileBoundsVisible: vi.fn(),
      },
    ];
    rerender(
      <ShadowProjectionDebugView
        map={map}
        settings={{ ...settings }}
        solarPosition={solarPosition}
        onSettingsChange={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(queryByText("Mesh-LOD")).toBeNull();
    expect(queryByText("Gebäude volle Deckkraft")).toBeNull();
    expect(queryByText("Qualität")).toBeNull();
    expect(queryByText("Terrain")).toBeNull();
    expect(queryByText("Transmittanz-LUT")).toBeNull();
    expect(queryByText("Sky-Irradianz-LUT")).toBeNull();
    expect(getByRole("checkbox", { name: "Sonnenvektor" })).toBeTruthy();
    expect(getByRole("checkbox", { name: "Tile-Kanten + IDs" })).toBeTruthy();
  });
});

describe("ShadowProjectionDebugPortal", () => {
  it("owns a dedicated portal host and removes it on unmount", () => {
    const view = render(
      <ShadowProjectionDebugPortal>
        <div>debug content</div>
      </ShadowProjectionDebugPortal>
    );

    const host = document.querySelector(
      "[data-carma-shadow-projection-debug-host]"
    );
    expect(host).not.toBeNull();
    expect(host?.textContent).toBe("debug content");

    view.unmount();

    expect(
      document.querySelector("[data-carma-shadow-projection-debug-host]")
    ).toBeNull();
  });
});
