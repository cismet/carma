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
const mount = (
  patch: Partial<ObliqueViewerActions> = {},
  navigationProps: Parameters<typeof ObliqueNavigation>[0] = {}
) => {
  const sendRequest = vi.fn(),
    actions = {
      ...OBLIQUE_STATE_DEFAULT,
      isOn: true,
      isBusy: true,
      isLoading: true,
      isCatalogComplete: true,
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
  const navigation = (props: Parameters<typeof ObliqueNavigation>[0]) =>
    createElement(ObliqueViewerActionsProvider, {
      actions,
      children: createElement(ObliqueNavigation, props),
    });
  const view = render(navigation(navigationProps));
  return {
    sendRequest,
    rerenderNavigation: (props: Parameters<typeof ObliqueNavigation>[0]) =>
      view.rerender(navigation(props)),
  };
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
    expect(screen.queryByRole("status")).toBeNull();
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
  it("keeps current-slice pan available but disables held rotation targets until the full catalog is loaded", () => {
    const view = mount({ isAllDataReady: true, isCatalogComplete: false });
    const right = screen.getByRole("button", {
      name: "Nächstes Bild nach rechts",
    }) as HTMLButtonElement;
    const leftRotation = screen.getByRole("button", {
      name: "Gegen den Uhrzeigersinn drehen",
    }) as HTMLButtonElement;
    const rightRotation = screen.getByRole("button", {
      name: "Im Uhrzeigersinn drehen",
    }) as HTMLButtonElement;
    expect(right.disabled).toBe(false);
    expect(leftRotation.disabled).toBe(true);
    expect(rightRotation.disabled).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(right);
    fireEvent.click(rightRotation);
    expect(view.sendRequest).toHaveBeenCalledOnce();
    expect(view.sendRequest).toHaveBeenCalledWith({
      type: "pan",
      horizontal: 1,
      vertical: 0,
    });
  });

  it("leaves initial catalog loading to the host statusbar", () => {
    mount({ selectedImageId: null, selectedSeriesId: null });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("hides the global loading overlay as soon as the first catalog slice is usable", () => {
    mount({
      selectedImageId: null,
      selectedSeriesId: null,
      isLoading: true,
      isAllDataReady: true,
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("keeps settled availability while a new origin is being prepared and hides in object mode", () => {
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
    ).toBe(false);
    cleanup();
    mount({ viewMode: "objectCoverage" });
    expect(
      screen.queryByRole("group", { name: "Schrägluftbild-Navigation" })
    ).toBeNull();
  });
});

describe("host-owned loading status", () => {
  it.each([true, false])(
    "does not duplicate target-image loading above navigation (NG=%s)",
    (nextInterface) => {
      mount({ isTargetImageLoading: true }, { nextInterface });
      expect(screen.queryByText("Zielbild wird geladen …")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(
        (
          screen.getByRole("button", {
            name: "Nächstes Bild nach rechts",
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false);
    }
  );
});

describe("navigation preparation intent", () => {
  it("publishes pointer and focus independently without issuing a navigation command", () => {
    const warmNavigation = vi.fn();
    const { sendRequest } = mount({ warmNavigation });
    const button = screen.getByRole("button", {
      name: "Nächstes Bild nach rechts",
    });
    fireEvent.pointerEnter(button);
    fireEvent.focus(button);
    fireEvent.pointerLeave(button);
    fireEvent.blur(button);
    expect(warmNavigation.mock.calls).toEqual([
      ["right", true, "pointer"],
      ["right", true, "focus"],
      ["right", false, "pointer"],
      ["right", false, "focus"],
    ]);
    expect(sendRequest).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(sendRequest).toHaveBeenCalledWith({
      type: "pan",
      horizontal: 1,
      vertical: 0,
    });
  });
  it("prepares the matching rotation key while leaving the click command unchanged", () => {
    const warmNavigation = vi.fn();
    const { sendRequest } = mount({ warmNavigation });
    const button = screen.getByRole("button", {
      name: "Im Uhrzeigersinn drehen",
    });
    fireEvent.focus(button);
    expect(warmNavigation).toHaveBeenCalledWith("rotateRight", true, "focus");
    fireEvent.click(button);
    expect(sendRequest).toHaveBeenCalledWith({
      type: "rotate",
      clockwise: true,
    });
  });
});
