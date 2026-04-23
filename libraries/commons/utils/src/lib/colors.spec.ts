import { describe, expect, it } from "vitest";

import { formatHexRgbCss, formatHexRgbaCss, hexToRgb255 } from "./colors";

describe("hexToRgb255", () => {
  it("expands shorthand RGB hex values", () => {
    expect(hexToRgb255("#abc")).toEqual([170, 187, 204]);
  });

  it("accepts shorthand RGBA hex values and ignores the embedded alpha channel", () => {
    expect(hexToRgb255("#abcd")).toEqual([170, 187, 204]);
  });

  it("rejects invalid hex values", () => {
    expect(() => hexToRgb255("#12xz")).toThrowError('Invalid hex color "#12xz"');
    expect(() => hexToRgb255("#abcde")).toThrowError('Invalid hex color "#abcde"');
  });
});

describe("formatHexRgbCss", () => {
  it("formats shorthand RGBA input as rgb css", () => {
    expect(formatHexRgbCss("#abcd")).toBe("rgb(170, 187, 204)");
  });
});

describe("formatHexRgbaCss", () => {
  it("formats validated RGB input as rgba css", () => {
    expect(formatHexRgbaCss("#ffffff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
  });

  it("formats shorthand RGBA input as rgba css using the provided alpha", () => {
    expect(formatHexRgbaCss("#abcd", 0.5)).toBe("rgba(170, 187, 204, 0.5)");
  });
});
