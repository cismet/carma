// @vitest-environment jsdom
import type { MouseEventHandler, ReactNode } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isReady: true,
  isTransitioning: false,
  isPreparingCesiumTransition: false,
  isLeaflet: true,
  toggle: vi.fn(),
}));

vi.mock("./MapFrameworkSwitcherContext", () => ({
  useMapFrameworkSwitcherContext: () => state,
}));
vi.mock("antd", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@carma-mapping/map-controls-layout", () => ({
  ControlButtonStyler: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick: MouseEventHandler<HTMLButtonElement>;
    disabled: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { MapFrameworkSwitcher } from "./MapFrameworkSwitcher";

beforeEach(() => {
  state.isReady = true;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("framework navigation preparation", () => {
  it.each([false, true])(
    "waits for preview cleanup before switching (override: %s)",
    async (override) => {
      let finishCleanup!: () => void;
      const preparation = new Promise<void>((resolve) => {
        finishCleanup = resolve;
      });
      const beforeToggle = vi.fn(() => preparation);
      const customToggle = vi.fn();
      const { getByRole } = render(
        <MapFrameworkSwitcher
          onBeforeToggle={beforeToggle}
          onToggleOverride={override ? customToggle : undefined}
        />
      );
      fireEvent.click(getByRole("button"));
      expect(beforeToggle).toHaveBeenCalledOnce();
      expect(state.toggle).not.toHaveBeenCalled();
      expect(customToggle).not.toHaveBeenCalled();
      await act(async () => {
        finishCleanup();
        await preparation;
      });
      expect(override ? customToggle : state.toggle).toHaveBeenCalledOnce();
      expect(override ? state.toggle : customToggle).not.toHaveBeenCalled();
    }
  );

  it("does not bypass the readiness gate when preparation is supplied", () => {
    state.isReady = false;
    const beforeToggle = vi.fn();
    const { getByRole } = render(
      <MapFrameworkSwitcher onBeforeToggle={beforeToggle} />
    );
    fireEvent.click(getByRole("button"));
    expect(beforeToggle).not.toHaveBeenCalled();
    expect(state.toggle).not.toHaveBeenCalled();
  });
});
