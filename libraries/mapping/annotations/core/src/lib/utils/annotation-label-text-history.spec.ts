import { describe, expect, it } from "vitest";

import {
  addAnnotationLabelTextHistoryEntry,
  mergeAnnotationLabelTextSuggestions,
  resolveAnnotationLabelTextSuggestions,
  resolveAnnotationLabelTextRequest,
} from "./annotation-label-text-history";

describe("annotationLabelTextHistory", () => {
  it.each([
    [[], "Beschriftung 1"],
    [["Punkt 009"], "Punkt 010"],
    [["Eingang"], "Eingang"],
  ])(
    "derives the initial text from the newest manual entry %j",
    (labelTextHistory, expected) => {
      expect(
        resolveAnnotationLabelTextRequest({
          defaultText: "Beschriftung 1",
          labelTextHistory,
          labelTextSuggestions: [],
        }).initialValue
      ).toBe(expected);
    }
  );

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

  it("collapses incremental label suggestions to the base preset when available", () => {
    expect(
      mergeAnnotationLabelTextSuggestions([
        "Tür 4",
        "Tür 3",
        "Tür 2",
        "Tür 1",
        "Tür",
        "Rosa Haus",
      ])
    ).toEqual(["Tür", "Rosa Haus"]);
  });

  it("keeps only the newest incremental label suggestion when no base preset exists", () => {
    expect(
      mergeAnnotationLabelTextSuggestions([
        "Tor 4",
        "Tor 3",
        "Tor 2",
        "Bestand",
      ])
    ).toEqual(["Tor 4", "Bestand"]);
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
