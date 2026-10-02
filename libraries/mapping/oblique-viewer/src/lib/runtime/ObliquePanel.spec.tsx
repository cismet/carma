// @vitest-environment jsdom
import {
  createElement,
  Fragment,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("antd", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Spin: () => null,
  message: { error: vi.fn() },
  Slider: () => null,
  Select: ({
    value,
    options,
    onChange,
    ...props
  }: {
    value: string[];
    options: { value: string; label: ReactNode }[];
    onChange: (ids: string[]) => void;
    "aria-label": string;
  }) =>
    createElement(
      Fragment,
      null,
      createElement(
        "select",
        {
          multiple: true,
          "aria-label": props["aria-label"],
          value,
          onChange: (event: { currentTarget: HTMLSelectElement }) =>
            onChange(
              Array.from(
                event.currentTarget.selectedOptions,
                (option) => option.value
              )
            ),
        },
        options.map((option) =>
          createElement(
            "option",
            { key: option.value, value: option.value },
            option.value
          )
        )
      ),
      options.map((option) =>
        createElement("div", { key: option.value }, option.label)
      )
    ),
}));
vi.mock("@carma-mapping/components", () => ({
  ContactMailButton: () => createElement("button", null, "Rückmeldung"),
}));
vi.mock("@carma-mapping/map-controls-layout", () => ({
  ControlButtonStyler: ({
    children,
    width,
    height,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    width?: string;
    height?: string;
  }) =>
    createElement("button", { ...props, style: { width, height } }, children),
}));
vi.mock("./utils/imageUrls", () => ({
  downloadAsBlobAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../core/config", () => ({
  BACKDROP_LOOK_DEFAULT: { brightness: 125, contrast: 95, saturation: 85 },
  BACKDROP_LOOK_BOUNDS: {
    brightness: [50, 150],
    contrast: [50, 150],
    saturation: [0, 200],
  },
}));
vi.mock("../core/utils/orientation", () => ({
  CARDINALS_CLOCKWISE: [0, 1, 2, 3],
  cardinalLetter: (direction: number) => ["N", "O", "S", "W"][direction],
}));

import { ObliquePanel } from "./ObliquePanel";
import { ObliqueNavigation } from "./ObliqueNavigation";
import { message } from "antd";
import { downloadAsBlobAsync } from "./utils/imageUrls";
import {
  OBLIQUE_STATE_DEFAULT,
  ObliqueViewerActionsProvider,
  type ObliqueViewerActions,
} from "./oblique-actions";

beforeEach(() => {
  vi.mocked(downloadAsBlobAsync).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const series = [
  {
    id: "wuppertal-2024",
    label: "Wuppertal 2024",
    acquisitionMonth: 3,
    acquisitionYear: 2024,
    enabled: true,
    isLoading: false,
    error: null,
    imageCount: 120,
    availableCameraViews: ["front", "back", "left", "right"],
  },
  {
    id: "wuppertal-2026",
    label: "Wuppertal 2026",
    enabled: false,
    isLoading: false,
    error: null,
    imageCount: 30172,
    availableCameraViews: ["front", "back", "left", "right", "nadir"],
  },
];

const Harness = ({
  failure2026 = false,
  nadirActive = false,
  sendRequest = vi.fn(),
  downloadUrl = null,
  hasAcquisitionDate = true,
  showPanel = true,
  objectCoverageActive = false,
  downloadOptions = null,
}: {
  failure2026?: boolean;
  nadirActive?: boolean;
  sendRequest?: ReturnType<typeof vi.fn>;
  downloadUrl?: string | null;
  hasAcquisitionDate?: boolean;
  showPanel?: boolean;
  objectCoverageActive?: boolean;
  downloadOptions?: ObliqueViewerActions["downloadOptions"];
}) => {
  const [enabledSeriesIds, setEnabledSeriesIds] = useState(
    failure2026 ? [series[0].id, series[1].id] : [series[0].id]
  );
  const actions: ObliqueViewerActions = {
    ...OBLIQUE_STATE_DEFAULT,
    isOn: true,
    downloadUrl,
    downloadOptions,
    viewMode: objectCoverageActive
      ? "objectCoverage"
      : nadirActive
      ? "nadir"
      : "oblique",
    panelOpen: showPanel,
    canPan: true,
    isAllDataReady: !failure2026,
    selectedImageId: "wuppertal-2024::001_001_170003373",
    selectedSourceImageId: "001_001_170003373",
    selectedImageBearingDeg:
      324 as ObliqueViewerActions["selectedImageBearingDeg"],
    selectedSeriesId: series[0].id,
    enabledSeriesIds,
    series: series.map((entry) => ({
      ...entry,
      acquisitionMonth: hasAcquisitionDate ? entry.acquisitionMonth : undefined,
      acquisitionYear: hasAcquisitionDate ? entry.acquisitionYear : undefined,
      enabled: enabledSeriesIds.includes(entry.id),
      error:
        entry.id === series[1].id && failure2026
          ? "Metadaten 2026 fehlen"
          : null,
    })),
    label: "2024 · 001_001_170003373",
    publish: vi.fn(),
    setOn: vi.fn(),
    toggle: vi.fn(),
    setPanelOpen: vi.fn(),
    setEnabledSeriesIds,
    setPreviewQuality: vi.fn(),
    setBackdropLook: vi.fn(),
    resetLook: vi.fn(),
    sendRequest,
    clearRequest: vi.fn(),
  };
  return createElement(ObliqueViewerActionsProvider, {
    actions,
    children: createElement(
      Fragment,
      null,
      showPanel ? createElement(ObliquePanel) : null,
      createElement(ObliqueNavigation)
    ),
  });
};

describe("oblique series controls", () => {
  it("lets users enable either series, both, or none independently", () => {
    render(createElement(Harness));
    const select = screen.getByRole("listbox", {
      name: "Bildserien",
    }) as HTMLSelectElement;
    const selected = () =>
      Array.from(select.selectedOptions, (option) => option.value);
    const choose = (ids: string[]) => {
      Array.from(select.options).forEach((option) => {
        option.selected = ids.includes(option.value);
      });
      fireEvent.change(select);
    };
    expect(selected()).toEqual([series[0].id]);
    choose([series[0].id, series[1].id]);
    expect(selected()).toEqual([series[0].id, series[1].id]);
    choose([series[1].id]);
    expect(selected()).toEqual([series[1].id]);
    choose([]);
    expect(selected()).toEqual([]);
    expect(
      (
        screen.getByRole("button", {
          name: "Flug zum Bild",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.getByText("Keine Bildserie aktiviert")).toBeTruthy();
  });

  it("reports a failed 2026 series while a selected 2024 image remains usable", () => {
    render(createElement(Harness, { failure2026: true }));
    expect(
      screen.getByRole("button", { name: /Metadaten 2026 fehlen/ })
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Flug zum Bild",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    const select = screen.getByRole("listbox", {
      name: "Bildserien",
    }) as HTMLSelectElement;
    expect(
      Array.from(select.selectedOptions, (option) => option.value)
    ).toContain(series[0].id);
  });
});

describe("nadir navigation control", () => {
  it("offers nadir only when a capable series is enabled", () => {
    const sendRequest = vi.fn();
    render(createElement(Harness, { sendRequest }));
    expect(screen.queryByRole("button", { name: "Nadiransicht" })).toBeNull();
    const select = screen.getByRole("listbox", {
      name: "Bildserien",
    }) as HTMLSelectElement;
    select.options[1].selected = true;
    fireEvent.change(select);
    const button = screen.getByRole("button", { name: "Nadiransicht" });
    fireEvent.click(button);
    expect(sendRequest).toHaveBeenCalledWith({
      type: "setViewMode",
      mode: "nadir",
    });
    select.options[1].selected = false;
    fireEvent.change(select);
    expect(screen.queryByRole("button", { name: "Nadiransicht" })).toBeNull();
  });
  it("returns from nadir to oblique with the same control", () => {
    const sendRequest = vi.fn();
    render(
      createElement(Harness, {
        nadirActive: true,
        failure2026: true,
        sendRequest,
      })
    );
    const button = screen.getByRole("button", { name: "Nadiransicht" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(sendRequest).toHaveBeenCalledWith({
      type: "setViewMode",
      mode: "oblique",
    });
  });
});

describe("independent map navigation", () => {
  it("keeps the legacy compact controls usable while the information panel is closed", () => {
    const sendRequest = vi.fn();
    render(createElement(Harness, { showPanel: false, sendRequest }));
    expect(screen.queryByRole("listbox", { name: "Bildserien" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bild öffnen" })).toBeNull();
    const navigation = screen.getByRole("group", {
      name: "Schrägluftbild-Navigation",
    });
    const click = (name: string) =>
      fireEvent.click(within(navigation).getByRole("button", { name }));
    click("Gegen den Uhrzeigersinn drehen");
    click("Nächstes Bild nach vorn");
    click("Im Uhrzeigersinn drehen");
    click("Nächstes Bild nach links");
    click("Nächstes Bild nach hinten");
    click("Nächstes Bild nach rechts");
    click("Flug zum Bild");
    expect(sendRequest.mock.calls.map(([command]) => command)).toEqual([
      { type: "rotate", clockwise: false },
      { type: "pan", horizontal: 0, vertical: 1 },
      { type: "rotate", clockwise: true },
      { type: "pan", horizontal: -1, vertical: 0 },
      { type: "pan", horizontal: 0, vertical: -1 },
      { type: "pan", horizontal: 1, vertical: 0 },
      { type: "flyToImage" },
    ]);
    const forward = within(navigation).getByRole("button", {
      name: "Nächstes Bild nach vorn",
    });
    expect(forward.className).toContain("col-start-2 row-start-1");
    const back = within(navigation).getByRole("button", {
      name: "Nächstes Bild nach hinten",
    });
    expect(back.className).toContain("col-start-2 row-start-2");
    expect(forward.style.width).toBe("40px");
    expect(forward.style.height).toBe("40px");
  });

  it("keeps navigation outside the image information panel", () => {
    const view = render(createElement(Harness));
    const panel = view.container.querySelector<HTMLElement>(
      '[data-test-id="oblique-viewer"]'
    )!;
    expect(
      within(panel).queryByRole("button", { name: "Flug zum Bild" })
    ).toBeNull();
    expect(
      within(panel).getByRole("button", { name: "Bild öffnen" })
    ).toBeTruthy();
  });

  it("defers to the object coverage controls while camera commands are suspended", () => {
    render(createElement(Harness, { objectCoverageActive: true }));
    expect(
      screen.queryByRole("group", { name: "Schrägluftbild-Navigation" })
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Object Coverage" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});

describe("object coverage control", () => {
  it("requests object coverage and returns to oblique from an active toggle", () => {
    const sendRequest = vi.fn();
    const view = render(createElement(Harness, { sendRequest }));
    fireEvent.click(screen.getByRole("button", { name: "Object Coverage" }));
    expect(sendRequest).toHaveBeenLastCalledWith({
      type: "setViewMode",
      mode: "objectCoverage",
    });
    view.rerender(
      createElement(Harness, { sendRequest, objectCoverageActive: true })
    );
    const button = screen.getByRole("button", { name: "Object Coverage" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(sendRequest).toHaveBeenLastCalledWith({
      type: "setViewMode",
      mode: "oblique",
    });
  });
});

describe("image information, actions and acquisition precision", () => {
  it("offers the current original and feedback in the information panel", async () => {
    const url = "https://images.example/2026/RI_29_3398.tif";
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(createElement(Harness, { downloadUrl: url }));
    expect(screen.getByTitle("Bildrichtung").textContent).toBe("324°");
    fireEvent.click(screen.getByRole("button", { name: "Bild öffnen" }));
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    expect(downloadAsBlobAsync).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(screen.getByRole("button", { name: "Rückmeldung" })).toBeTruthy();
    expect(screen.queryByText("Helligkeit")).toBeNull();
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Herunterladen",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    );
  });
  it("shows only the verified month and year without inventing a capture day", () => {
    const view = render(createElement(Harness));
    expect(screen.getByText("März 2024").getAttribute("datetime")).toBe(
      "2024-03"
    );
    view.rerender(createElement(Harness, { hasAcquisitionDate: false }));
    expect(screen.queryByText("März 2024")).toBeNull();
  });
  it("disables downloads when the selected series is disabled", () => {
    render(
      createElement(Harness, {
        downloadUrl: "https://images.example/photo.jpg",
      })
    );
    const select = screen.getByRole("listbox", {
      name: "Bildserien",
    }) as HTMLSelectElement;
    Array.from(select.options).forEach((option) => {
      option.selected = false;
    });
    fireEvent.change(select);
    expect(
      (screen.getByRole("button", { name: "Bild öffnen" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Herunterladen",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.queryByText(/Aufnahme:/)).toBeNull();
  });

  it("passes TIFF export metadata and reports a rejected export without leaving the button busy", async () => {
    const failure =
      "Für dieses TIFF ist keine Download-Wasserzeichenvorlage konfiguriert.";
    vi.mocked(downloadAsBlobAsync).mockRejectedValueOnce(new Error(failure));
    const options = { tiff: true, nativeSize: { width: 10336, height: 7788 } };
    render(
      createElement(Harness, {
        downloadUrl: "https://images.example/photo.tif?signature=1",
        downloadOptions: options,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    expect(downloadAsBlobAsync).toHaveBeenCalledWith(
      "https://images.example/photo.tif?signature=1",
      expect.objectContaining({ ...options, signal: expect.any(AbortSignal) })
    );
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(failure));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Herunterladen",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    );
  });

  it("cancels an export without reporting an error", async () => {
    vi.mocked(downloadAsBlobAsync).mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError")
    );
    render(
      createElement(Harness, {
        downloadUrl: "https://images.example/photo.tif",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    const signal = vi.mocked(downloadAsBlobAsync).mock.lastCall?.[1]?.signal;
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Abbrechen" })).toBeNull()
    );
    expect(message.error).not.toHaveBeenCalled();
  });
});
