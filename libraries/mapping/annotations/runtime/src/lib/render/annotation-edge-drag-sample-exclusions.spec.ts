import { describe, expect, it } from "vitest";

import { shouldExcludeAnnotationSceneLineFromDragSample } from "./annotation-edge-drag-sample-exclusions";

describe("annotation edge drag-sample exclusions", () => {
  it("excludes a line incident to the edited node before the first live anchor", () => {
    expect(
      shouldExcludeAnnotationSceneLineFromDragSample(
        { startNodeId: "edited", endNodeId: "other" },
        "edited",
        () => false
      )
    ).toBe(true);
  });

  it("also excludes lines incident to linked nodes once their live anchors exist", () => {
    expect(
      shouldExcludeAnnotationSceneLineFromDragSample(
        { startNodeId: "linked", endNodeId: "other" },
        "edited",
        (nodeId) => nodeId === "linked"
      )
    ).toBe(true);
  });

  it("keeps unrelated lines pickable", () => {
    expect(
      shouldExcludeAnnotationSceneLineFromDragSample(
        { startNodeId: "foreign-a", endNodeId: "foreign-b" },
        "edited",
        () => false
      )
    ).toBe(false);
  });
});
