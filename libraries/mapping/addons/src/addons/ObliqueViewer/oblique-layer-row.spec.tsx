import { cleanup, render, renderHook } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Degrees } from "@carma-units";
import type { Layer } from "@carma-mapping/layers";
import type { ObliqueViewerState } from "@carma-mapping/oblique-viewer";

type RowState = Pick<
  ObliqueViewerState,
  | "isOn"
  | "title"
  | "series"
  | "bearingDeg"
  | "pitchDeg"
  | "previewVisible"
  | "selectedImageId"
  | "selectedSourceImageId"
  | "selectedSeriesId"
  | "selectedImageBearingDeg"
  | "hoverAvailable"
>;
const channel = vi.hoisted(() => ({
  state: null as RowState | null,
  setOn: vi.fn(),
  setPanelOpen: vi.fn(),
  sendRequest: vi.fn(),
}));
vi.mock("./oblique-actions", () => ({
  useObliqueViewerActions: () => ({
    ...channel.state,
    setOn: channel.setOn,
    setPanelOpen: channel.setPanelOpen,
    sendRequest: channel.sendRequest,
  }),
}));
// Exercise the owning pure formatter without starting unrelated annotation/canvas tools.
vi.mock(
  "@carma-mapping/annotations/runtime",
  async () =>
    import(
      "../../../../annotations/runtime/src/lib/utils/format-cardinal-bearing"
    )
);
import { useObliqueLayerRow } from "./oblique-layer-row";

const state = (): RowState => ({
  isOn: true,
  title: "Schrägluftbilder",
  series: [
    {
      id: "2024",
      label: "2024",
      shortLabel: "24",
      enabled: false,
      isLoading: false,
      error: null,
      imageCount: 10,
    },
    {
      id: "2026",
      label: "2026",
      shortLabel: "26",
      enabled: true,
      isLoading: false,
      error: null,
      imageCount: 10,
      acquisitionYear: 2026,
      acquisitionMonth: 4,
    },
  ],
  bearingDeg: 111 as Degrees,
  pitchDeg: 45 as Degrees,
  previewVisible: false,
  selectedImageId: "2026::BW_30_3283",
  selectedSourceImageId: "BW_30_3283",
  selectedSeriesId: "2026",
  selectedImageBearingDeg: -35 as Degrees,
  hoverAvailable: false,
});
const mount = () => {
  const onAdd = vi.fn(),
    onRemove = vi.fn(),
    onUpdate = vi.fn();
  const view = renderHook(() =>
    useObliqueLayerRow({
      hasRow: true,
      hasEngine: true,
      panelOpen: false,
      onAdd,
      onRemove,
      onUpdate,
    })
  );
  const label = () => {
    const layer = onUpdate.mock.calls.at(-1)![0] as Layer;
    const icon = layer.interactionButtons![0].icon as ReactElement<{
      children: string;
    }>;
    return icon.props.children;
  };
  return { ...view, onUpdate, label };
};
beforeEach(() => {
  vi.clearAllMocks();
  channel.state = state();
});
afterEach(() => cleanup());

describe("selected-photo layer readout", () => {
  it("shows April2026 and positive NW camera heading/photo ID without layer updates on viewport motion", () => {
    const view = mount();
    expect(view.label()).toBe("April 2026 - NW (325°) BW_30_3283");
    const layer = view.onUpdate.mock.calls.at(-1)![0] as Layer;
    render(layer.interactionButtons![0].icon as ReactElement);
    expect(view.onUpdate).toHaveBeenCalledOnce();
    channel.state = {
      ...channel.state!,
      bearingDeg: 0 as Degrees,
      pitchDeg: 79 as Degrees,
    };
    view.rerender();
    expect(view.label()).toBe("April 2026 - NW (325°) BW_30_3283");
    expect(view.onUpdate).toHaveBeenCalledOnce();
  });
  it("shows only known acquisition year and rounds359.8degrees to north0", () => {
    channel.state = {
      ...channel.state!,
      selectedImageBearingDeg: 359.8 as Degrees,
      series: channel.state!.series.map((entry) =>
        entry.id === "2026" ? { ...entry, acquisitionMonth: undefined } : entry
      ),
    };
    const view = mount();
    expect(view.label()).toBe("2026 - N (0°) BW_30_3283");
    expect(view.label()).not.toContain("April");
    expect(view.label()).not.toContain("360°");
  });
  it("falls back to enabled series/viewport heading for a disabled selected series or missing photo ID", () => {
    channel.state = {
      ...channel.state!,
      bearingDeg: 90 as Degrees,
      series: channel.state!.series.map((entry) => ({
        ...entry,
        enabled: entry.id === "2024",
      })),
    };
    const view = mount();
    expect(view.label()).toBe("24 · O (90°)");
    expect(view.label()).not.toContain("BW_30_3283");
    channel.state = {
      ...channel.state!,
      selectedSourceImageId: null,
      series: channel.state!.series.map((entry) => ({
        ...entry,
        enabled: true,
      })),
    };
    view.rerender();
    expect(view.label()).toBe("24, 26 · O (90°)");
    expect(view.label()).not.toContain("BW_30_3283");
  });
});
