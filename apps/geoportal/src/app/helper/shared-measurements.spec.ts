import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feature } from "geojson";

const availability = vi.hoisted(() => ({ available: true }));
const loadStoredMock = vi.hoisted(() => vi.fn());
const publishMock = vi.hoisted(() => vi.fn());

vi.mock("../config/measurement3d-availability", () => ({
  get IS_MEASUREMENT3D_AVAILABLE() {
    return availability.available;
  },
}));

vi.mock("../config/app.config", () => ({
  GEOPORTAL_ANNOTATIONS_STORAGE_KEY: "@geoportal.app.cesium-annotations",
}));

vi.mock("@carma-mapping/annotations/runtime", () => ({
  loadAnnotationsRuntimeGeoJsonFeatureCollection: loadStoredMock,
  publishSharedAnnotations: publishMock,
}));

vi.mock("@carma-mapping/annotations/ui", () => ({
  confirmSharedAnnotationsConflicts: vi.fn(),
}));

vi.mock("@carma-mapping/measurements", () => ({
  useMeasurements: vi.fn(),
}));

import {
  publishSharedMeasurements,
  publishSharedMeasurements2d,
  readSharedMeasurementsConfig,
} from "./shared-measurements";

const measurements = { type: "FeatureCollection", features: [] };

const line: Feature = {
  type: "Feature",
  id: "a",
  geometry: {
    type: "LineString",
    coordinates: [
      [0, 0],
      [1, 0],
    ],
  },
  properties: {},
};

describe("shared measurements", () => {
  beforeEach(() => {
    availability.available = true;
    loadStoredMock.mockReset();
    publishMock.mockReset();
  });

  it("puts the stored 3D and the given 2D measurements into the shared configuration", () => {
    loadStoredMock.mockReturnValue(measurements);

    expect(readSharedMeasurementsConfig([line])).toEqual({
      measurements2d: [line],
      measurements3d: measurements,
    });
    expect(loadStoredMock).toHaveBeenCalledWith(
      "@geoportal.app.cesium-annotations"
    );
  });

  it("adds nothing without measurements", () => {
    loadStoredMock.mockReturnValue(null);

    expect(readSharedMeasurementsConfig([])).toEqual({});
  });

  it("hands the measurements of a loaded configuration to the annotation providers", () => {
    publishMock.mockReturnValue(true);

    expect(publishSharedMeasurements(measurements)).toBe(true);
    expect(publishMock).toHaveBeenCalledWith(measurements);
  });

  it("shares only 2D and touches neither the 3D storage nor providers where the 3D measurement is not available", () => {
    availability.available = false;
    loadStoredMock.mockReturnValue(measurements);

    expect(readSharedMeasurementsConfig([line])).toEqual({
      measurements2d: [line],
    });
    expect(publishSharedMeasurements(measurements)).toBe(false);
    expect(loadStoredMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("ignores a configuration without measurements", () => {
    expect(publishSharedMeasurements(undefined)).toBe(false);
    expect(publishSharedMeasurements2d(undefined)).toBe(false);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("keeps only real features of a shared 2D set", () => {
    expect(publishSharedMeasurements2d([{ type: "Feature" }, "x", null])).toBe(
      false
    );
    expect(publishSharedMeasurements2d([line, { foo: 1 }])).toBe(true);
  });
});
