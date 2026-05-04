import { describe, expect, it } from "vitest";

import {
  resolveFinishedLabelText,
  resolveVisibleLabelTextSuggestions,
} from "./use-geoportal-label-text-modal-input";

describe("useGeoportalLabelTextModalInput helpers", () => {
  it("preserves internal whitespace when finishing pure label text", () => {
    expect(resolveFinishedLabelText("  A B  ", "Beschriftung 1")).toBe("A B");
  });

  it("uses the fallback when pure label text is only whitespace", () => {
    expect(resolveFinishedLabelText("   ", "Beschriftung 1")).toBe(
      "Beschriftung 1"
    );
  });

  it("matches suggestions by trimmed text while preserving internal whitespace", () => {
    expect(
      resolveVisibleLabelTextSuggestions({
        labelSuggestions: ["A B", "C D"],
        value: "  A B  ",
      })
    ).toEqual(["C D"]);
  });
});
