import {
  createElement,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OBLIQUE_STATE_DEFAULT,
  ObliqueViewerActionsProvider,
  type ObliqueViewerActions,
} from "./oblique-actions";
import { ObliqueNavigation } from "./ObliqueNavigation";
vi.mock("antd", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Spin: () => null,
}));
vi.mock("@carma-mapping/map-controls-layout", () => ({
  ControlButtonStyler: ({
    width,
    height,
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    width?: string;
    height?: string;
  }) => createElement("button", props, children),
}));
const mount = (patch: Partial<ObliqueViewerActions> = {}) => {
  const sendRequest = vi.fn(),
    actions = {
      ...OBLIQUE_STATE_DEFAULT,
      isOn: true,
      isBusy: true,
      isLoading: true,
      error: "Preview404",
      selectedImageId: "current",
      selectedSeriesId: "series",
      series: [
        {
          id: "series",
          label: "Series",
          enabled: true,
          isLoading: true,
          error: null,
          imageCount: 20,
        },
      ],
      navigationTargets: {
        imageId: "current",
        images: {
          left: null,
          right: "next",
          up: "up",
          down: "down",
          rotateLeft: "rl",
          rotateRight: "rr",
        },
      },
      label: "Series",
      publish: vi.fn(),
      setOn: vi.fn(),
      toggle: vi.fn(),
      setPanelOpen: vi.fn(),
      setEnabledSeriesIds: vi.fn(),
      sendRequest,
      clearRequest: vi.fn(),
      ...patch,
    } as ObliqueViewerActions;
  render(
    createElement(ObliqueViewerActionsProvider, {
      actions,
      children: createElement(ObliqueNavigation, { nextInterface: false }),
    })
  );
  return { sendRequest };
};
afterEach(cleanup);
describe("geometry-only cached navigation controls", () => {
  it("allows a cached next camera during flight/loading/preview error and disables only a missing neighbor", () => {
    const view = mount();
    const right = screen.getByRole("button", {
        name: "Nächstes Bild nach rechts",
      }) as HTMLButtonElement,
      left = screen.getByRole("button", {
        name: "Nächstes Bild nach links",
      }) as HTMLButtonElement;
    expect(right.disabled).toBe(false);
    expect(left.disabled).toBe(true);
    fireEvent.click(right);
    expect(view.sendRequest).toHaveBeenCalledWith({
      type: "pan",
      horizontal: 1,
      vertical: 0,
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Flug zum Bild",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  });
  it("disables a stale origin and removes the group in object mode", () => {
    mount({
      navigationTargets: {
        imageId: "previous",
        images: {
          left: "l",
          right: "r",
          up: "u",
          down: "d",
          rotateLeft: "rl",
          rotateRight: "rr",
        },
      },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Nächstes Bild nach rechts",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    cleanup();
    mount({ viewMode: "objectCoverage" });
    expect(
      screen.queryByRole("group", { name: "Schrägluftbild-Navigation" })
    ).toBeNull();
  });
});
