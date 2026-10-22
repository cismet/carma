import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PI_OVER_TWO, type CssPixelPosition } from "@carma-units";

import { renderPointLabelOverlayContent } from "./point-label-overlay-content";
import {
  applyPointLabelOverlayState,
  readPointLabelOverlayDomRefs,
  resolvePointLabelStemSegment,
} from "./point-label-overlay-dom";
import type { PointLabelOverlayRenderState } from "./point-label-overlay-state";

const baseState: PointLabelOverlayRenderState = {
  content: "12,3 m",
  hideMarker: true,
  stemStartDistance: 5,
  angleRad: PI_OVER_TWO,
  distance: 20,
  attach: "center",
  screenPosition: { x: 100, y: 50 } as CssPixelPosition,
};

const mount = (state: PointLabelOverlayRenderState) => {
  const { container } = render(renderPointLabelOverlayContent(state));
  const elementDiv = container as HTMLElement;
  const domRefs = readPointLabelOverlayDomRefs(elementDiv);
  if (!domRefs) throw new Error("point label did not mount");
  return { elementDiv, domRefs };
};

describe("resolvePointLabelStemSegment", () => {
  it("runs from the stem start to the pill anchor, relative to the label's anchor", () => {
    const { domRefs } = mount(baseState);
    const segment = resolvePointLabelStemSegment({ domRefs, state: baseState });
    expect(segment?.start.x).toBeCloseTo(0, 9);
    expect(segment?.start.y).toBeCloseTo(5, 9);
    expect(segment?.end.x).toBeCloseTo(0, 9);
    expect(segment?.end.y).toBeCloseTo(20, 9);
  });

  it("matches the stem the overlay lays out", () => {
    const { elementDiv, domRefs } = mount(baseState);
    applyPointLabelOverlayState({ elementDiv, domRefs, state: baseState });
    const segment = resolvePointLabelStemSegment({ domRefs, state: baseState });
    expect(domRefs.stem.style.left).toBe(`${segment?.start.x}px`);
    expect(domRefs.stem.style.top).toBe(`${segment?.start.y}px`);
    expect(Number.parseFloat(domRefs.stemLine.style.width)).toBeCloseTo(15, 9);
  });

  it("has none without a stem", () => {
    const { domRefs } = mount(baseState);
    expect(
      resolvePointLabelStemSegment({
        domRefs,
        state: { ...baseState, hideLabelAndStem: true },
      })
    ).toBeNull();
    expect(
      resolvePointLabelStemSegment({
        domRefs,
        state: { ...baseState, stemStartDistance: 20 },
      })
    ).toBeNull();
  });
});

describe("hideStem", () => {
  const hiddenStemState = { ...baseState, hideStem: true };

  it("renders the stem hidden but mounted", () => {
    const { domRefs } = mount(hiddenStemState);
    expect(domRefs.stem.style.display).toBe("none");
  });

  it("keeps the stem hidden and still resolves its segment", () => {
    const { elementDiv, domRefs } = mount(hiddenStemState);
    expect(
      applyPointLabelOverlayState({
        elementDiv,
        domRefs,
        state: hiddenStemState,
      })
    ).toBe(true);
    expect(domRefs.stem.style.display).toBe("none");
    expect(
      resolvePointLabelStemSegment({ domRefs, state: hiddenStemState })
    ).not.toBeNull();
  });

  it("shows the stem again once lifted", () => {
    const { elementDiv, domRefs } = mount(hiddenStemState);
    applyPointLabelOverlayState({ elementDiv, domRefs, state: baseState });
    expect(domRefs.stem.style.display).toBe("block");
  });
});
