import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/AddonStateContext", () => ({
  useAddonState: (key: string) =>
    useState(
      key === "shadowTexture"
        ? {
            quality: "8k",
            mode: "hard",
            color: "#123456",
            intensity: 0.4,
            shadowOnly: false,
          }
        : { enabled: false, animationDaylightOnly: false }
    ),
}));

import { useShadowTextureWorkflow } from "./use-shadow-texture-workflow";

describe("unified shadow workflows", () => {
  it("toggles the map-backed shadow preset without companion layers", () => {
    const setBackground = vi.fn();
    const { result } = renderHook(() =>
      useShadowTextureWorkflow(true, setBackground)
    );
    act(() => result.current.toggle(true));
    expect(result.current.isActive(true)).toBe(true);
    expect(result.current.isActive(false)).toBe(false);
    act(() => result.current.toggle(true));
    expect(result.current.isActive(true)).toBe(false);
  });

  it("restores the previous background when the matching workflow is disabled", () => {
    const { result } = renderHook(() => {
      const [background, setBackground] = useState(true);
      return {
        background,
        ...useShadowTextureWorkflow(background, setBackground),
      };
    });
    act(() => result.current.toggle(false));
    expect(result.current.background).toBe(false);
    expect(result.current.isActive(false)).toBe(true);
    act(() => result.current.toggle(false));
    expect(result.current.background).toBe(true);
    expect(result.current.isActive(false)).toBe(false);
  });
});
