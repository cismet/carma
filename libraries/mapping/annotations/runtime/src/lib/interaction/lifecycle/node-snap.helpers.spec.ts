import { describe, expect, it, vi } from "vitest";

vi.mock("@carma-mapping/engines/cesium/core", () => ({
  projectGeographicCoordinateToScreen: vi.fn(
    (_scene: unknown, coordinate: { longitude: number; latitude: number }) => ({
      x: coordinate.longitude,
      y: coordinate.latitude,
    })
  ),
}));

import type {
  CesiumGeographicCoordinate,
  AnnotationNodeLink,
  AnnotationNode,
} from "../../store";
import { resolveNodeSnapSample } from "./node-snap.helpers";

const createCoordinate = (
  longitude: number,
  latitude: number,
  altitude = 0
): CesiumGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

const createNode = (
  id: string,
  longitude: number,
  latitude: number
): AnnotationNode => ({
  id,
  coordinate: createCoordinate(longitude, latitude),
});

const scene = {
  isDestroyed: () => false,
} as const;

describe("resolveNodeSnapSample", () => {
  it("snaps to the nearest eligible node and returns its linked group", () => {
    const nodes = [createNode("node-a", 10, 10), createNode("node-b", 40, 40)];
    const linkedNodeGroups: AnnotationNodeLink[] = [
      { id: "group-a", nodeIds: ["node-a"] },
      { id: "group-b", nodeIds: ["node-b"] },
    ];

    const sample = resolveNodeSnapSample({
      scene,
      nodes,
      linkedNodeGroups,
      coordinate: createCoordinate(12, 12),
      screenPosition: { x: 12, y: 12 },
    });

    expect(sample.coordinate).toEqual(nodes[0]?.coordinate);
    expect(sample.linkedNodeGroupId).toBe("group-a");
    expect(sample.snappedNodeId).toBe("node-a");
  });

  it("keeps the currently locked snap target until the release distance is exceeded", () => {
    const nodes = [createNode("node-a", 0, 0), createNode("node-b", 15, 0)];

    const sample = resolveNodeSnapSample({
      scene,
      nodes,
      linkedNodeGroups: [
        { id: "group-a", nodeIds: ["node-a"] },
        { id: "group-b", nodeIds: ["node-b"] },
      ],
      coordinate: createCoordinate(17, 0),
      screenPosition: { x: 17, y: 0 },
      lockedNodeId: "node-a",
    });

    expect(sample.coordinate).toEqual(nodes[0]?.coordinate);
    expect(sample.snappedNodeId).toBe("node-a");
  });

  it("never snaps to excluded move-scope nodes", () => {
    const nodes = [createNode("node-a", 10, 10), createNode("node-b", 40, 40)];

    const sample = resolveNodeSnapSample({
      scene,
      nodes,
      linkedNodeGroups: [
        { id: "group-a", nodeIds: ["node-a"] },
        { id: "group-b", nodeIds: ["node-b"] },
      ],
      coordinate: createCoordinate(10, 10),
      screenPosition: { x: 10, y: 10 },
      excludedNodeIds: ["node-a"],
    });

    expect(sample.coordinate).toEqual(createCoordinate(10, 10));
    expect(sample.linkedNodeGroupId).toBeNull();
    expect(sample.snappedNodeId).toBeNull();
  });

  it("can force the preview to a concrete snap target without screen coordinates", () => {
    const nodes = [createNode("node-a", 10, 10), createNode("node-b", 40, 40)];

    const sample = resolveNodeSnapSample({
      scene,
      nodes,
      linkedNodeGroups: [
        { id: "group-a", nodeIds: ["node-a"] },
        { id: "group-b", nodeIds: ["node-b"] },
      ],
      coordinate: createCoordinate(12, 12),
      forcedSnappedNodeId: "node-b",
    });

    expect(sample.coordinate).toEqual(nodes[1]?.coordinate);
    expect(sample.linkedNodeGroupId).toBe("group-b");
    expect(sample.snappedNodeId).toBe("node-b");
  });
});
