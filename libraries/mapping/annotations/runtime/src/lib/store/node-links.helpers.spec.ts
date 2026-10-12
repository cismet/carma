import { describe, expect, it } from "vitest";

import type { AnnotationNode } from "./annotations-store.types";
import { resolveNextNodeLinksForNodeMove } from "./node-links.helpers";

// 1e-6 degrees of longitude at 51 degrees latitude are about 0.07 m.
const resolveLinksAfterMovingNodeA = (
  untouchedLongitudeOffsetDeg: number,
  untouchedAltitude: number
) => {
  const nodes: AnnotationNode[] = [
    { id: "node-a", coordinate: { longitude: 7, latitude: 51, altitude: 0 } },
    {
      id: "node-b",
      coordinate: {
        longitude: 7 + untouchedLongitudeOffsetDeg,
        latitude: 51,
        altitude: untouchedAltitude,
      },
    },
  ];
  return resolveNextNodeLinksForNodeMove({
    nodes,
    nodeLinks: [{ id: "shared", nodeIds: ["node-a", "node-b"] }],
    nodeId: "node-a",
    movedNodeIds: ["node-a"],
  });
};

describe("resolveNextNodeLinksForNodeMove", () => {
  it.each([
    ["horizontally", 1e-6, 0],
    ["vertically", 0, 0.05],
  ])(
    "keeps a node linked while it stays within 0.1 m %s",
    (_axis, lon, alt) => {
      expect(resolveLinksAfterMovingNodeA(lon, alt)).toEqual([
        { id: "shared", nodeIds: ["node-a", "node-b"] },
      ]);
    }
  );

  it.each([
    ["horizontally", 2e-6, 0],
    ["vertically", 0, 0.15],
  ])("detaches a node moved more than 0.1 m away %s", (_axis, lon, alt) => {
    expect(resolveLinksAfterMovingNodeA(lon, alt)).toEqual([
      { id: "shared", nodeIds: ["node-b"] },
      { id: "node-a", nodeIds: ["node-a"] },
    ]);
  });
});
