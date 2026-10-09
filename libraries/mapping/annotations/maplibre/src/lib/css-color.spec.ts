import { describe, expect, it } from "vitest";
import { parseCssColor } from "./css-color";

describe("parseCssColor", () => {
  it("reads rgba alpha as opacity", () => {
    const { color, opacity } = parseCssColor("rgba(255, 0, 0, 0.25)");
    expect(color.getHexString()).toBe("ff0000");
    expect(opacity).toBeCloseTo(0.25);
  });

  it("reads rgb without alpha as opaque", () => {
    const { color, opacity } = parseCssColor("rgb(0,128,255)");
    expect(color.getHexString()).toBe("0080ff");
    expect(opacity).toBe(1);
  });

  it("reads eight digit hex alpha", () => {
    const { color, opacity } = parseCssColor("#00ff0080");
    expect(color.getHexString()).toBe("00ff00");
    expect(opacity).toBeCloseTo(128 / 255);
  });

  it("falls back to an opaque named colour", () => {
    const { color, opacity } = parseCssColor("white");
    expect(color.getHexString()).toBe("ffffff");
    expect(opacity).toBe(1);
  });
});
