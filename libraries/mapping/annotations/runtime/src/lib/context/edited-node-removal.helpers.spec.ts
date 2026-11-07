import { describe, expect, it } from "vitest";

import type { StoredAnnotation } from "../store";
import {
  resolveDraftNodeIdsAfterEditedNodeRemoval,
  resolveEditedNodeRemovalTarget,
} from "./edited-node-removal.helpers";

const entry = (
  id: string,
  toolType: string,
  nodeIds: string[],
  flags: Partial<StoredAnnotation> = {}
) => ({ id, toolType, nodeIds, ...flags } as unknown as StoredAnnotation);

describe("resolveEditedNodeRemovalTarget", () => {
  const annotationEntries = [
    entry("distance-1", "distance", ["n1", "n2"]),
    entry("polyline-1", "polyline", ["n1", "n3", "n4"]),
    entry("locked-1", "polyline", ["n1", "n5"], { locked: true }),
    entry("label-1", "label", ["n1"]),
  ];

  it("prefers the most recently selected editable measurement holding the node", () => {
    expect(
      resolveEditedNodeRemovalTarget({
        annotationEntries,
        selectedAnnotationIds: ["polyline-1", "distance-1"],
        editedNodeId: "n1",
      })
    ).toMatchObject({
      annotation: { id: "distance-1" },
      minimumNodeCount: 2,
    });
  });

  it("falls back to the first candidate and skips locked or non-node tools", () => {
    expect(
      resolveEditedNodeRemovalTarget({
        annotationEntries,
        selectedAnnotationIds: ["locked-1", "label-1"],
        editedNodeId: "n1",
      })
    ).toMatchObject({ annotation: { id: "distance-1" } });
  });

  it("returns null when no editable measurement holds the node", () => {
    expect(
      resolveEditedNodeRemovalTarget({
        annotationEntries,
        selectedAnnotationIds: [],
        editedNodeId: "n5",
      })
    ).toBeNull();
  });
});

describe("resolveDraftNodeIdsAfterEditedNodeRemoval", () => {
  it("rotates closed rings so the replacement input point becomes the final ring point", () => {
    expect(
      resolveDraftNodeIdsAfterEditedNodeRemoval({
        nodeIds: ["node-1", "node-2", "node-3"],
        editedNodeId: "node-2",
        closed: true,
      })
    ).toEqual(["node-3", "node-1"]);
    expect(
      resolveDraftNodeIdsAfterEditedNodeRemoval({
        nodeIds: ["node-1", "node-2", "node-3"],
        editedNodeId: "node-1",
        closed: true,
      })
    ).toEqual(["node-2", "node-3"]);
    expect(
      resolveDraftNodeIdsAfterEditedNodeRemoval({
        nodeIds: ["node-1", "node-2", "node-3"],
        editedNodeId: "node-3",
        closed: true,
      })
    ).toEqual(["node-1", "node-2"]);
  });

  it("keeps open chains in their existing order", () => {
    expect(
      resolveDraftNodeIdsAfterEditedNodeRemoval({
        nodeIds: ["node-1", "node-2", "node-3"],
        editedNodeId: "node-2",
        closed: false,
      })
    ).toEqual(["node-1", "node-3"]);
  });

  it("falls back to filtered order when the edited node is no longer present", () => {
    expect(
      resolveDraftNodeIdsAfterEditedNodeRemoval({
        nodeIds: ["node-1", "node-2"],
        editedNodeId: "node-3",
        closed: true,
      })
    ).toEqual(["node-1", "node-2"]);
  });
});
