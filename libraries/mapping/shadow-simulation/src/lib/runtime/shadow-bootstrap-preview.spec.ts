import { describe, expect, it, vi } from "vitest";

import { createShadowBootstrapPreview } from "./shadow-bootstrap-preview";

describe("mesh shadow bootstrap preview", () => {
  it("waits for the shared caster demand, not just visible mesh readiness", () => {
    const preview = createShadowBootstrapPreview();
    const source = {
      providesTerrain: true,
      hasRenderableContent: vi.fn(() => true),
      getRequestDemand: vi.fn(() => 12),
    };
    expect(preview([source])).toBe(true);
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
          getRequestDemand: () => 0,
        },
      ])
    ).toBe(true);
    expect(preview([])).toBe(false);
    expect(
      preview([{ providesTerrain: false, getRequestDemand: () => 10 }])
    ).toBe(false);
  });
});
