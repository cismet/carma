// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LayerState } from "../types";
import { useShareUrl } from "./useShareUrl";

const layerState = {
  layers: [{ id: "layer-1" }],
  backgroundLayer: { id: "background" },
  selectedByCategory: {},
} as unknown as LayerState;

const fetchMock = vi.fn();

const storedConfig = async (
  extraConfig?: () => Record<string, unknown> | undefined
) => {
  const { result } = renderHook(() => useShareUrl());
  await result.current.copyShareId({ layerState, extraConfig });
  return JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<
    string,
    unknown
  >;
};

describe("useShareUrl", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ json: async () => ({ key: "share-key" }) });
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the layers, the view and the selection when there is no extra configuration", async () => {
    const config = await storedConfig();

    expect(Object.keys(config)).toEqual(["backgroundLayer", "layers", "view"]);
    expect(config.layers).toEqual(layerState.layers);
  });

  it("adds the sections of the extra configuration", async () => {
    const config = await storedConfig(() => ({ measurements3d: { a: 1 } }));

    expect(config.measurements3d).toEqual({ a: 1 });
    expect(config.layers).toEqual(layerState.layers);
  });

  it("never lets the extra configuration replace the layers, the view or the background", async () => {
    const config = await storedConfig(() => ({
      layers: "replaced",
      view: "replaced",
      backgroundLayer: "replaced",
    }));

    expect(config.layers).toEqual(layerState.layers);
    expect(config.view).not.toBe("replaced");
    expect(config.backgroundLayer).not.toBe("replaced");
  });
});
