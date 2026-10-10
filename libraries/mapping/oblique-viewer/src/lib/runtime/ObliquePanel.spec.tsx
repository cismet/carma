// @vitest-environment jsdom
import {
  createElement,
  Fragment,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
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
import { faCrosshairs } from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

vi.mock("./utils/preview-thumbnail-cache", () => ({
  reportPreviewSourceMissing: vi.fn(),
}));
vi.mock("antd", () => ({
  Button: ({
    children,
    icon,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) =>
    createElement("button", props, icon, children),
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Checkbox: ({ children, ...props }: InputHTMLAttributes<HTMLInputElement>) =>
    createElement(
      "label",
      null,
      createElement("input", { ...props, type: "checkbox" }),
      children
    ),
  Spin: () => null,
  message: { error: vi.fn() },
  Slider: () => createElement("input", { type: "range" }),
  Select: ({
    value,
    mode,
    options,
    onChange,
    className,
    style,
    placeholder,
    "data-test-id": dataTestId,
    ...props
  }: {
    value: string[] | string;
    mode?: "multiple";
    options: { value: string; label: ReactNode }[];
    onChange: (value: string[] | string) => void;
    "aria-label": string;
    className?: string;
    style?: CSSProperties;
    placeholder?: string;
    "data-test-id"?: string;
  }) =>
    createElement(
      Fragment,
      null,
      createElement(
        "select",
        {
          multiple: mode === "multiple",
          "aria-label": props["aria-label"],
          className,
          style,
          "data-test-id": dataTestId,
          "data-placeholder": placeholder,
          value,
          onChange: (event: { currentTarget: HTMLSelectElement }) =>
            onChange(
              mode === "multiple"
                ? Array.from(
                    event.currentTarget.selectedOptions,
                    (option) => option.value
                  )
                : event.currentTarget.value
            ),
        },
        options.map((option) =>
          createElement(
            "option",
            { key: option.value, value: option.value },
            typeof option.label === "string" ? option.label : option.value
          )
        )
      ),
      options
        .filter((option) => typeof option.label !== "string")
        .map((option) =>
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
import { reportPreviewSourceMissing } from "./utils/preview-thumbnail-cache";
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
  nextInterface = true,
  objectViewsAvailable = true,
  objectViewsIcon,
  hoverAvailable = false,
  previewVisible = false,
  publish = vi.fn(),
  initialSelectionStrategy = OBLIQUE_STATE_DEFAULT.selectionStrategy,
  missingPreviewImageId = null,
  previewError = null,
  referenceRayPitch = null,
}: {
  failure2026?: boolean;
  nadirActive?: boolean;
  sendRequest?: ReturnType<typeof vi.fn>;
  downloadUrl?: string | null;
  hasAcquisitionDate?: boolean;
  showPanel?: boolean;
  objectCoverageActive?: boolean;
  downloadOptions?: ObliqueViewerActions["downloadOptions"];
  nextInterface?: boolean;
  objectViewsAvailable?: boolean;
  objectViewsIcon?: IconDefinition;
  hoverAvailable?: boolean;
  previewVisible?: boolean;
  publish?: ReturnType<typeof vi.fn>;
  initialSelectionStrategy?: ObliqueViewerActions["selectionStrategy"];
  missingPreviewImageId?: string | null;
  previewError?: string | null;
  referenceRayPitch?: ObliqueViewerActions["referenceRayPitch"];
}) => {
  const [enabledSeriesIds, setEnabledSeriesIds] = useState(
    failure2026 ? [series[0].id, series[1].id] : [series[0].id]
  );
  const [selectionStrategy, setSelectionStrategy] = useState<
    ObliqueViewerActions["selectionStrategy"]
  >(initialSelectionStrategy);
  const [rotationSurface, setRotationSurface] = useState<
    ObliqueViewerActions["rotationSurface"]
  >(OBLIQUE_STATE_DEFAULT.rotationSurface);
  const [mapStyle3dEnabled, setMapStyle3dEnabled] = useState(
    OBLIQUE_STATE_DEFAULT.mapStyle3dEnabled
  );
  const [previewBasemapLabels, setPreviewBasemapLabels] = useState(
    OBLIQUE_STATE_DEFAULT.previewBasemapLabels
  );
  const [previewPoolDebug, setPreviewPoolDebug] = useState(
    OBLIQUE_STATE_DEFAULT.previewPoolDebug
  );
  const [previewCenterDebug, setPreviewCenterDebug] = useState(
    OBLIQUE_STATE_DEFAULT.previewCenterDebug
  );
  const [previewOpticalCenterDebug, setPreviewOpticalCenterDebug] = useState(
    OBLIQUE_STATE_DEFAULT.previewOpticalCenterDebug
  );
  const [previewScreenCenterDebug, setPreviewScreenCenterDebug] = useState(
    OBLIQUE_STATE_DEFAULT.previewScreenCenterDebug
  );
  const [previewHoverDrape, setPreviewHoverDrape] = useState(
    OBLIQUE_STATE_DEFAULT.previewHoverDrape
  );
  const [previewRotationDrape, setPreviewRotationDrape] = useState(
    OBLIQUE_STATE_DEFAULT.previewRotationDrape
  );
  const [previewUprightOnlyWhenCovered, setPreviewUprightOnlyWhenCovered] =
    useState(OBLIQUE_STATE_DEFAULT.previewUprightOnlyWhenCovered);
  const [previewSeamless, setPreviewSeamless] = useState(
    OBLIQUE_STATE_DEFAULT.previewSeamless
  );
  const [previewSeamlessMode, setPreviewSeamlessMode] = useState<
    ObliqueViewerActions["previewSeamlessMode"]
  >(OBLIQUE_STATE_DEFAULT.previewSeamlessMode);
  const [previewSeamlessCenterY, setPreviewSeamlessCenterY] = useState(
    OBLIQUE_STATE_DEFAULT.previewSeamlessCenterY
  );
  const actions: ObliqueViewerActions = {
    ...OBLIQUE_STATE_DEFAULT,
    missingPreviewImageId,
    referenceRayPitch,
    error: previewError,
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
    canOrbitCamera: true,
    navigationTargets: {
      imageId: "wuppertal-2024::001_001_170003373",
      images: {
        left: "left",
        right: "right",
        up: "up",
        down: "down",
        rotateLeft: "rotateLeft",
        rotateRight: "rotateRight",
      },
    },
    hoverAvailable,
    previewVisible,
    selectionStrategy,
    rotationSurface,
    mapStyle3dEnabled,
    previewBasemapLabels,
    previewRotationDrape,
    previewHoverDrape,
    previewCenterDebug,
    previewOpticalCenterDebug,
    previewScreenCenterDebug,
    previewPoolDebug,
    previewSeamless,
    previewSeamlessMode,
    previewUprightOnlyWhenCovered,
    previewSeamlessCenterY,
    isAllDataReady: !failure2026,
    isCatalogComplete: !failure2026,
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
    publish: (patch) => {
      publish(patch);
      if (patch.selectionStrategy)
        setSelectionStrategy(patch.selectionStrategy);
      if (patch.rotationSurface) setRotationSurface(patch.rotationSurface);
      if (patch.mapStyle3dEnabled !== undefined)
        setMapStyle3dEnabled(patch.mapStyle3dEnabled);
      if (patch.previewBasemapLabels !== undefined)
        setPreviewBasemapLabels(patch.previewBasemapLabels);
      if (patch.previewPoolDebug !== undefined)
        setPreviewPoolDebug(patch.previewPoolDebug);
      if (patch.previewCenterDebug !== undefined)
        setPreviewCenterDebug(patch.previewCenterDebug);
      if (patch.previewOpticalCenterDebug !== undefined)
        setPreviewOpticalCenterDebug(patch.previewOpticalCenterDebug);
      if (patch.previewScreenCenterDebug !== undefined)
        setPreviewScreenCenterDebug(patch.previewScreenCenterDebug);
      if (patch.previewHoverDrape !== undefined)
        setPreviewHoverDrape(patch.previewHoverDrape);
      if (patch.previewRotationDrape !== undefined)
        setPreviewRotationDrape(patch.previewRotationDrape);
      if (patch.previewSeamlessCenterY !== undefined)
        setPreviewSeamlessCenterY(patch.previewSeamlessCenterY);
      if (patch.previewUprightOnlyWhenCovered !== undefined)
        setPreviewUprightOnlyWhenCovered(patch.previewUprightOnlyWhenCovered);
      if (patch.previewSeamless !== undefined)
        setPreviewSeamless(patch.previewSeamless);
      if (patch.previewSeamlessMode !== undefined)
        setPreviewSeamlessMode(patch.previewSeamlessMode);
    },
    setOn: vi.fn(),
    toggle: vi.fn(),
    setPanelOpen: vi.fn(),
    setEnabledSeriesIds,
    sendRequest,
    clearRequest: vi.fn(),
  };
  return createElement(ObliqueViewerActionsProvider, {
    actions,
    children: createElement(
      Fragment,
      null,
      showPanel
        ? createElement(ObliquePanel, {
            nextInterface,
            extensions: objectViewsAvailable
              ? [
                  {
                    mode: "objectCoverage",
                    label: "Objektansichtenabfrage",
                    icon: objectViewsIcon,
                    Component: () => null,
                  },
                ]
              : [],
          })
        : null,
      createElement(ObliqueNavigation, { nextInterface })
    ),
  });
};

describe("oblique series controls", () => {
  it("shows object views only when both the next UI and its addon are enabled", () => {
    const { rerender } = render(
      createElement(Harness, {
        nextInterface: true,
        objectViewsAvailable: false,
      })
    );
    expect(
      screen.queryByRole("button", { name: "Objektansichtenabfrage" })
    ).toBeNull();
    rerender(
      createElement(Harness, {
        nextInterface: true,
        objectViewsAvailable: true,
      })
    );
    expect(
      screen.getByRole("button", { name: "Objektansichtenabfrage" })
    ).toBeDefined();
    rerender(
      createElement(Harness, {
        nextInterface: false,
        objectViewsAvailable: true,
      })
    );
    expect(
      screen.queryByRole("button", { name: "Objektansichtenabfrage" })
    ).toBeNull();
  });
  it("catalogue chip dispatches its dataset without changing selection or propagating events", () => {
    const sendRequest = vi.fn();
    render(createElement(Harness, { sendRequest, nextInterface: true }));
    const button = screen.getByRole("button", {
      name: "Wuppertal 2024 durchsuchen und filtern",
    });
    expect(button.getAttribute("data-series-id")).toBe("wuppertal-2024");
    expect(
      button.parentElement?.querySelector('[aria-label="120 Bilder"]')
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Wuppertal 2026 durchsuchen und filtern",
      })
    ).toBeNull();
    const bubble = vi.fn();
    for (const event of ["mousedown", "keydown", "click"])
      document.addEventListener(event, bubble);
    try {
      fireEvent.mouseDown(button);
      fireEvent.keyDown(button, { key: "Enter" });
      fireEvent.click(button);
      expect(bubble).not.toHaveBeenCalled();
    } finally {
      for (const event of ["mousedown", "keydown", "click"])
        document.removeEventListener(event, bubble);
    }
    expect(sendRequest).toHaveBeenCalledOnce();
    expect(sendRequest).toHaveBeenCalledWith({
      type: "browseCatalog",
      seriesId: "wuppertal-2024",
    });
    const selected = screen.getByRole("listbox", {
      name: "Bildserien",
    }) as HTMLSelectElement;
    expect([...selected.selectedOptions].map((option) => option.value)).toEqual(
      ["wuppertal-2024"]
    );
  });

  it("catalogue chip is absent from the classic interface", () => {
    render(createElement(Harness, { nextInterface: false }));
    expect(
      document.querySelector('[data-test-id="oblique-browse-catalog"]')
    ).toBeNull();
  });

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
    expect(select.getAttribute("data-placeholder")).toBe("Bildserie auswählen");
    expect(select.className).toContain("w-full");
    expect(
      document.querySelector('[data-test-id="oblique-viewer"]')?.className
    ).toContain("min-w-[min(320px,calc(100vw-1rem))]");
    expect(
      document.querySelector('[data-test-id="oblique-image-actions"]')
    ).toBeNull();
    // Clearing the last series keeps both manifest choices available for re-entry.
    expect(select.options).toHaveLength(2);
    choose([series[1].id]);
    expect(selected()).toEqual([series[1].id]);
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

describe("NG navigation capabilities", () => {
  it("keeps nadir out of the panel even after enabling a nadir-capable series", () => {
    const sendRequest = vi.fn();
    render(createElement(Harness, { sendRequest }));
    const select = screen.getByRole("listbox", {
      name: "Bildserien",
    }) as HTMLSelectElement;
    select.options[1].selected = true;
    fireEvent.change(select);
    expect(screen.queryByRole("button", { name: "Nadiransicht" })).toBeNull();
    expect(sendRequest).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Objektansichtenabfrage" })
    ).toBeTruthy();
  });
  it("does not alter an existing nadir state merely by rendering the simplified panel", () => {
    const sendRequest = vi.fn();
    render(
      createElement(Harness, {
        nadirActive: true,
        failure2026: true,
        sendRequest,
      })
    );
    expect(screen.queryByRole("button", { name: "Nadiransicht" })).toBeNull();
    expect(sendRequest).not.toHaveBeenCalled();
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
      within(panel).queryByRole("button", { name: "Bild öffnen" })
    ).toBeNull();
  });

  it("defers to the object coverage controls while camera commands are suspended", () => {
    render(createElement(Harness, { objectCoverageActive: true }));
    expect(
      screen.queryByRole("group", { name: "Schrägluftbild-Navigation" })
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Objektansichtenabfrage" })
        .getAttribute("aria-pressed")
    ).toBe("true");
  });
});

describe("object coverage control", () => {
  it("keeps an icon-only extension toggle accessible by its label", () => {
    const sendRequest = vi.fn();
    const view = render(
      createElement(Harness, {
        sendRequest,
        objectViewsIcon: faCrosshairs,
      })
    );
    const button = screen.getByRole("button", {
      name: "Objektansichtenabfrage",
    });
    expect(button.textContent).toBe("");
    expect(button.querySelector('svg[data-icon="crosshairs"]')).not.toBeNull();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(sendRequest).toHaveBeenLastCalledWith({
      type: "setViewMode",
      mode: "objectCoverage",
    });
    view.rerender(
      createElement(Harness, {
        sendRequest,
        objectViewsIcon: faCrosshairs,
        objectCoverageActive: true,
      })
    );
    const active = screen.getByRole("button", {
      name: "Objektansichtenabfrage",
    });
    expect(active.getAttribute("aria-pressed")).toBe("true");
    expect(active.textContent).toBe("");
    fireEvent.click(active);
    expect(sendRequest).toHaveBeenLastCalledWith({
      type: "setViewMode",
      mode: "oblique",
    });
  });

  it("retains the text label for extensions that do not supply an icon", () => {
    render(createElement(Harness));
    expect(
      screen.getByRole("button", {
        name: "Objektansichtenabfrage",
      }).textContent
    ).toBe("Objektansichtenabfrage");
  });

  it("requests object coverage and returns to oblique from an active toggle", () => {
    const sendRequest = vi.fn();
    const view = render(createElement(Harness, { sendRequest }));
    fireEvent.click(
      screen.getByRole("button", { name: "Objektansichtenabfrage" })
    );
    expect(sendRequest).toHaveBeenLastCalledWith({
      type: "setViewMode",
      mode: "objectCoverage",
    });
    view.rerender(
      createElement(Harness, { sendRequest, objectCoverageActive: true })
    );
    const button = screen.getByRole("button", {
      name: "Objektansichtenabfrage",
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(sendRequest).toHaveBeenLastCalledWith({
      type: "setViewMode",
      mode: "oblique",
    });
  });
});

describe("NG rotation anchor option", () => {
  it("offers surface and terrain references only in the next interface", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    const surface = screen.getByRole("group", {
      name: "Drehpunkt der Navigation",
    });
    const buttons = within(surface).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Oberfläche",
      "Gelände",
    ]);
    expect(
      buttons.map((button) => button.getAttribute("aria-pressed"))
    ).toEqual(["true", "false"]);
    fireEvent.click(within(surface).getByRole("button", { name: "Gelände" }));
    expect(publish).toHaveBeenCalledWith({ rotationSurface: "terrain" });
    expect(
      buttons.map((button) => button.getAttribute("aria-pressed"))
    ).toEqual(["false", "true"]);
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(
      screen.queryByRole("group", { name: "Drehpunkt der Navigation" })
    ).toBeNull();
  });
});

describe("NG rotation photo projection option", () => {
  it("defaults off, publishes both toggle values and stays hidden in classic", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    const option = screen.getByRole("checkbox", {
      name: "Foto bei Navigation drapieren",
    }) as HTMLInputElement;
    expect(option.checked).toBe(false);
    fireEvent.click(option);
    expect(option.checked).toBe(true);
    expect(publish).toHaveBeenLastCalledWith({
      previewRotationDrape: true,
      previewSeamless: false,
    });
    fireEvent.click(option);
    expect(option.checked).toBe(false);
    expect(publish).toHaveBeenLastCalledWith({ previewRotationDrape: false });
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(
      screen.queryByRole("checkbox", { name: "Foto bei Navigation drapieren" })
    ).toBeNull();
  });
});

describe("NG hover photo projection option", () => {
  it("defaults off, publishes both toggle values and stays hidden in classic", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    const option = screen.getByRole("checkbox", {
      name: "Hover-Foto",
    }) as HTMLInputElement;
    expect(option.checked).toBe(false);
    fireEvent.click(option);
    expect(option.checked).toBe(true);
    expect(publish).toHaveBeenLastCalledWith({
      previewHoverDrape: true,
      previewSeamless: false,
    });
    fireEvent.click(option);
    expect(option.checked).toBe(false);
    expect(publish).toHaveBeenLastCalledWith({ previewHoverDrape: false });
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(screen.queryByRole("checkbox", { name: "Hover-Foto" })).toBeNull();
  });
});

describe("NG image center debugging option", () => {
  it("keeps optical and projected centers independent, with inline symbols and its own debug slider", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    const summary = screen.getByText("Debug", { selector: "summary" });
    fireEvent.click(summary);
    const group = screen.getByRole("group", { name: "Bildzentren" });
    expect(summary.parentElement?.contains(group)).toBe(true);
    const optical = within(group).getByRole("checkbox", {
      name: "Bildhauptpunkt",
    }) as HTMLInputElement;
    const projected = within(group).getByRole("checkbox", {
      name: "Bildmitte",
    }) as HTMLInputElement;
    expect(optical.checked).toBe(false);
    expect(projected.checked).toBe(false);
    const paths = Array.from(group.querySelectorAll("svg path"));
    expect(paths.map((path) => path.getAttribute("stroke"))).toEqual([
      "#61ff9a",
      "#ae94ff",
    ]);
    expect(paths.map((path) => path.getAttribute("d"))).toEqual([
      "M2 7h10M7 2v10",
      "m3 3 8 8m-8 0 8-8",
    ]);
    expect(
      within(group).getByRole("slider", {
        name: "Referenzstrahl vertikal",
      })
    ).toBeTruthy();
    fireEvent.click(optical);
    expect(publish).toHaveBeenLastCalledWith({
      previewCenterDebug: true,
      previewOpticalCenterDebug: true,
      previewScreenCenterDebug: false,
    });
    expect(projected.checked).toBe(false);
    fireEvent.click(projected);
    fireEvent.click(optical);
    expect(publish).toHaveBeenLastCalledWith({
      previewCenterDebug: true,
      previewOpticalCenterDebug: false,
      previewScreenCenterDebug: true,
    });
    expect(projected.checked).toBe(true);
    fireEvent.click(projected);
    expect(publish).toHaveBeenLastCalledWith({
      previewCenterDebug: false,
      previewOpticalCenterDebug: false,
      previewScreenCenterDebug: false,
    });
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(screen.queryByRole("group", { name: "Bildzentren" })).toBeNull();
  });
});

describe("reference ray pitch readout", () => {
  const imageId = "wuppertal-2024::001_001_170003373";
  const readout = () => screen.getByLabelText("Referenzstrahl Pitch");
  it.each([
    [39.74, "Δ Pitch -5,3° · Pitch 39,7°"],
    [50.26, "Δ Pitch +5,3° · Pitch 50,3°"],
    [45, "Δ Pitch 0,0° · Pitch 45,0°"],
  ])(
    "formats signed delta and effective pitch %s in German",
    (pitchDeg, text) => {
      render(
        createElement(Harness, {
          referenceRayPitch: {
            imageId,
            centerY: 0.3,
            centerPitchDeg: 45,
            pitchDeg,
          },
        })
      );
      expect(readout().textContent).toBe(text);
      expect(readout().getAttribute("title")).toBe(
        "001_001_170003373: Mittelstrahl 45,0°"
      );
    }
  );
  it.each([
    null,
    {
      imageId: "another-image",
      centerY: 0.3,
      centerPitchDeg: 45,
      pitchDeg: 50,
    },
    { imageId, centerY: 0.7, centerPitchDeg: 45, pitchDeg: 50 },
    { imageId, centerY: 0.3, centerPitchDeg: NaN, pitchDeg: 50 },
    { imageId, centerY: 0.3, centerPitchDeg: 45, pitchDeg: Infinity },
  ])("shows no stale or invalid angles: %j", (referenceRayPitch) => {
    render(createElement(Harness, { referenceRayPitch }));
    expect(readout().textContent).toBe("Δ Pitch — · Pitch —");
  });
  it("hides the old angle immediately on slider change until the matching result arrives", () => {
    const view = render(
      createElement(Harness, {
        referenceRayPitch: {
          imageId,
          centerY: 0.3,
          centerPitchDeg: 45,
          pitchDeg: 39.7,
        },
      })
    );
    fireEvent.change(
      screen.getByRole("slider", { name: "Referenzstrahl vertikal" }),
      { target: { value: "0.5" } }
    );
    expect(readout().textContent).toBe("Δ Pitch — · Pitch —");
    view.rerender(
      createElement(Harness, {
        referenceRayPitch: {
          imageId,
          centerY: 0.5,
          centerPitchDeg: 45,
          pitchDeg: 45,
        },
      })
    );
    expect(readout().textContent).toBe("Δ Pitch 0,0° · Pitch 45,0°");
  });
});

describe("NG seamless navigation option", () => {
  it("offers handover and mosaic only in seamless NG, with upright coverage restricted to handover", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    expect(screen.queryByRole("group", { name: "Nahtlos-Modus" })).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Nahtlos", exact: true })
    );
    const mode = screen.getByRole("group", { name: "Nahtlos-Modus" });
    const handover = within(mode).getByRole("button", { name: "Bildwechsel" });
    const mosaic = within(mode).getByRole("button", {
      name: "Flächig projizieren",
    });
    expect(handover.getAttribute("aria-pressed")).toBe("true");
    expect(mosaic.getAttribute("aria-pressed")).toBe("false");
    expect(
      screen.getByRole("checkbox", { name: "Aufrichten nur bildfüllend" })
    ).toBeTruthy();
    fireEvent.click(mosaic);
    expect(publish).toHaveBeenLastCalledWith({ previewSeamlessMode: "mosaic" });
    expect(mosaic.getAttribute("aria-pressed")).toBe("true");
    expect(handover.getAttribute("aria-pressed")).toBe("false");
    expect(
      screen.queryByRole("checkbox", { name: "Aufrichten nur bildfüllend" })
    ).toBeNull();
    fireEvent.click(handover);
    expect(publish).toHaveBeenLastCalledWith({
      previewSeamlessMode: "handover",
    });
    expect(
      screen.getByRole("checkbox", { name: "Aufrichten nur bildfüllend" })
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Nahtlos", exact: true })
    );
    expect(screen.queryByRole("group", { name: "Nahtlos-Modus" })).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Nahtlos", exact: true })
    );
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(screen.queryByRole("group", { name: "Nahtlos-Modus" })).toBeNull();
  });
  it("keeps the debug centre slider independent of seamless and individual marker toggles", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    const group = screen.getByRole("group", { name: "Bildzentren" });
    const slider = within(group).getByRole("slider", {
      name: "Referenzstrahl vertikal",
    }) as HTMLInputElement;
    expect(slider.value).toBe("0.3");
    expect(slider.min).toBe("0.1");
    expect(slider.max).toBe("0.9");
    const seamless = screen.getByRole("checkbox", {
      name: "Nahtlos",
      exact: true,
    }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0.7" } });
    expect(publish).toHaveBeenLastCalledWith({ previewSeamlessCenterY: 0.7 });
    expect(seamless.checked).toBe(false);
    fireEvent.click(seamless);
    expect(within(group).getByRole("slider")).toBe(slider);
    fireEvent.click(screen.getByRole("checkbox", { name: "Bildhauptpunkt" }));
    expect(slider.value).toBe("0.7");
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(screen.queryByRole("slider")).toBeNull();
  });
  it("is opt-in, publishes both values and stays hidden in classic", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    const option = screen.getByRole("checkbox", {
      name: "Nahtlos",
    }) as HTMLInputElement;
    expect(option.checked).toBe(false);
    fireEvent.click(option);
    expect(option.checked).toBe(true);
    expect(publish).toHaveBeenLastCalledWith({
      previewSeamless: true,
      previewHoverDrape: false,
      previewRotationDrape: false,
    });
    fireEvent.click(option);
    expect(option.checked).toBe(false);
    expect(publish).toHaveBeenLastCalledWith({ previewSeamless: false });
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(screen.queryByRole("checkbox", { name: "Nahtlos" })).toBeNull();
  });
});

describe("image information, actions and acquisition precision", () => {
  it("keeps image actions and series selection without quality or color controls", () => {
    render(
      createElement(Harness, {
        downloadUrl: "https://images.example/photo.jpg",
      })
    );
    const seriesSelect = screen.getByRole("listbox", {
      name: "Bildserien",
    }) as HTMLSelectElement;
    expect(seriesSelect.style.maxWidth).toBe("100%");
    expect(seriesSelect.className).toContain("w-full");
    expect(seriesSelect.className).not.toContain("flex-1");
    expect(screen.getByRole("button", { name: "Bild öffnen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rückmeldung" })).toBeTruthy();
    expect(screen.getAllByRole("slider")).toEqual([
      within(screen.getByRole("group", { name: "Bildzentren" })).getByRole(
        "slider"
      ),
    ]);
    expect(
      screen.queryByRole("button", { name: "Weitere Einstellungen" })
    ).toBeNull();
    for (const label of [
      "Qualität",
      "Standard",
      "HQ",
      "Helligkeit",
      "Kontrast",
      "Sättigung",
    ])
      expect(screen.queryByText(label)).toBeNull();
  });

  it("hides unavailable open/download buttons instead of showing them disabled", () => {
    render(createElement(Harness));
    expect(screen.queryByRole("button", { name: "Bild öffnen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Herunterladen" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rückmeldung" })).toBeTruthy();
  });

  it("offers the current original and feedback in the information panel", async () => {
    const url = "https://images.example/2026/RI_29_3398.tif";
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(createElement(Harness, { downloadUrl: url }));
    expect(screen.queryByTitle("Bildrichtung")).toBeNull();
    expect(screen.queryByTitle("001_001_170003373")).toBeNull();
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
  it("leaves image metadata to the layer title without a second information row", () => {
    render(createElement(Harness));
    const panel = document.querySelector(
      '[data-test-id="oblique-viewer"]'
    ) as HTMLElement;
    expect(panel.querySelector("time")).toBeNull();
    expect(within(panel).queryByText("März 2024")).toBeNull();
    expect(within(panel).queryByText("001_001_170003373")).toBeNull();
  });
  it("hides image actions when the selected series is disabled", () => {
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
    expect(screen.queryByRole("button", { name: "Bild öffnen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Herunterladen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rückmeldung" })).toBeNull();
    expect(
      document.querySelector('[data-test-id="oblique-image-actions"]')
    ).toBeNull();
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

describe("classic and next interface capabilities", () => {
  it("keeps the flight button in the classic interface even on a hover-capable device and hides experimental modes", () => {
    const sendRequest = vi.fn();
    render(
      createElement(Harness, {
        nextInterface: false,
        hoverAvailable: true,
        failure2026: true,
        sendRequest,
      })
    );
    expect(screen.queryByRole("button", { name: "Nadiransicht" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Objektansichtenabfrage" })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Flug zum Bild" }));
    expect(sendRequest).toHaveBeenCalledWith({ type: "flyToImage" });
    expect(
      screen.queryByRole("group", { name: "Footprint-Auswahl" })
    ).toBeNull();
  });

  it("offers next-interface modes while hover-capable devices replace the flight button with pointer picking", () => {
    render(
      createElement(Harness, {
        nextInterface: true,
        hoverAvailable: true,
        failure2026: true,
      })
    );
    expect(
      screen.getByRole("button", { name: "Objektansichtenabfrage" })
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Nadiransicht" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Flug zum Bild" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Nächstes Bild nach vorn" })
    ).toBeTruthy();
  });

  it("retains flight for touch and keeps the preview exit available with hover", () => {
    const view = render(
      createElement(Harness, { nextInterface: true, hoverAvailable: false })
    );
    expect(screen.getByRole("button", { name: "Flug zum Bild" })).toBeTruthy();
    view.rerender(
      createElement(Harness, {
        nextInterface: true,
        hoverAvailable: true,
        previewVisible: true,
      })
    );
    expect(
      screen.getByRole("button", { name: "Vorschau beenden" })
    ).toBeTruthy();
  });

  it("offers no nearest-axis or best-resolution controls in either interface", () => {
    const view = render(
      createElement(Harness, {
        nextInterface: false,
        initialSelectionStrategy: "best-resolution",
      })
    );
    for (const nextInterface of [false, true]) {
      view.rerender(createElement(Harness, { nextInterface }));
      expect(
        screen.queryByRole("group", { name: "Footprint-Auswahl" })
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Nächste Bildachse" })
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Beste Pixelauflösung" })
      ).toBeNull();
    }
    const selection = screen.getByRole("listbox", {
      name: "Bildserien",
    }) as HTMLSelectElement;
    expect(
      Array.from(selection.selectedOptions, (option) => option.value)
    ).toEqual([series[0].id]);
  });
});

describe("known missing preview warning", () => {
  it("shows a compact warning while every prepared map navigation/flight control stays enabled", () => {
    render(
      createElement(Harness, {
        missingPreviewImageId: "wuppertal-2024::001_001_170003373",
        downloadUrl: "https://images.example/photo.avif",
      })
    );
    expect(
      screen.getByText("Vorschaubild derzeit nicht verfügbar.")
    ).toBeTruthy();
    const navigation = screen.getByRole("group", {
      name: "Schrägluftbild-Navigation",
    });
    for (const button of within(navigation).getAllByRole("button"))
      expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Bild öffnen" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(
      (
        screen.getByRole("button", {
          name: "Herunterladen",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  });
  it("does not warn for a stale qualified image or infer missing from a generic preview error", () => {
    const view = render(
      createElement(Harness, {
        missingPreviewImageId: "wuppertal-2026::001_001_170003373",
      })
    );
    expect(
      screen.queryByText("Vorschaubild derzeit nicht verfügbar.")
    ).toBeNull();
    view.rerender(
      createElement(Harness, {
        previewError: "Das Bild konnte nicht dekodiert werden.",
      })
    );
    expect(
      screen.queryByText("Vorschaubild derzeit nicht verfügbar.")
    ).toBeNull();
    expect(
      screen.getByText("Das Bild konnte nicht dekodiert werden.")
    ).toBeTruthy();
  });
});

describe("direct download transport failures", () => {
  it("turns the actual AVIF404 into a friendly error, releases the button and reports only the captured old source without a probe", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(downloadAsBlobAsync).mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        })
    );
    const oldUrl = "https://images.example/old-source.avif",
      newUrl = "https://images.example/new-source.avif";
    const view = render(
      createElement(Harness, {
        downloadUrl: oldUrl,
        downloadOptions: { avif: true },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    expect(downloadAsBlobAsync).toHaveBeenCalledOnce();
    expect(downloadAsBlobAsync).toHaveBeenCalledWith(
      oldUrl,
      expect.objectContaining({ avif: true, signal: expect.any(AbortSignal) })
    );
    expect(reportPreviewSourceMissing).not.toHaveBeenCalled();
    view.rerender(
      createElement(Harness, {
        downloadUrl: newUrl,
        downloadOptions: { avif: true },
      })
    );
    reject(
      new Error("AVIF requires HTTP 206; refusing 404 full-file response")
    );
    await waitFor(() =>
      expect(message.error).toHaveBeenCalledWith(
        "Das Bild ist derzeit nicht verfügbar."
      )
    );
    expect(reportPreviewSourceMissing).toHaveBeenCalledOnce();
    expect(reportPreviewSourceMissing).toHaveBeenCalledWith({
      previewPath: "",
      imageId: "001_001_170003373",
      avifPyramidUrl: oldUrl,
      avifOnly: true,
    });
    expect(downloadAsBlobAsync).toHaveBeenCalledOnce();
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
  it("keeps a friendly generic network error unchanged without marking a missing image and still releases the button", async () => {
    const friendly = "Netzwerkverbindung unterbrochen.";
    vi.mocked(downloadAsBlobAsync).mockRejectedValueOnce(new Error(friendly));
    render(
      createElement(Harness, {
        downloadUrl: "https://images.example/current.avif",
        downloadOptions: { avif: true },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(friendly));
    expect(reportPreviewSourceMissing).not.toHaveBeenCalled();
    expect(downloadAsBlobAsync).toHaveBeenCalledOnce();
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
});

describe("NG image pool debugging option", () => {
  it("is opt-in inside center debug, publishes toggles and stays hidden in classic", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    expect(screen.queryByRole("checkbox", { name: "Bildpool" })).toBeNull();
    fireEvent.click(screen.getByText("Debug", { selector: "summary" }));
    const debug = screen.getByRole("checkbox", { name: "Bildhauptpunkt" });
    fireEvent.click(debug);
    const pool = screen.getByRole("checkbox", {
      name: "Bildpool",
    }) as HTMLInputElement;
    expect(pool.checked).toBe(false);
    fireEvent.click(pool);
    expect(pool.checked).toBe(true);
    expect(publish).toHaveBeenLastCalledWith({ previewPoolDebug: true });
    fireEvent.click(pool);
    expect(pool.checked).toBe(false);
    expect(publish).toHaveBeenLastCalledWith({ previewPoolDebug: false });
    fireEvent.click(pool);
    fireEvent.click(debug);
    expect(screen.queryByRole("checkbox", { name: "Bildpool" })).toBeNull();
    fireEvent.click(debug);
    expect(
      (screen.getByRole("checkbox", { name: "Bildpool" }) as HTMLInputElement)
        .checked
    ).toBe(true);
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(screen.queryByRole("checkbox", { name: "Bildpool" })).toBeNull();
  });
});

describe("NG coverage-only upright option", () => {
  it("defaults off, publishes both values and requires NG seamless mode", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    expect(
      screen.queryByRole("checkbox", { name: "Aufrichten nur bildfüllend" })
    ).toBeNull();
    const seamless = screen.getByRole("checkbox", { name: "Nahtlos" });
    fireEvent.click(seamless);
    const option = screen.getByRole("checkbox", {
      name: "Aufrichten nur bildfüllend",
    }) as HTMLInputElement;
    expect(option.checked).toBe(false);
    fireEvent.click(option);
    expect(option.checked).toBe(true);
    expect(publish).toHaveBeenLastCalledWith({
      previewUprightOnlyWhenCovered: true,
    });
    fireEvent.click(option);
    expect(option.checked).toBe(false);
    expect(publish).toHaveBeenLastCalledWith({
      previewUprightOnlyWhenCovered: false,
    });
    fireEvent.click(option);
    fireEvent.click(seamless);
    expect(
      screen.queryByRole("checkbox", { name: "Aufrichten nur bildfüllend" })
    ).toBeNull();
    fireEvent.click(seamless);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Aufrichten nur bildfüllend",
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(
      screen.queryByRole("checkbox", { name: "Aufrichten nur bildfüllend" })
    ).toBeNull();
  });
});

describe("NG optional map style and exclusive photo modes", () => {
  it("defaults 3D styling off and preserves the nested label preference when its parent is disabled", () => {
    const publish = vi.fn();
    const view = render(createElement(Harness, { publish }));
    const style = screen.getByRole("checkbox", {
      name: "3D-Kartenstil",
    }) as HTMLInputElement;
    const labels = screen.getByRole("checkbox", {
      name: "Beschriftung",
    }) as HTMLInputElement;
    expect(style.checked).toBe(false);
    expect(labels.disabled).toBe(true);
    expect(labels.checked).toBe(true);
    fireEvent.click(style);
    expect(publish).toHaveBeenLastCalledWith({ mapStyle3dEnabled: true });
    expect(labels.disabled).toBe(false);
    fireEvent.click(labels);
    expect(labels.checked).toBe(false);
    fireEvent.click(style);
    expect(labels.disabled).toBe(true);
    expect(labels.checked).toBe(false);
    fireEvent.click(style);
    expect(labels.disabled).toBe(false);
    expect(labels.checked).toBe(false);
    view.rerender(createElement(Harness, { publish, nextInterface: false }));
    expect(
      screen.queryByRole("checkbox", { name: "3D-Kartenstil" })
    ).toBeNull();
  });

  it("switches explicitly between normal photo options and seamless without contradictory patches", () => {
    const publish = vi.fn();
    render(createElement(Harness, { publish }));
    const hover = screen.getByRole("checkbox", {
      name: "Hover-Foto",
    }) as HTMLInputElement;
    const drape = screen.getByRole("checkbox", {
      name: "Foto bei Navigation drapieren",
    }) as HTMLInputElement;
    const seamless = screen.getByRole("checkbox", {
      name: "Nahtlos",
      exact: true,
    }) as HTMLInputElement;
    fireEvent.click(hover);
    fireEvent.click(drape);
    expect(hover.checked && drape.checked).toBe(true);
    fireEvent.click(seamless);
    expect(publish).toHaveBeenLastCalledWith({
      previewSeamless: true,
      previewHoverDrape: false,
      previewRotationDrape: false,
    });
    expect(seamless.checked).toBe(true);
    expect(hover.checked || drape.checked).toBe(false);
    fireEvent.click(hover);
    expect(seamless.checked).toBe(false);
    expect(hover.checked).toBe(true);
    fireEvent.click(seamless);
    fireEvent.click(drape);
    expect(seamless.checked).toBe(false);
    expect(drape.checked).toBe(true);
  });
});
