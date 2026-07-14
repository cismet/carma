import { PrimitiveCollection, type Scene } from "@carma-cesium";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGroundPolygonVisualizer } from "./createGroundPolygonVisualizer";

const collections: PrimitiveCollection[] = [];

const createScene = () => {
  const groundPrimitives = new PrimitiveCollection();
  collections.push(groundPrimitives);
  return {
    groundPrimitives,
  } as unknown as Scene;
};

describe("createGroundPolygonVisualizer", () => {
  afterEach(() => {
    collections.splice(0).forEach((collection) => {
      if (!collection.isDestroyed()) {
        collection.destroy();
      }
    });
  });

  it("removes its primitive from the scene when the adhoc feature is destroyed", async () => {
    const scene = createScene();
    const requestRender = vi.fn();
    const visualizer = createGroundPolygonVisualizer(
      "adhoc-area",
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [7, 51, 100],
              [7.001, 51, 100],
              [7.001, 51.001, 100],
              [7, 51, 100],
            ],
          ],
        },
      },
      { opacity: 0.35 }
    );

    await visualizer.attach(scene, requestRender);
    expect(scene.groundPrimitives.length).toBe(1);

    visualizer.destroy();

    expect(scene.groundPrimitives.length).toBe(0);
    expect(requestRender).toHaveBeenCalledTimes(2);
  });
});
