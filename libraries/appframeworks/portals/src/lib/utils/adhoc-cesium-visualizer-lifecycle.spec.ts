import { describe, expect, it, vi } from "vitest";

import { removeInactiveAdhocVisualizers } from "./adhoc-cesium-visualizer-lifecycle";

const createEntry = (featureKey: string) => ({
  featureKey,
  visualizer: { destroy: vi.fn() },
});

describe("removeInactiveAdhocVisualizers", () => {
  it("destroys every primitive visualizer owned by a removed feature", () => {
    const activePolygon = createEntry("active-feature");
    const removedPolygon = createEntry("removed-feature");
    const removedPolyline = createEntry("removed-feature");
    const removedWall = createEntry("removed-feature");
    const visualizers = new Map([
      ["active-polygon", activePolygon],
      ["removed-polygon", removedPolygon],
      ["removed-polyline", removedPolyline],
      ["removed-wall", removedWall],
    ]);

    const removedFeatureKeys = removeInactiveAdhocVisualizers(
      visualizers,
      new Set(["active-feature"])
    );

    expect([...removedFeatureKeys]).toEqual(["removed-feature"]);
    expect(activePolygon.visualizer.destroy).not.toHaveBeenCalled();
    expect(removedPolygon.visualizer.destroy).toHaveBeenCalledOnce();
    expect(removedPolyline.visualizer.destroy).toHaveBeenCalledOnce();
    expect(removedWall.visualizer.destroy).toHaveBeenCalledOnce();
    expect([...visualizers.keys()]).toEqual(["active-polygon"]);
  });
});
