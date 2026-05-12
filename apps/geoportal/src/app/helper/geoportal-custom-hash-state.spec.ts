import { describe, expect, it } from "vitest";

import { HASH_LAUNCH_MODE } from "@carma-commons/utils";

import {
  buildGeoportalMeasurementModeHashUpdate,
  resolveGeoportalCustomHashState,
} from "./geoportal-custom-hash-state";

describe("geoportal-custom-hash-state", () => {
  it("decodes mm as a framework-neutral measurement mode request", () => {
    expect(resolveGeoportalCustomHashState({ mm: "1" })).toMatchObject({
      measurementModeRequested: true,
    });
    expect(resolveGeoportalCustomHashState({})).toMatchObject({
      measurementModeRequested: false,
    });
  });

  it("defaults measurement hash launches to 3d for the current geoportal integration", () => {
    expect(resolveGeoportalCustomHashState({ mm: "1" })).toMatchObject({
      launchMode: HASH_LAUNCH_MODE.THREE_D,
    });
  });

  it("lets callers choose another measurement launch mode without changing the decoder", () => {
    expect(
      resolveGeoportalCustomHashState(
        { mm: "1" },
        { measurementModeLaunchMode: HASH_LAUNCH_MODE.TWO_D }
      )
    ).toMatchObject({
      launchMode: HASH_LAUNCH_MODE.TWO_D,
    });
  });

  it("keeps explicit launch flags stronger than the measurement default", () => {
    expect(resolveGeoportalCustomHashState({ mm: "1", "2d": "1" })).toMatchObject(
      {
        launchMode: HASH_LAUNCH_MODE.TWO_D,
      }
    );
  });

  it("serializes the measurement hash parameter from mode state", () => {
    expect(buildGeoportalMeasurementModeHashUpdate(true)).toEqual({ mm: "1" });
    expect(buildGeoportalMeasurementModeHashUpdate(false)).toEqual({
      mm: undefined,
    });
  });
});
