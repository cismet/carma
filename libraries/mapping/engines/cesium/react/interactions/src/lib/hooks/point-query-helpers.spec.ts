import { describe, expect, it } from "vitest";

import { Cartesian2 } from "@carma-cesium";

import {
  DEFAULT_POINT_QUERY_CONFIG,
  isScreenPositionWithinDistance,
  resolvePointQueryConfig,
} from "./point-query-helpers";

describe("point-query-helpers", () => {
  it("resolves default point query config", () => {
    expect(resolvePointQueryConfig(undefined)).toEqual(
      DEFAULT_POINT_QUERY_CONFIG
    );
  });

  it("normalizes numeric config values", () => {
    expect(
      resolvePointQueryConfig({
        clickDelayMs: -1,
        doubleClickDistancePx: Number.NaN,
        cameraMovePickIntervalMs: Number.POSITIVE_INFINITY,
        surfaceMissLimit: 1.8,
        normalSampleIntervalMs: -5,
        normalSampleDistancePx: 0,
        debugLog: true,
      })
    ).toEqual({
      clickDelayMs: 0,
      doubleClickDistancePx: DEFAULT_POINT_QUERY_CONFIG.doubleClickDistancePx,
      cameraMovePickIntervalMs:
        DEFAULT_POINT_QUERY_CONFIG.cameraMovePickIntervalMs,
      surfaceMissLimit: 1,
      normalSampleIntervalMs: 0,
      normalSampleDistancePx: 0,
      debugLog: true,
    });
  });

  it("checks screen-position distance thresholds", () => {
    const start = new Cartesian2(10, 20);
    const withinThreshold = new Cartesian2(13, 24);
    const outsideThreshold = new Cartesian2(16, 28);

    expect(isScreenPositionWithinDistance(null, withinThreshold, 5)).toBe(
      false
    );
    expect(isScreenPositionWithinDistance(start, withinThreshold, 5)).toBe(
      true
    );
    expect(isScreenPositionWithinDistance(start, outsideThreshold, 5)).toBe(
      false
    );
  });
});
