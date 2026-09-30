import { describe, expect, it } from "vitest";
import { getViewportPanelLayout } from "./viewport-panel-layout";

const input = {
  width: 1200,
  height: 800,
  sizes: { left: 288, top: 160, right: 288, bottom: 160 },
  enabled: { left: true, top: false, right: false, bottom: false },
};
describe("viewport panel occlusion", () => {
  it("includes both outer gaps and leaves disabled sides at zero", () => {
    expect(getViewportPanelLayout(input).padding).toEqual({
      left: 320,
      top: 0,
      right: 0,
      bottom: 0,
    });
  });
  it("does not mutate the requested dimensions when constraining opposing panels", () => {
    const result = getViewportPanelLayout({
      ...input,
      width: 300,
      height: 200,
      enabled: { left: true, top: true, right: true, bottom: true },
    });
    expect(result.padding.left + result.padding.right).toBe(268);
    expect(result.padding.top + result.padding.bottom).toBe(168);
    expect(input.sizes.left).toBe(288);
    expect(getViewportPanelLayout(input).extents.left).toBe(288);
  });
  it.each([0, 10, 32])(
    "keeps tiny %s px hosts free of negative extents or excessive padding",
    (size) => {
      const { padding, extents } = getViewportPanelLayout({
        ...input,
        width: size,
        height: size,
      });
      expect(Object.values(padding)).toEqual([0, 0, 0, 0]);
      expect(Object.values(extents)).toEqual([0, 0, 0, 0]);
    }
  );
  it("rejects invalid dimensions before they reach a map camera", () => {
    expect(() => getViewportPanelLayout({ ...input, width: NaN })).toThrow(
      RangeError
    );
    expect(() => getViewportPanelLayout({ ...input, gap: -1 })).toThrow(
      RangeError
    );
  });
});
