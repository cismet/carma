import type { CssPixelPosition, CssPixels, Radians, Ratio } from "@carma-units";
import { describe, expect, it, vi } from "vitest";

import type { AnnotationLineLabelPlacement } from "../interaction/line-label-placement";
import { measureLineLabelBox, resolveLineLabelBoxRect } from "./line-label-box";

const box = { text: "33,54 m", width: 60.5, height: 21.75 };
const origin = { x: 12.25, y: 40.5 } as CssPixelPosition;

const placement = (
  x: number,
  y: number,
  angleRad: number,
  anchor: AnnotationLineLabelPlacement["anchor"]
): AnnotationLineLabelPlacement => ({
  x: x as CssPixels,
  y: y as CssPixels,
  angleRad: angleRad as Radians,
  anchor,
  anchorRatio: 0.5 as Ratio,
  isShortEdge: anchor !== "center",
  shouldFlip: false,
  normalX: 0,
  normalY: 1,
});

/** What the browser reports for the label's CSS transform: its four corners mapped, then bounded. */
const transformedBounds = ({
  x,
  y,
  angleRad,
  anchor,
}: AnnotationLineLabelPlacement) => {
  const shiftX = anchor === "left" ? 0 : anchor === "right" ? -1 : -0.5;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const corners = [
    [0, 0],
    [box.width, 0],
    [0, box.height],
    [box.width, box.height],
  ].map(([cornerX, cornerY]) => {
    const localX = cornerX - box.width / 2;
    const localY = cornerY - box.height / 2;
    return [
      origin.x +
        box.width / 2 +
        Math.round(x) +
        shiftX * box.width +
        localX * cos -
        localY * sin,
      origin.y +
        box.height / 2 +
        Math.round(y) -
        box.height / 2 +
        localX * sin +
        localY * cos,
    ];
  });
  const xs = corners.map(([cornerX]) => cornerX);
  const ys = corners.map(([, cornerY]) => cornerY);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
};

describe("resolveLineLabelBoxRect", () => {
  it.each([
    placement(697.4, 433.6, -0.073, "center"),
    placement(310.5, 120.2, 1.2, "center"),
    placement(-40, 900.5, -2.9, "center"),
    placement(601.3, 474.9, 0, "left"),
    placement(601.3, 474.9, 0, "right"),
  ])("bounds the transformed label like the browser (%#)", (labelPlacement) => {
    const rect = resolveLineLabelBoxRect(labelPlacement, box, origin);
    const expected = transformedBounds(labelPlacement);
    expect(rect.left).toBeCloseTo(expected.left, 9);
    expect(rect.top).toBeCloseTo(expected.top, 9);
    expect(rect.right).toBeCloseTo(expected.right, 9);
    expect(rect.bottom).toBeCloseTo(expected.bottom, 9);
  });
});

describe("line label measurement invalidation", () => {
  it("does not remeasure position-only frames, but does remeasure changed typography", () => {
    const element = document.createElement("div");
    const measure = vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      width: 60,
      height: 22,
    } as DOMRect);
    measureLineLabelBox(element, "33,54 m");
    element.style.transform = "translate(10px, 20px) rotate(1rad)";
    measureLineLabelBox(element, "33,54 m");
    expect(measure).toHaveBeenCalledTimes(1);
    element.style.fontSize = "20px";
    measureLineLabelBox(element, "33,54 m");
    expect(measure).toHaveBeenCalledTimes(2);
    measure.mockRestore();
  });
});
