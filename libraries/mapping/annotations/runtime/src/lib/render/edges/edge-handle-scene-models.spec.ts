import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { createLiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import {
  annotationEdgeDefaults,
  distanceTriangleVisualDefaults,
} from "./edge-defaults";
import {
  buildInsertTickSceneMarkers,
  resolveDistanceCornerHandleGeometry,
} from "./edge-handle-scene-models";
import type { EdgeSegment } from "./edge-models";

const anchorECEF = new Vector3(4_000_000, 500_000, 4_900_000);
const up = anchorECEF.clone().normalize();
const east = new Vector3(0, 0, 1).cross(up).normalize();

describe("resolveDistanceCornerHandleGeometry", () => {
  it("lays an arc of the target radius around the corner with the dot halfway to its middle", () => {
    const auxiliaryECEF = anchorECEF.clone().addScaledVector(up, 10);
    const targetECEF = auxiliaryECEF.clone().addScaledVector(east, 20);
    const pixelsPerMeter = 4;
    const geometry = resolveDistanceCornerHandleGeometry(
      { anchorECEF, auxiliaryECEF, targetECEF },
      pixelsPerMeter
    )!;
    const radius =
      distanceTriangleVisualDefaults.cornerOverlay.targetRadiusPx /
      pixelsPerMeter;
    expect(geometry.arc!.length).toBeGreaterThan(2);
    for (const point of geometry.arc!) {
      expect(point.distanceTo(auxiliaryECEF)).toBeCloseTo(radius, 6);
    }
    expect(geometry.dot.distanceTo(auxiliaryECEF)).toBeCloseTo(radius / 2, 6);
  });

  it("keeps only a dot halfway along a line without height or length", () => {
    const targetECEF = anchorECEF.clone().addScaledVector(east, 20);
    const geometry = resolveDistanceCornerHandleGeometry(
      { anchorECEF, auxiliaryECEF: anchorECEF.clone(), targetECEF },
      4
    )!;
    expect(geometry.arc).toBeNull();
    expect(
      geometry.dot.distanceTo(anchorECEF.clone().addScaledVector(east, 10))
    ).toBeCloseTo(0, 6);
    expect(
      resolveDistanceCornerHandleGeometry(
        {
          anchorECEF,
          auxiliaryECEF: anchorECEF.clone(),
          targetECEF: anchorECEF.clone(),
        },
        4
      )
    ).toBeNull();
  });
});

describe("buildInsertTickSceneMarkers", () => {
  const coordinate = (longitude: number) => ({
    longitude,
    latitude: 51.27,
    altitude: 150,
  });
  const segment: EdgeSegment = {
    id: "edge-0",
    annotationId: "a",
    startNodeId: "n0",
    endNodeId: "n1",
    startCoordinate: coordinate(7.2),
    endCoordinate: coordinate(7.201),
    stroke: "white",
    strokeWidth: 1,
    overlayDashPattern: "",
  };

  it("puts a bar across the edge at its midpoint, following live anchors and hover", () => {
    const live = createLiveAnnotationAnchors(() => undefined);
    const hovered = new Set<string>();
    const [tick] = buildInsertTickSceneMarkers([segment], live, hovered);
    expect(tick!.style.barLengthPx).toBe(
      annotationEdgeDefaults.midpointMarker.tickLengthPx
    );
    const resting = tick!.place()!;
    const start = resting.positionECEF
      .clone()
      .sub(resting.acrossECEF!.clone().multiplyScalar(0.5));
    live.set("n1", start.clone().addScaledVector(up, 8));
    hovered.add("edge-0");
    const moved = tick!.place()!;
    expect(
      moved.positionECEF.distanceTo(start.clone().addScaledVector(up, 4))
    ).toBeCloseTo(0, 6);
    expect(moved.hovered).toBe(true);
  });
});
