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

describe("production node-link distance boundary", () => {
  // Fixed coordinates from the production metric audit. Keep these literal so
  // fixture construction does not repeat the implementation under test.
  it.each<{
    name: string;
    unchanged: AnnotationNode["coordinate"];
    moved: AnnotationNode["coordinate"];
    detach: boolean;
  }>([
    {
      name: "Wuppertal east at 0.0999 m",
      unchanged: { longitude: 7.18, latitude: 51.26, altitude: 200 },
      moved: { longitude: 7.180001434060585, latitude: 51.26, altitude: 200 },
      detach: false,
    },
    {
      name: "Wuppertal north at 0.10005 m",
      unchanged: { longitude: 7.18, latitude: 51.26, altitude: 200 },
      moved: { longitude: 7.18, latitude: 51.26000089876444, altitude: 200 },
      detach: true,
    },
    {
      name: "Wuppertal east 0.05998 m plus altitude 0.08 m",
      unchanged: { longitude: 7.18, latitude: 51.26, altitude: 200 },
      moved: {
        longitude: 7.180000861010549,
        latitude: 51.26,
        altitude: 200.08,
      },
      detach: false,
    },
    {
      name: "latitude 80 east at 0.0998 m",
      unchanged: { longitude: 7.18, latitude: 80, altitude: 200 },
      moved: { longitude: 7.180005162845159, latitude: 80, altitude: 200 },
      detach: false,
    },
    {
      name: "vertical at 0.0999 m",
      unchanged: { longitude: 7.18, latitude: 51.26, altitude: 200 },
      moved: { longitude: 7.18, latitude: 51.26, altitude: 200.0999 },
      detach: false,
    },
    {
      name: "vertical at 0.1001 m",
      unchanged: { longitude: 7.18, latitude: 51.26, altitude: 200 },
      moved: { longitude: 7.18, latitude: 51.26, altitude: 200.1001 },
      detach: true,
    },
    {
      name: "exact IEEE 0.1 m boundary",
      unchanged: { longitude: 7.18, latitude: 51.26, altitude: 0 },
      moved: { longitude: 7.18, latitude: 51.26, altitude: 0.1 },
      detach: false,
    },
  ])(
    "preserves production link groups for $name",
    ({ unchanged, moved, detach }) => {
      const result = resolveNextNodeLinksForNodeMove({
        nodes: [
          { id: "unchanged", coordinate: unchanged },
          { id: "moved", coordinate: moved },
        ],
        nodeLinks: [{ id: "shared", nodeIds: ["unchanged", "moved"] }],
        nodeId: "moved",
        movedNodeIds: ["moved"],
      });

      expect(result).toEqual(
        detach
          ? [
              { id: "shared", nodeIds: ["unchanged"] },
              { id: "moved", nodeIds: ["moved"] },
            ]
          : [{ id: "shared", nodeIds: ["unchanged", "moved"] }]
      );
    }
  );
});
