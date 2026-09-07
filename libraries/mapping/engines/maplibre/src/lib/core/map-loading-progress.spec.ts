import { describe, expect, it } from "vitest";
import {
  MAP_LOADING_PHASE as PHASE,
  getCombinedMapLoadingProgress,
  updateMapLoadingWork,
  updateMapLoadingDuration,
  type MapLoadingWork,
} from "./map-loading-progress";

describe("combined map loading cycles", () => {
  it("assigns the entire bar to the only participant", () => {
    const work = updateMapLoadingWork([], {
      phase: PHASE.SHADOW,
      id: "sun",
      fraction: 0.4,
    });
    expect(getCombinedMapLoadingProgress(work)).toEqual({
      active: true,
      percent: 40,
      phases: [PHASE.SHADOW],
    });
  });
  it("weights phase progress by estimated duration, not by worker/tile count", () => {
    const work: MapLoadingWork[] = [
      { phase: PHASE.CONTENT, id: "map", fraction: 0.6 },
      { phase: PHASE.TERRAIN, id: "a", fraction: 0.2 },
      { phase: PHASE.TERRAIN, id: "b", fraction: 0.2 },
      { phase: PHASE.SHADOW, id: "sun", fraction: 0.4 },
    ];
    expect(getCombinedMapLoadingProgress(work).percent).toBe(33);
    expect(
      getCombinedMapLoadingProgress(
        work.filter(({ phase }) => phase !== PHASE.SHADOW)
      ).percent
    ).toBe(30);
  });
  it("retains completed participants until all work finishes, then starts fresh", () => {
    let work = updateMapLoadingWork([], {
      phase: PHASE.CONTENT,
      id: "map",
      fraction: 0,
    });
    work = updateMapLoadingWork(work, {
      phase: PHASE.SHADOW,
      id: "sun",
      fraction: 0,
    });
    work = updateMapLoadingWork(work, {
      phase: PHASE.CONTENT,
      id: "map",
      fraction: 1,
    });
    expect(getCombinedMapLoadingProgress(work).percent).toBe(33);
    work = updateMapLoadingWork(work, {
      phase: PHASE.SHADOW,
      id: "sun",
      fraction: 1,
    });
    expect(getCombinedMapLoadingProgress(work)).toMatchObject({
      active: false,
      percent: 100,
    });
    work = updateMapLoadingWork(work, {
      phase: PHASE.SHADOW,
      id: "sun",
      fraction: 0.2,
    });
    expect(getCombinedMapLoadingProgress(work)).toEqual({
      active: true,
      percent: 20,
      phases: [PHASE.SHADOW],
    });
  });
  it("learns bounded duration estimates without accepting invalid timings", () => {
    expect(updateMapLoadingDuration(1000, 2000)).toBe(1250);
    expect(updateMapLoadingDuration(1000, NaN)).toBe(1000);
    expect(updateMapLoadingDuration(1000, -1)).toBe(1000);
    expect(updateMapLoadingDuration(1000, 1000000)).toBe(15750);
  });
  it("does not register unrelated idle work or notify for identical work", () => {
    const empty: MapLoadingWork[] = [];
    expect(
      updateMapLoadingWork(empty, {
        phase: PHASE.TERRAIN,
        id: "unused",
        fraction: 1,
      })
    ).toBe(empty);
    const item = { phase: PHASE.SHADOW, id: "sun", fraction: 0.5 };
    const work = updateMapLoadingWork(empty, item);
    expect(updateMapLoadingWork(work, item)).toBe(work);
  });
  it("never reports 100 while work remains, and clamps invalid fractions", () => {
    const item = { phase: PHASE.TERRAIN, id: "a", fraction: 0.9999 };
    expect(getCombinedMapLoadingProgress([item]).percent).toBe(99);
    expect(
      updateMapLoadingWork([], { ...item, fraction: NaN })[0].fraction
    ).toBe(0);
    expect(
      updateMapLoadingWork([], { ...item, fraction: -2 })[0].fraction
    ).toBe(0);
  });
});
