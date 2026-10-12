import { cleanup, configure, render, renderHook } from "@testing-library/react";
import { createElement, type ReactElement, type ReactNode } from "react";
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
  | "selectedCameraId"
  | "selectedCameraView"
  | "selectedImageBearingDeg"
  | "hoverAvailable"
  | "isBusy"
  | "isLoading"
  | "viewMode"
>;
const addonChannel = vi.hoisted(() => ({
  objectViews: undefined as unknown,
  nextInterface: false,
  adHocDatasets: [] as unknown[],
}));
const channel = vi.hoisted(() => ({
  state: null as RowState | null,
  setOn: vi.fn(),
  setPanelOpen: vi.fn(),
  sendRequest: vi.fn(),
}));
vi.mock("../../lib/AddonStateContext", () => ({
  useAddonState: () => [addonChannel.objectViews, vi.fn()],
}));
vi.mock("@carma-providers/feature-flag", () => ({
  useFeatureFlags: () => ({
    featureFlagObliqueNextUi: addonChannel.nextInterface,
  }),
}));
vi.mock("@carma-mapping/oblique-viewer", () => ({
  useAdHocObliqueDatasets: () => addonChannel.adHocDatasets,
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
import {
  OBLIQUE_OBJECT_VIEWS_BUTTON_ID,
  useObliqueLayerRow,
} from "./oblique-layer-row";

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
      acquisitionYear: 2024,
      acquisitionMonth: 3,
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
  selectedCameraId: "BW",
  selectedCameraView: "back",
  selectedImageBearingDeg: -35 as Degrees,
  hoverAvailable: false,
  isBusy: false,
  isLoading: false,
  viewMode: "oblique",
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
  const label = (): ReactNode => {
    const layer = onUpdate.mock.calls.at(-1)![0] as Layer;
    const icon = layer.interactionButtons![0].icon as ReactElement<{
      children: ReactNode;
    }>;
    return icon.props.children;
  };
  return { ...view, onUpdate, label };
};
beforeEach(() => {
  configure({ testIdAttribute: "data-test-id" });
  vi.clearAllMocks();
  channel.state = state();
  addonChannel.objectViews = undefined;
  addonChannel.nextInterface = false;
  addonChannel.adHocDatasets = [];
});
afterEach(() => cleanup());

describe("selected-photo layer readout", () => {
  it("shows compact German month, unbracketed heading, and a compact ID with the raw ID on hover", () => {
    const view = mount();
    const rendered = render(createElement("span", null, view.label()));
    expect(rendered.container.textContent).toContain("04/2026");
    expect(rendered.container.textContent).toContain("NW 325°");
    expect(rendered.container.textContent).not.toContain("(325°)");
    expect(rendered.container.textContent).not.toContain("BW_30_3283");
    const photoIdentifier = rendered.getByTestId("oblique-photo-identifier");
    expect(photoIdentifier.getAttribute("title")).toBe("BW_30_3283");
    expect(photoIdentifier.textContent).toBe("BW\u200930\u20093283");
    expect(photoIdentifier.querySelector("strong, b, svg")).toBeNull();

    const layer = view.onUpdate.mock.calls.at(-1)![0] as Layer;
    expect(layer.interactionButtons![0].tooltip).toContain("BW_30_3283");
    expect(view.onUpdate).toHaveBeenCalledOnce();
    channel.state = {
      ...channel.state!,
      bearingDeg: 0 as Degrees,
      pitchDeg: 79 as Degrees,
    };
    view.rerender();
    const updatedLabel = render(createElement("span", null, view.label()))
      .container.textContent;
    expect(updatedLabel).toContain("04/2026");
    expect(updatedLabel).toContain("NW 325°");
    expect(view.onUpdate).toHaveBeenCalledOnce();
  });
  it.each(["LE", "RE", "RI", "FW", "BW", "NA"])(
    "retains the original %s prefix without icons or bold formatting",
    (cameraId) => {
      const sourceImageId = `${cameraId}_30_3283`;
      channel.state = {
        ...channel.state!,
        selectedImageId: `2026::${sourceImageId}`,
        selectedSourceImageId: sourceImageId,
        selectedCameraId: cameraId,
        selectedCameraView: "right",
      };
      const mounted = mount();
      const rendered = render(createElement("span", null, mounted.label()));
      const identifier = rendered.getByTestId("oblique-photo-identifier");
      expect(identifier.textContent).toBe(`${cameraId}\u200930\u20093283`);
      expect(identifier.title).toBe(sourceImageId);
      expect(identifier.querySelector("strong, b, svg")).toBeNull();
    }
  );
  it("retains the original 2024 identifier components", () => {
    const sourceImageId = "001_001_170003373";
    channel.state = {
      ...channel.state!,
      selectedImageId: `2024::${sourceImageId}`,
      selectedSourceImageId: sourceImageId,
      selectedSeriesId: "2024",
      selectedCameraId: "170",
      selectedCameraView: "front",
      series: channel.state!.series.map((entry) => ({
        ...entry,
        enabled: entry.id === "2024",
      })),
    };
    const view = mount();
    const rendered = render(createElement("span", null, view.label()));
    const photoIdentifier = rendered.getByTestId("oblique-photo-identifier");
    expect(photoIdentifier.getAttribute("title")).toBe(sourceImageId);
    expect(photoIdentifier.textContent).toBe("001\u2009001\u2009170003373");
    expect(photoIdentifier.querySelector("strong, b, svg")).toBeNull();
  });
  it("shows month/year when known and rounds359.8degrees to north0", () => {
    channel.state = {
      ...channel.state!,
      selectedImageBearingDeg: 359.8 as Degrees,
      series: channel.state!.series.map((entry) =>
        entry.id === "2026" ? { ...entry, acquisitionMonth: undefined } : entry
      ),
    };
    const view = mount();
    const text = render(createElement("span", null, view.label())).container
      .textContent;
    expect(text).toContain("2026");
    expect(text).not.toContain("04/2026");
    expect(text).toContain("N 0°");
    expect(text).not.toContain("April");
    expect(text).not.toContain("360°");
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
    let text = render(createElement("span", null, view.label())).container
      .textContent;
    expect(text).toContain("03/2024");
    expect(text).toContain("O 90°");
    expect(text).not.toContain("BW_30_3283");
    channel.state = {
      ...channel.state!,
      selectedSourceImageId: null,
      series: channel.state!.series.map((entry) => ({
        ...entry,
        enabled: true,
      })),
    };
    view.rerender();
    text = render(createElement("span", null, view.label())).container
      .textContent;
    expect(text).toContain("03/2024, 04/2026");
    expect(text).toContain("O 90°");
    expect(text).not.toContain("BW_30_3283");
  });
  it("lists every enabled acquisition period when there is no selected image", () => {
    channel.state = {
      ...channel.state!,
      selectedImageId: null,
      selectedSourceImageId: null,
      selectedSeriesId: null,
      bearingDeg: 325 as Degrees,
      series: channel.state!.series.map((entry) => ({
        ...entry,
        enabled: true,
      })),
    };
    const view = mount();
    const text = render(createElement("span", null, view.label())).container
      .textContent;
    expect(text).toContain("03/2024, 04/2026");
    expect(text).toContain("NW 325°");
    expect(text).not.toContain("BW_30_3283");
  });
  it("does not infer a known-looking filename prefix when catalog view metadata is missing", () => {
    const sourceImageId = "RI_30_3283";
    channel.state = {
      ...channel.state!,
      selectedImageId: `2026::${sourceImageId}`,
      selectedSourceImageId: sourceImageId,
      selectedCameraId: "RI",
      selectedCameraView: null,
    };
    const view = mount();
    const rendered = render(createElement("span", null, view.label()));
    expect(rendered.getByTestId("oblique-photo-identifier").title).toBe(
      sourceImageId
    );
    expect(
      rendered.getByTestId("oblique-photo-identifier").textContent
    ).toContain("RI");
    expect(rendered.queryByTestId("oblique-camera-marker")).toBeNull();
  });
});

describe("primary layer-row query mode", () => {
  const extension = {
    mode: "objectCoverage",
    label: "Objektansichtenabfrage",
    Component: () => null,
  };

  const buttons = (view: ReturnType<typeof mount>) => {
    const interactionButtons = (view.onUpdate.mock.calls.at(-1)![0] as Layer)
      .interactionButtons!;
    return Array.isArray(interactionButtons)
      ? interactionButtons
      : [interactionButtons];
  };

  it("toggles the registered object-view mode and marks it active", () => {
    addonChannel.nextInterface = true;
    addonChannel.objectViews = { extension };
    const view = mount();
    const queryButton = buttons(view).find(
      (button) => button.id === OBLIQUE_OBJECT_VIEWS_BUTTON_ID
    );
    expect(queryButton?.tooltip).toBe("Objektansichtenabfrage");
    const accessibleButton = render(
      createElement("button", null, queryButton?.icon)
    );
    expect(
      accessibleButton.getByRole("button", {
        name: "Objektansichtenabfrage",
      })
    ).toBeDefined();
    queryButton?.onClick?.();
    expect(channel.sendRequest).toHaveBeenCalledWith({
      type: "setViewMode",
      mode: "objectCoverage",
    });

    channel.state = { ...channel.state!, viewMode: "objectCoverage" };
    view.rerender();
    const activeIcon = buttons(view).find(
      (button) => button.id === OBLIQUE_OBJECT_VIEWS_BUTTON_ID
    )?.icon as ReactElement<{
      children: [ReactElement<{ style: { color: string } }>, ReactElement];
    }>;
    expect(activeIcon.props.children[0].props.style.color).toBe("#1677ff");
    buttons(view)
      .find((button) => button.id === OBLIQUE_OBJECT_VIEWS_BUTTON_ID)
      ?.onClick?.();
    expect(channel.sendRequest).toHaveBeenLastCalledWith({
      type: "setViewMode",
      mode: "oblique",
    });
  });

  it.each([
    ["viewer off", { isOn: false }],
    ["busy", { isBusy: true }],
    ["loading", { isLoading: true }],
    ["no enabled series", { series: [] }],
  ])(
    "keeps the query action stable but guards it when %s",
    (_reason, patch) => {
      addonChannel.nextInterface = true;
      addonChannel.objectViews = { extension };
      channel.state = { ...channel.state!, ...patch };
      const view = mount();
      const queryButton = buttons(view).find(
        (button) => button.id === OBLIQUE_OBJECT_VIEWS_BUTTON_ID
      );
      expect(queryButton).toBeDefined();
      const icon = queryButton!.icon as ReactElement<{
        "aria-disabled": boolean;
      }>;
      expect(icon.props["aria-disabled"]).toBe(true);
      queryButton?.onClick?.();
      expect(channel.sendRequest).not.toHaveBeenCalled();
    }
  );

  it("keeps Classic mode for local datasets and requires NG extension metadata", () => {
    addonChannel.objectViews = { extension };
    const classicView = mount();
    expect(
      buttons(classicView).some(
        (button) => button.id === OBLIQUE_OBJECT_VIEWS_BUTTON_ID
      )
    ).toBe(false);

    addonChannel.adHocDatasets = [{ id: "adhoc" }];
    const adHocView = mount();
    expect(
      buttons(adHocView).some(
        (button) => button.id === OBLIQUE_OBJECT_VIEWS_BUTTON_ID
      )
    ).toBe(false);

    addonChannel.nextInterface = true;
    const ngView = mount();
    expect(
      buttons(ngView).some(
        (button) => button.id === OBLIQUE_OBJECT_VIEWS_BUTTON_ID
      )
    ).toBe(true);

    addonChannel.objectViews = undefined;
    const unavailableView = mount();
    expect(
      buttons(unavailableView).some(
        (button) => button.id === OBLIQUE_OBJECT_VIEWS_BUTTON_ID
      )
    ).toBe(false);
  });
});
