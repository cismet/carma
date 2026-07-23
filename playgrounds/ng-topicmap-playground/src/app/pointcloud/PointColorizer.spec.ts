import { describe, expect, it } from "vitest";

import {
  formatColorizerFieldLabel,
  getPointStyleSelectionOptions,
} from "./PointColorizer";

describe("getPointStyleSelectionOptions", () => {
  it("only exposes the currently active field source", () => {
    expect(getPointStyleSelectionOptions({ kind: "field", field: "ao" })).toEqual([
      { value: "field:ao", label: "Verschattung (AO)" },
    ]);
  });

  it("uses German labels for common fields regardless of source casing", () => {
    expect(formatColorizerFieldLabel("AO")).toBe("Verschattung (AO)");
    expect(formatColorizerFieldLabel("intensity")).toBe("Intensität");
    expect(formatColorizerFieldLabel("return_number")).toBe("Rückgabenummer");
  });

  it("only exposes the currently active built-in source", () => {
    expect(getPointStyleSelectionOptions({ kind: "rgb" })).toEqual([
      { value: "rgb", label: "RGB" },
    ]);
  });
});
