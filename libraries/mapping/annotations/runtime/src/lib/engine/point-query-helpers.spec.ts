import { describe, expect, it } from "vitest";

import {
  DEFAULT_POINT_QUERY_CONFIG,
  getScreenPositionDistance,
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

  it("measures the euclidean distance between screen positions", () => {
    expect(getScreenPositionDistance({ x: 10, y: 20 }, { x: 13, y: 24 })).toBe(
      5
    );
    expect(getScreenPositionDistance({ x: 1, y: 1 }, { x: 1, y: 1 })).toBe(0);
  });

  it("checks screen-position distance thresholds", () => {
    const start = { x: 10, y: 20 };
    const withinThreshold = { x: 13, y: 24 };
    const outsideThreshold = { x: 16, y: 28 };

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
