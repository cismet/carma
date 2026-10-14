import { describe, expect, it } from "vitest";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import { createLiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import { buildEdgeSceneLines } from "./build-edge-scene-lines";
import type { EdgeSegment } from "./edge-models";

const engine = { isDestroyed: () => false } as unknown as AnnotationEngine;

const edge = (showComponents?: boolean): EdgeSegment => ({
  id: "distance-1-0",
  startCoordinate: { latitude: 51, longitude: 7, altitude: 100 },
  endCoordinate: { latitude: 51.0001, longitude: 7.0001, altitude: 130 },
  stroke: "white",
  strokeWidth: 1.5,
  overlayDashPattern: "8 8",
  distanceTriangleOverlay: {
    annotationId: "distance-1",
    ...(showComponents === undefined ? {} : { showComponents }),
  },
});

const idsOf = (showComponents?: boolean) =>
  buildEdgeSceneLines({
    edgeSegments: [edge(showComponents)],
    engine,
    formatOptions: { lengthMeters: {} },
    liveAnchors: createLiveAnnotationAnchors(() => undefined),
    occludedLinesInScene: true,
  }).map((line) => line.id);

describe("buildEdgeSceneLines distance components", () => {
  it("draws the legs with the direct line by default and when shown", () => {
    const expected = [
      "distance-1-0",
      "distance-1-0-vertical",
      "distance-1-0-horizontal",
    ];

    expect(idsOf()).toEqual(expected);
    expect(idsOf(true)).toEqual(expected);
  });

  it("draws the direct line alone when the components are hidden", () => {
    expect(idsOf(false)).toEqual(["distance-1-0"]);
  });
  it("uses the common halo on direct, horizontal and vertical scene lines", () => {
    const lines = buildEdgeSceneLines({
      edgeSegments: [edge()],
      engine,
      formatOptions: { lengthMeters: {} },
      liveAnchors: createLiveAnnotationAnchors(() => undefined),
      occludedLinesInScene: true,
    });
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.halo !== false)).toBe(true);
  });
  it.each([true, false])(
    "keeps ruler only on the direct measured edge with components=%s",
    (showComponents) => {
      const lines = buildEdgeSceneLines({
        edgeSegments: [{ ...edge(showComponents), ruler: true }],
        engine,
        formatOptions: { lengthMeters: {} },
        liveAnchors: createLiveAnnotationAnchors(() => undefined),
        occludedLinesInScene: true,
      });
      expect(lines[0]!.ruler).toBe(true);
      expect(lines.slice(1).every((line) => line.ruler === false)).toBe(true);
      expect(lines).toHaveLength(showComponents ? 3 : 1);
    }
  );
  it("keeps an explicitly disabled ruler disabled for the direct edge and projected legs", () => {
    const lines = buildEdgeSceneLines({
      edgeSegments: [{ ...edge(true), ruler: false }],
      engine,
      formatOptions: { lengthMeters: {} },
      liveAnchors: createLiveAnnotationAnchors(() => undefined),
      occludedLinesInScene: true,
    });
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.ruler === false)).toBe(true);
  });
});
