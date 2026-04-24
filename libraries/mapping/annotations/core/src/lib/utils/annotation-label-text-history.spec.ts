import { describe, expect, it } from "vitest";

import {
  addAnnotationLabelTextHistoryEntry,
  mergeAnnotationLabelTextSuggestions,
  resolveAnnotationLabelTextSuggestions,
  resolveAnnotationLabelTextRequest,
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

  it("extracts distinct label display names from annotation entries newest first", () => {
    expect(
      resolveAnnotationLabelTextSuggestions({
        annotationEntries: [
          { toolType: "label", displayName: "Tor 1" },
          { toolType: "distance", displayName: "12 m" },
          { toolType: "label", displayName: "Eingang" },
          { toolType: "label", displayName: "Tor 1" },
        ],
      })
    ).toEqual(["Tor 1", "Eingang"]);
  });

  it("appends extra suggestions after scene labels", () => {
    expect(
      resolveAnnotationLabelTextSuggestions({
        annotationEntries: [{ toolType: "label", displayName: "Bestand" }],
        additionalSuggestions: ["Session", "Bestand"],
      })
    ).toEqual(["Bestand", "Session"]);
  });

  it("merges suggestion lists while preserving first occurrence order", () => {
    expect(
      mergeAnnotationLabelTextSuggestions(
        ["Bestand", "Session"],
        ["Session", "Archiv"]
      )
    ).toEqual(["Bestand", "Session", "Archiv"]);
  });

  it("resolves label text requests from manual history before scene suggestions", () => {
    expect(
      resolveAnnotationLabelTextRequest({
        defaultText: "Beschriftung",
        labelTextHistory: ["Tor 9"],
        labelTextSuggestions: ["Bestand"],
      })
    ).toEqual({
      initialValue: "Tor 10",
      labelSuggestions: ["Tor 9", "Bestand"],
    });
  });
});
