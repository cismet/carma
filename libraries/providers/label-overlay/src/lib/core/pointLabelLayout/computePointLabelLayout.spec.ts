import { describe, expect, it } from "vitest";

import { POINT_LABEL_ANCHOR_KIND } from "../pointLabelAnchorSemantics";
import { POINT_LABEL_ATTACH } from "../pointLabelAttach";
import { resolvePointLabelLayoutConfig } from "./config";
import { computePointLabelLayout } from "./computePointLabelLayout";

const createSharedCollisionConfig = (allowEarlyRemoval: boolean) =>
  resolvePointLabelLayoutConfig({
    placementOrder: ["center"],
    stemDistance: 0,
    stemDistanceScaleOrder: [0],
    allowEarlyRemoval,
    dynamicLabelPlacement: true,
    dynamicLabelPlacementConfig: {
      mode: "always",
      iterations: 0,
      step: 0,
      maxDelta: 0,
      minDistance: 0,
      maxDistance: 0,
      viewportAdjustmentStep: 0,
    },
  });

describe("computePointLabelLayout", () => {
  it("hides colliding labels when early removal stays enabled", () => {
    const result = computePointLabelLayout({
      points: [
        {
          id: "a",
          anchor: { x: 100, y: 100 },
          text: "Alpha",
          index: 0,
        },
        {
          id: "b",
          anchor: { x: 100, y: 100 },
          text: "Beta",
          index: 1,
        },
      ],
      viewportWidth: 400,
      viewportHeight: 300,
      cameraPitch: 0,
      config: createSharedCollisionConfig(true),
    });

    expect(result.hiddenByLayout.has("b")).toBe(true);
  });

  it("keeps a best-effort placement when early removal is disabled", () => {
    const result = computePointLabelLayout({
      points: [
        {
          id: "a",
          anchor: { x: 100, y: 100 },
          text: "Alpha",
          index: 0,
        },
        {
          id: "b",
          anchor: { x: 100, y: 100 },
          text: "Beta",
          index: 1,
        },
      ],
      viewportWidth: 400,
      viewportHeight: 300,
      cameraPitch: 0,
      config: createSharedCollisionConfig(false),
    });

    expect(result.hiddenByLayout.has("b")).toBe(false);
    expect(result.placements.b).toBeDefined();
  });

  it("mounts area-centroid labels directly on the anchor", () => {
    const result = computePointLabelLayout({
      points: [
        {
          id: "area",
          anchor: { x: 120, y: 80 },
          anchorKind: POINT_LABEL_ANCHOR_KIND.AREA_CENTROID,
          text: "12.4 m²",
          index: 0,
        },
      ],
      viewportWidth: 400,
      viewportHeight: 300,
      cameraPitch: 0,
      config: resolvePointLabelLayoutConfig({
        placementOrder: ["left"],
        stemDistance: 28,
        stemDistanceScaleOrder: [1],
      }),
    });

    expect(result.placements.area).toMatchObject({
      attach: POINT_LABEL_ATTACH.CENTER,
      distance: 0,
    });
  });
});
