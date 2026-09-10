import { describe, expect, it, vi } from "vitest";

import { createShadowBootstrapPreview } from "./shadow-bootstrap-preview";

describe("mesh shadow bootstrap preview", () => {
  it("starts corridors with available content without waiting for global demand", () => {
    const preview = createShadowBootstrapPreview();
    const source = {
      providesTerrain: true,
      hasRenderableContent: vi.fn(() => true),
      getRequestDemand: vi.fn(() => 12),
    };
    expect(preview([source])).toBe(false);
    expect(source.getRequestDemand).not.toHaveBeenCalled();
    source.getRequestDemand.mockReturnValue(0);
    expect(preview([source])).toBe(false);
    source.hasRenderableContent.mockReturnValue(false);
    source.getRequestDemand.mockReturnValue(20);
    expect(preview([source])).toBe(false);
    expect(preview([{ ...source }])).toBe(true);
  });

  it("does not complete a not-yet-initialized mesh on an empty queue", () => {
    const preview = createShadowBootstrapPreview();
    expect(
      preview([
        {
          providesTerrain: true,
          hasRenderableContent: () => false,
        },
      ])
    ).toBe(true);
    expect(preview([])).toBe(false);
    expect(preview([{ providesTerrain: false }])).toBe(false);
  });

  it("does not let an empty second source block an available corridor", () => {
    const preview = createShadowBootstrapPreview();
    const pending = {
      providesTerrain: true,
      hasRenderableContent: () => false,
    };
    const available = {
      providesTerrain: true,
      hasRenderableContent: () => true,
    };
    expect(preview([pending, available])).toBe(false);
    expect(preview([available, pending])).toBe(false);
  });
});
