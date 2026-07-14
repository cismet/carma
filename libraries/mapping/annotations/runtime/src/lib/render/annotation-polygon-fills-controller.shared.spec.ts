import { PrimitiveCollection, type Scene } from "@carma-cesium";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RUNTIME_POLYGON_FILL_PLACEMENT } from "./annotation-render-models";
import { createAnnotationPolygonFillsController } from "./annotation-polygon-fills-controller.shared";

const collections: PrimitiveCollection[] = [];

const createScene = () => {
  const primitives = new PrimitiveCollection();
  const groundPrimitives = new PrimitiveCollection();
  collections.push(primitives, groundPrimitives);
  return {
    primitives,
    groundPrimitives,
    requestRender: vi.fn(),
    isDestroyed: () => false,
  } as unknown as Scene;
};

const createFill = (
  placement: (typeof RUNTIME_POLYGON_FILL_PLACEMENT)[keyof typeof RUNTIME_POLYGON_FILL_PLACEMENT]
) => ({
  id: `fill-${placement}`,
  annotationId: "area-1",
  coordinates: [
    { longitude: 7, latitude: 51, altitude: 100 },
    { longitude: 7.001, latitude: 51, altitude: 100 },
    { longitude: 7.001, latitude: 51.001, altitude: 100 },
  ],
  fill: "rgba(255, 127, 0, 0.5)",
  placement,
});

describe("createAnnotationPolygonFillsController", () => {
  afterEach(() => {
    collections.splice(0).forEach((collection) => {
      if (!collection.isDestroyed()) {
        collection.destroy();
      }
    });
  });

  it("removes ground polygon primitives when their measurement disappears", () => {
    const scene = createScene();
    const controller = createAnnotationPolygonFillsController(scene);

    controller.setPolygonFills([
      createFill(RUNTIME_POLYGON_FILL_PLACEMENT.GROUND),
    ]);
    expect(scene.groundPrimitives.length).toBe(1);

    controller.setPolygonFills([]);
    expect(scene.groundPrimitives.length).toBe(0);
  });

  it("removes coplanar polygon primitives when their measurement disappears", () => {
    const scene = createScene();
    const controller = createAnnotationPolygonFillsController(scene);

    controller.setPolygonFills([
      createFill(RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR),
    ]);
    expect(scene.primitives.length).toBe(1);

    controller.setPolygonFills([]);
    expect(scene.primitives.length).toBe(0);
  });
});
