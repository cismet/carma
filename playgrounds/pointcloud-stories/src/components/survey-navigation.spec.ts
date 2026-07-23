import { describe, expect, it } from "vitest";

import {
  buildSurveyNavigationGraph,
  getPanoramaNavigationTargets,
  selectPanoramaNavigationTargetForBearing,
  type PanoramaNavigationTarget,
  type SurveyNavigationNode,
} from "./survey-navigation";

const node = (
  id: string,
  traceId: string,
  traceIndex: number,
  position: [number, number]
): SurveyNavigationNode => ({
  id,
  traceId,
  traceIndex,
  position,
  streetName: `Straße ${traceId}`,
});

describe("survey navigation graph", () => {
  it("keeps ordered neighbors and exposes all cross-trace targets within 20 m", () => {
    const graph = buildSurveyNavigationGraph([
      node("a0", "a", 0, [0, 0]),
      node("a1", "a", 1, [10, 0]),
      node("a2", "a", 2, [20, 0]),
      node("b0", "b", 0, [10, 5]),
      node("c0", "c", 0, [10, 19.9]),
      node("d0", "d", 0, [10, 40.1]),
    ]);

    expect(
      getPanoramaNavigationTargets(graph, "a1")
        .map(({ node: { id } }) => id)
        .sort()
    ).toEqual(["a0", "a2", "b0", "c0"]);
    expect(
      graph.crossTraceEdges.some(({ from, to }) => from === "a1" && to === "d0")
    ).toBe(false);
  });

  it("selects keyboard targets relative to the current view bearing", () => {
    const targets: PanoramaNavigationTarget[] = [
      node("north", "n", 0, [0, 10]),
      node("east", "e", 0, [10, 0]),
      node("south", "s", 0, [0, -10]),
      node("west", "w", 0, [-10, 0]),
    ].map((target) => ({ node: target }));
    const select = (bearingRadians: number) =>
      selectPanoramaNavigationTargetForBearing({
        targets,
        activePosition: [0, 0],
        bearingRadians,
      })?.node.id;

    expect(select(0)).toBe("north");
    expect(select(Math.PI / 2)).toBe("east");
    expect(select(Math.PI)).toBe("south");
    expect(select(-Math.PI / 2)).toBe("west");
  });

  it("does not map a key to a target outside its view-relative hemisphere", () => {
    expect(
      selectPanoramaNavigationTargetForBearing({
        targets: [{ node: node("behind", "a", 0, [0, -10]) }],
        activePosition: [0, 0],
        bearingRadians: 0,
      })
    ).toBeUndefined();
  });

  it("points each target toward the following node along that route", () => {
    const graph = buildSurveyNavigationGraph([
      node("a0", "a", 0, [0, 0]),
      node("a1", "a", 1, [10, 0]),
      node("a2", "a", 2, [20, 0]),
      node("a3", "a", 3, [30, 0]),
      node("b0", "b", 0, [10, -15]),
      node("b1", "b", 1, [10, 5]),
      node("b2", "b", 2, [10, 15]),
    ]);

    const fromA1 = getPanoramaNavigationTargets(graph, "a1");
    expect(
      fromA1.find(({ node: { id } }) => id === "a2")?.continuation?.id
    ).toBe("a3");
    expect(
      fromA1.find(({ node: { id } }) => id === "b1")?.continuation?.id
    ).toBe("b2");
  });

  it("keeps only the nearest candidate for each trace pair", () => {
    const graph = buildSurveyNavigationGraph([
      node("a0", "a", 0, [0, 0]),
      node("a1", "a", 1, [10, 0]),
      node("b0", "b", 0, [0, 10]),
      node("b1", "b", 1, [10, 1]),
    ]);
    const aToB = graph.crossTraceEdges.filter(
      ({ from, to }) => from.startsWith("a") && to.startsWith("b")
    );

    expect(aToB).toEqual([
      expect.objectContaining({ from: "a1", to: "b1", distanceMeters: 1 }),
    ]);
  });
});
