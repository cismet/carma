import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { Cartesian2, Cartesian3 } from "@carma-cesium";
import { CESIUM_POINT_QUERY_CLICK_STRATEGY } from "@carma-mapping/engines/cesium/react/interactions";
import {
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  type AnnotationGizmoAxisCandidate,
  type AnnotationGizmoPoint,
  type AnnotationPointMoveGizmoOptions,
} from "@carma-mapping/annotations/core";

import {
  cesiumGizmoOptions,
  cesiumPointQueryOptions,
  createGizmoInputCache,
} from "./cesium-tool-hook-options";

describe("createGizmoInputCache", () => {
  it("keeps the converted points while the points array stays", () => {
    const cache = createGizmoInputCache();
    const points: AnnotationGizmoPoint[] = [
      { id: "a", geometryECEF: new Vector3(1, 2, 3) },
    ];
    const first = cache.convertPoints(points);
    expect(cache.convertPoints(points)).toBe(first);
    expect(first[0]).toMatchObject({ id: "a" });
    expect(
      Cartesian3.equals(first[0]!.geometryECEF, new Cartesian3(1, 2, 3))
    ).toBe(true);
    expect(cache.convertPoints([...points])).not.toBe(first);
  });

  it("keeps a converted vector until its components change", () => {
    const cache = createGizmoInputCache();
    const vector = new Vector3(1, 0, 0);
    const first = cache.convertVector(vector);
    expect(cache.convertVector(vector)).toBe(first);
    vector.set(0, 1, 0);
    const second = cache.convertVector(vector);
    expect(second).not.toBe(first);
    expect(second!.y).toBe(1);
    expect(cache.convertVector(null)).toBeNull();
  });

  it("keeps the converted axis candidates while their array stays", () => {
    const cache = createGizmoInputCache();
    const candidates: AnnotationGizmoAxisCandidate[] = [
      { id: "up", direction: new Vector3(0, 0, 1), color: "#fff", title: "Up" },
    ];
    const first = cache.convertCandidates(candidates);
    expect(cache.convertCandidates(candidates)).toBe(first);
    expect(cache.convertCandidates(undefined)).toBeNull();
  });
});

describe("cesiumPointQueryOptions", () => {
  it("maps the click strategy", () => {
    expect(
      cesiumPointQueryOptions({
        enabled: true,
        clickStrategy:
          ANNOTATION_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH,
      }).clickStrategy
    ).toBe(CESIUM_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH);
    expect(cesiumPointQueryOptions({ enabled: true }).clickStrategy).toBe(
      CESIUM_POINT_QUERY_CLICK_STRATEGY.IMMEDIATE
    );
  });

  it("lets a missed pick pass the pre-create veto, and vetoes a resolved one", () => {
    const veto = vi.fn(() => false);
    const { onBeforePointCreate } = cesiumPointQueryOptions({
      enabled: true,
      onBeforePointCreate: veto,
    });
    expect(onBeforePointCreate!(undefined, new Cartesian2(1, 2))).toBe(true);
    expect(veto).not.toHaveBeenCalled();
    expect(
      onBeforePointCreate!(new Cartesian3(1, 2, 3), new Cartesian2(4, 5))
    ).toBe(false);
    expect(veto).toHaveBeenCalledWith({
      screenPosition: { x: 4, y: 5 },
      pickedPositionECEF: new Vector3(1, 2, 3),
      globePositionECEF: null,
    });
  });
});

describe("cesiumGizmoOptions", () => {
  it("hands the engine-neutral position changes back as vectors", () => {
    const onPointPositionChange = vi.fn();
    const options = cesiumGizmoOptions(
      {
        points: [],
        onPointPositionChange,
      } as unknown as AnnotationPointMoveGizmoOptions,
      createGizmoInputCache()
    );
    options.onPointPositionChange!("a", new Cartesian3(1, 2, 3), {
      x: 4,
      y: 5,
    });
    expect(onPointPositionChange).toHaveBeenCalledWith(
      "a",
      new Vector3(1, 2, 3),
      { x: 4, y: 5 }
    );
  });
});
