import { describe, expect, it } from "vitest";

import {
  buildOrderedSearchParamsString,
  getHashParams,
  HASH_LAUNCH_MODE,
} from "@carma-commons/utils";

import {
  buildGeoportalMeasurementModeHashUpdate,
  buildGeoportalShadowSimulationHashUpdate,
  isGeoportalShadowSimulationHashSelectionValidForYear,
  resolveGeoportalCustomHashState,
  resolveGeoportalShadowSimulationHashSelection,
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
    expect(
      resolveGeoportalCustomHashState({ mm: "1", "2d": "1" })
    ).toMatchObject({
      launchMode: HASH_LAUNCH_MODE.TWO_D,
    });
  });

  it("serializes the measurement hash parameter from mode state", () => {
    expect(buildGeoportalMeasurementModeHashUpdate(true)).toEqual({ mm: "1" });
    expect(buildGeoportalMeasurementModeHashUpdate(false)).toEqual({
      mm: undefined,
    });
  });

  it("decodes the shadow minute and day-of-year tuple", () => {
    expect(
      resolveGeoportalCustomHashState({ shadow: "660;140" })
    ).toMatchObject({
      shadowSimulationSelection: {
        minutes: 660,
        dayOfYear: 140,
      },
    });
  });

  it("round-trips the semicolon through the shared hash encoding", () => {
    const encoded = buildOrderedSearchParamsString({ shadow: "660;140" });

    expect(encoded).toBe("shadow=660%3B140");
    expect(
      resolveGeoportalCustomHashState(getHashParams(encoded))
    ).toMatchObject({
      shadowSimulationSelection: {
        minutes: 660,
        dayOfYear: 140,
      },
    });
  });

  it.each([
    undefined,
    "",
    "660",
    "660;140;1",
    "660.5;140",
    "-1;140",
    "1440;140",
    "660;0",
    "660;367",
    " 660;140",
  ])("rejects an invalid shadow tuple %s", (value) => {
    expect(resolveGeoportalShadowSimulationHashSelection(value)).toBeNull();
  });

  it("validates day 366 against the selection year", () => {
    const selection = { minutes: 660, dayOfYear: 366 };

    expect(
      isGeoportalShadowSimulationHashSelectionValidForYear(selection, 2024)
    ).toBe(true);
    expect(
      isGeoportalShadowSimulationHashSelectionValidForYear(selection, 2026)
    ).toBe(false);
  });

  it("serializes enabled shadow state and removes disabled shadow state", () => {
    expect(
      buildGeoportalShadowSimulationHashUpdate({
        enabled: true,
        selection: { minutes: 660, dayOfYear: 140 },
      })
    ).toEqual({ shadow: "660;140" });
    expect(
      buildGeoportalShadowSimulationHashUpdate({
        enabled: false,
        selection: { minutes: 660, dayOfYear: 140 },
      })
    ).toEqual({ shadow: undefined });
  });
});
