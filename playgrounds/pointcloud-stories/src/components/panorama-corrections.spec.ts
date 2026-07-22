import { describe, expect, it } from "vitest";

import { buildSurveyNavigationGraph } from "./survey-navigation";
import {
  createEmptyPanoramaCorrectionDatabase,
  readPanoramaCorrectionDatabase,
  resolvePanoramaCorrections,
  setPanoramaCorrectionControlPoint,
  ZERO_PANORAMA_CORRECTION,
} from "./panorama-corrections";

const correction = (forward: number) => ({
  ...ZERO_PANORAMA_CORRECTION,
  forward,
});

describe("panorama correction database", () => {
  it("interpolates by station only within the same trace", () => {
    const graph = buildSurveyNavigationGraph([
      {
        id: "a0",
        traceId: "a",
        traceIndex: 0,
        position: [0, 0],
        streetName: "A",
      },
      {
        id: "a1",
        traceId: "a",
        traceIndex: 1,
        position: [2, 0],
        streetName: "A",
      },
      {
        id: "a2",
        traceId: "a",
        traceIndex: 2,
        position: [10, 0],
        streetName: "A",
      },
      {
        id: "b0",
        traceId: "b",
        traceIndex: 0,
        position: [2, 1],
        streetName: "B",
      },
    ]);
    let database = createEmptyPanoramaCorrectionDatabase();
    database = setPanoramaCorrectionControlPoint(database, "a0", correction(0));
    database = setPanoramaCorrectionControlPoint(
      database,
      "a2",
      correction(10)
    );
    const resolved = resolvePanoramaCorrections(graph, database);

    expect(resolved.get("a1")).toMatchObject({
      mode: "interpolated",
      fraction: 0.2,
      correction: { forward: 2 },
    });
    expect(resolved.get("b0")).toMatchObject({
      mode: "none",
      correction: ZERO_PANORAMA_CORRECTION,
    });
  });

  it("holds the nearest control point outside the calibrated interval", () => {
    const graph = buildSurveyNavigationGraph([
      {
        id: "a0",
        traceId: "a",
        traceIndex: 0,
        position: [0, 0],
        streetName: "A",
      },
      {
        id: "a1",
        traceId: "a",
        traceIndex: 1,
        position: [1, 0],
        streetName: "A",
      },
      {
        id: "a2",
        traceId: "a",
        traceIndex: 2,
        position: [2, 0],
        streetName: "A",
      },
    ]);
    const database = setPanoramaCorrectionControlPoint(
      createEmptyPanoramaCorrectionDatabase(),
      "a1",
      correction(3)
    );
    const resolved = resolvePanoramaCorrections(graph, database);

    expect(resolved.get("a0")).toMatchObject({
      mode: "held",
      correction: { forward: 3 },
    });
    expect(resolved.get("a2")).toMatchObject({
      mode: "held",
      correction: { forward: 3 },
    });
  });

  it("ignores malformed local storage data", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          format: "carma-panorama-corrections-v1",
          controlPoints: {
            valid: {
              panoramaId: "valid",
              correction: ZERO_PANORAMA_CORRECTION,
              updatedAt: "2026-07-15T00:00:00.000Z",
            },
            invalid: {
              panoramaId: "invalid",
              correction: { ...ZERO_PANORAMA_CORRECTION, pitch: "wrong" },
            },
          },
        }),
    };

    expect(
      Object.keys(readPanoramaCorrectionDatabase(storage).controlPoints)
    ).toEqual(["valid"]);
  });
});
