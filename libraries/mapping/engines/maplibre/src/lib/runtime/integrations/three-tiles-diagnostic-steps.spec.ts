import { describe, expect, it } from "vitest";
import { getThreeTileDiagnosticSteps } from "./three-tiles-diagnostic-steps";

const progress = {
  discoveredAt: 0,
  queuedAt: 0,
  downloadStartedAt: 10,
  downloadFinishedAt: 30,
  parseStartedAt: 35,
  publicationStartedAt: 45,
  publicationFinishedAt: 50,
  parseFinishedAt: 50,
  loadedAt: 45,
  visibleAt: 70,
  iterations: 1,
  lastIterationFrame: 0,
};
describe("3D tile presentation steps", () => {
  it("accounts for queue, transfer, parsing, setup, display and pending shadow time without overlap", () => {
    expect(getThreeTileDiagnosticSteps(progress, true, 100)).toEqual([
      { label: "Warten", ms: 10 },
      { label: "Laden", ms: 20 },
      { label: "Warten", ms: 5 },
      { label: "Dekodieren", ms: 10 },
      { label: "Aufbau", ms: 5 },
      { label: "Anzeige", ms: 20 },
      { label: "Schatten", ms: 30, pending: true },
    ]);
  });
  it("freezes shadow waiting at presentation and omits it without shadow rendering", () => {
    expect(
      getThreeTileDiagnosticSteps(
        { ...progress, shadowPresentedAt: 90 },
        true,
        200
      ).at(-1)
    ).toEqual({ label: "Schatten", ms: 20 });
    expect(
      getThreeTileDiagnosticSteps(progress, false, 200).some(
        (step) => step.label === "Schatten"
      )
    ).toBe(false);
  });
});
