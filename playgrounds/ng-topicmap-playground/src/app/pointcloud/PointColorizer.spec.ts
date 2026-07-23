import { describe, expect, it } from "vitest";

import { getPointStyleSelectionOptions } from "./PointColorizer";

describe("getPointStyleSelectionOptions", () => {
  it("only exposes the currently active field source", () => {
    expect(getPointStyleSelectionOptions({ kind: "field", field: "ao" })).toEqual([
      { value: "field:ao", label: "Ambient Occlusion" },
    ]);
  });

  it("only exposes the currently active built-in source", () => {
    expect(getPointStyleSelectionOptions({ kind: "rgb" })).toEqual([
      { value: "rgb", label: "RGB" },
    ]);
  });
});
