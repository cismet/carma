import { describe, expect, it } from "vitest";

import {
  addAnnotationLabelTextHistoryEntry,
  resolveNextAnnotationLabelText,
} from "./annotation-label-text-history";

describe("annotationLabelTextHistory", () => {
  it("uses the fallback when no manual label exists", () => {
    expect(resolveNextAnnotationLabelText(null, "Beschriftung 1")).toBe(
      "Beschriftung 1"
    );
  });

  it("increments trailing numeric suffixes", () => {
    expect(resolveNextAnnotationLabelText("Punkt 009", "Beschriftung 1")).toBe(
      "Punkt 010"
    );
  });

  it("keeps the last manual text when it has no trailing number", () => {
    expect(resolveNextAnnotationLabelText("Eingang", "Beschriftung 1")).toBe(
      "Eingang"
    );
  });

  it("deduplicates history with the newest text first", () => {
    expect(
      addAnnotationLabelTextHistoryEntry(["Tor 1", "Eingang"], "Eingang")
    ).toEqual(["Eingang", "Tor 1"]);
  });
});
