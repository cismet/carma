import { describe, expect, it } from "vitest";

import type { PointQueryPickResult } from "../registry";
import type { CesiumGeographicCoordinate } from "../store";
import {
  resolvePointQueryCoordinateCreationForceAccepted,
  resolvePointQueryCoordinateCreationSample,
} from "./RuntimeAuthoringHost";

const coordinate = (
  longitude: number,
  latitude: number,
  altitude = 0
): CesiumGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

const createPickResult = (
  overrides: Partial<PointQueryPickResult> = {}
): PointQueryPickResult => ({
  coordinate: null,
  forceAccepted: true,
  pointECEF: null,
  screenPosition: { x: 12, y: 24 },
  surfaceNormalECEF: null,
  ...overrides,
});

describe("resolvePointQueryCoordinateCreationForceAccepted", () => {
  it("keeps explicit forced click payloads", () => {
    expect(
      resolvePointQueryCoordinateCreationForceAccepted({
        explicitForceAccepted: true,
        latestPickResult: null,
        screenPosition: { x: 12, y: 24 },
      })
    ).toBe(true);
  });

  it("inherits forced hover state for clicks at the same screen position", () => {
    expect(
      resolvePointQueryCoordinateCreationForceAccepted({
        latestPickResult: createPickResult(),
        screenPosition: { x: 12, y: 24 },
      })
    ).toBe(true);
  });

  it("inherits forced hover state for clicks near the same screen position", () => {
    expect(
      resolvePointQueryCoordinateCreationForceAccepted({
        latestPickResult: createPickResult(),
        screenPosition: { x: 13, y: 24 },
      })
    ).toBe(true);
  });

  it("ignores stale forced hover state for clicks at another screen position", () => {
    expect(
      resolvePointQueryCoordinateCreationForceAccepted({
        latestPickResult: createPickResult(),
        screenPosition: { x: 40, y: 24 },
      })
    ).toBeUndefined();
  });
});

describe("resolvePointQueryCoordinateCreationSample", () => {
  it("reuses the latest forced hover coordinate for a forced click nearby", () => {
    const clickCoordinate = coordinate(7, 51, 100);
    const hoverCoordinate = coordinate(7.1, 51.1, 101);

    expect(
      resolvePointQueryCoordinateCreationSample({
        coordinate: clickCoordinate,
        explicitForceAccepted: true,
        latestPickResult: createPickResult({
          coordinate: hoverCoordinate,
          forceAccepted: true,
        }),
        screenPosition: { x: 13, y: 24 },
      })
    ).toEqual({
      coordinate: hoverCoordinate,
      forceAccepted: true,
    });
  });

  it("keeps the click coordinate when the forced hover sample is stale", () => {
    const clickCoordinate = coordinate(7, 51, 100);
    const hoverCoordinate = coordinate(7.1, 51.1, 101);

    expect(
      resolvePointQueryCoordinateCreationSample({
        coordinate: clickCoordinate,
        explicitForceAccepted: true,
        latestPickResult: createPickResult({
          coordinate: hoverCoordinate,
          forceAccepted: true,
        }),
        screenPosition: { x: 40, y: 24 },
      })
    ).toEqual({
      coordinate: clickCoordinate,
      forceAccepted: true,
    });
  });
});
