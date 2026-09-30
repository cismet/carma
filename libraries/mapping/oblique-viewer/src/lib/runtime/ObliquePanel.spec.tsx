// @vitest-environment jsdom
import { createElement, useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("antd", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Slider: () => null,
}));
vi.mock("@carma-mapping/components", () => ({ ContactMailButton: () => null }));
vi.mock("./utils/imageUrls", () => ({ downloadAsBlobAsync: vi.fn() }));
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
import {
  OBLIQUE_STATE_DEFAULT,
  ObliqueViewerActionsProvider,
  type ObliqueViewerActions,
} from "./oblique-actions";

afterEach(cleanup);

const series = [
  {
    id: "wuppertal-2024",
    label: "Wuppertal 2024",
    enabled: true,
    isLoading: false,
    error: null,
    imageCount: 120,
  },
  {
    id: "wuppertal-2026",
    label: "Wuppertal 2026",
    enabled: false,
    isLoading: false,
    error: null,
    imageCount: 41,
  },
];

const Harness = ({ failure2026 = false }: { failure2026?: boolean }) => {
  const [enabledSeriesIds, setEnabledSeriesIds] = useState(
    failure2026 ? [series[0].id, series[1].id] : [series[0].id]
  );
  const actions: ObliqueViewerActions = {
    ...OBLIQUE_STATE_DEFAULT,
    isOn: true,
    isAllDataReady: !failure2026,
    selectedImageId: "wuppertal-2024::001_001_170003373",
    selectedSourceImageId: "001_001_170003373",
    selectedSeriesId: series[0].id,
    enabledSeriesIds,
    series: series.map((entry) => ({
      ...entry,
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
    sendRequest: vi.fn(),
    clearRequest: vi.fn(),
  };
  return createElement(ObliqueViewerActionsProvider, {
    actions,
    children: createElement(ObliquePanel),
  });
};

describe("oblique series controls", () => {
  it("lets users enable either series, both, or none independently", () => {
    render(createElement(Harness));
    const image2024 = screen.getByRole("checkbox", {
      name: /Wuppertal 2024/,
    }) as HTMLInputElement;
    const image2026 = screen.getByRole("checkbox", {
      name: /Wuppertal 2026/,
    }) as HTMLInputElement;
    expect(image2024.checked).toBe(true);
    expect(image2026.checked).toBe(false);
    fireEvent.click(image2026);
    expect(image2024.checked && image2026.checked).toBe(true);
    fireEvent.click(image2024);
    expect(image2024.checked).toBe(false);
    expect(image2026.checked).toBe(true);
    fireEvent.click(image2026);
    expect(image2024.checked || image2026.checked).toBe(false);
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
    expect(screen.getByText("Metadaten 2026 fehlen")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Flug zum Bild",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(
      (
        screen.getByRole("checkbox", {
          name: /Wuppertal 2024/,
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
  });
});
