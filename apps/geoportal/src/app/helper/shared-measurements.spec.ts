import { beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  publishSharedMeasurements,
  readSharedMeasurementsConfig,
} from "./shared-measurements";

const measurements = { type: "FeatureCollection", features: [] };

describe("shared measurements", () => {
  beforeEach(() => {
    availability.available = true;
    loadStoredMock.mockReset();
    publishMock.mockReset();
  });

  it("puts the stored measurements into the shared configuration", () => {
    loadStoredMock.mockReturnValue(measurements);

    expect(readSharedMeasurementsConfig()).toEqual({
      measurements3d: measurements,
    });
    expect(loadStoredMock).toHaveBeenCalledWith(
      "@geoportal.app.cesium-annotations"
    );
  });

  it("adds nothing without stored measurements", () => {
    loadStoredMock.mockReturnValue(null);

    expect(readSharedMeasurementsConfig()).toBeUndefined();
  });

  it("hands the measurements of a loaded configuration to the annotation providers", () => {
    publishMock.mockReturnValue(true);

    expect(publishSharedMeasurements(measurements)).toBe(true);
    expect(publishMock).toHaveBeenCalledWith(measurements);
  });

  it("does not touch the storage nor the providers where the 3D measurement is not available", () => {
    availability.available = false;
    loadStoredMock.mockReturnValue(measurements);

    expect(readSharedMeasurementsConfig()).toBeUndefined();
    expect(publishSharedMeasurements(measurements)).toBe(false);
    expect(loadStoredMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("ignores a configuration without measurements", () => {
    expect(publishSharedMeasurements(undefined)).toBe(false);
    expect(publishMock).not.toHaveBeenCalled();
  });
});
