import {
  DEFAULT_SURFACE,
  displayInfoSessionCode,
  displayInfoTarget,
  isDisplayInfo,
  isSurface,
  surfaceOf,
} from "./display-info";

describe("display info", () => {
  it("names the session next to the display's", () => {
    expect(displayInfoSessionCode(" wupp1 ")).toBe("WUPP1-D");
    expect(
      displayInfoTarget({ baseUrl: "https://relay.example", code: "wupp1" })
    ).toEqual({ baseUrl: "https://relay.example", code: "WUPP1-D" });
  });

  it("knows the two surfaces only", () => {
    expect(isSurface("table")).toBe(true);
    expect(isSurface("screen")).toBe(true);
    expect(isSurface("wall")).toBe(false);
    expect(isDisplayInfo({ surface: "screen" })).toBe(true);
    expect(isDisplayInfo({ surface: "Screen" })).toBe(false);
    expect(isDisplayInfo(null)).toBe(false);
  });

  it("reads a table from an empty or foreign session", () => {
    expect(DEFAULT_SURFACE).toBe("table");
    expect(surfaceOf({ surface: "screen" })).toBe("screen");
    expect(surfaceOf(null)).toBe("table");
    expect(surfaceOf({ surface: "wall" })).toBe("table");
  });
});
