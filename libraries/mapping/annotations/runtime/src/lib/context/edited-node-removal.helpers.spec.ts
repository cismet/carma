import { describe, expect, it } from "vitest";

import { resolveDraftNodeIdsAfterEditedNodeRemoval } from "./edited-node-removal.helpers";

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
