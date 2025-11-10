import { describe, it, expect } from "vitest";
import {
  getCesiumVersion,
  checkWindowEnv,
  assertWindowCesiumEnv,
} from "./cesiumEnv";

describe("cesiumEnv helpers", () => {
  it("getCesiumVersion returns a string (unknown without runtime)", () => {
    const v = getCesiumVersion();
    expect(typeof v).toBe("string");
  });

  it("checkWindowEnv returns object with optional cesiumBaseUrl", () => {
    const before = checkWindowEnv();
    expect(before).toHaveProperty("cesiumBaseUrl");
  });

  it("assertWindowCesiumEnv throws when CESIUM_BASE_URL missing, then passes when set", () => {
    // Ensure missing
    delete (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL;
    expect(() => assertWindowCesiumEnv()).toThrowError();

    // Set and assert passes
    (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL =
      "/cesium";
    expect(() => assertWindowCesiumEnv()).not.toThrowError();
  });
});
