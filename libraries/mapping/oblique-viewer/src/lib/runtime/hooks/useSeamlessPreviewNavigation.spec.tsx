import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Radians } from "@carma-units";
import type {
  NearestObliqueImageRecord,
  ObliqueGroundTarget,
} from "../../core/types";
import {
  useSeamlessPreviewNavigation,
  type SeamlessPreviewCandidate,
  type SeamlessPreviewView,
} from "./useSeamlessPreviewNavigation";

// Keep the actual ground-distance calculation, without initializing a map renderer.
vi.mock("@carma-mapping/engines/maplibre", () => ({
  zoom512as256: (zoom: number) => zoom + 1,
  zoom256as512: (zoom: number) => zoom - 1,
}));

const start: ObliqueGroundTarget = {
  longitude: 7,
  latitude: 51,
  heightMeters: 200,
  heightDatum: "dhhn2016",
};
const target = { ...start, longitude: 7.001 };
const view: SeamlessPreviewView = {
  imageId: "a",
  sector: 0,
  target,
  epoch: 1,
  centerMargin: 0.12,
  viewportMargin: 0.01,
};
const candidate = (id = "b", origin = "a"): SeamlessPreviewCandidate => ({
  step: {
    candidate: {
      record: { id, sector: 0, seriesId: "2026" },
      coversTarget: true,
    } as NearestObliqueImageRecord,
    target,
    headingRad: 0 as Radians,
    originImageId: origin,
    fitNextImage: false,
  },
  centerMargin: 0.35,
});
const setup = () => {
  const options = {
    enabled: true,
    busyRef: { current: false },
    readTarget: vi.fn((): ObliqueGroundTarget | null => start),
    readView: vi.fn(async (): Promise<SeamlessPreviewView | null> => view),
    findCandidates: vi.fn(
      async (): Promise<readonly SeamlessPreviewCandidate[]> => [candidate()]
    ),
    isCurrent: vi.fn(() => true),
    navigate: vi.fn(async () => undefined),
  };
  const hook = renderHook((props) => useSeamlessPreviewNavigation(props), {
    initialProps: options,
  });
  return { options, hook };
};
const pan = async (hook: ReturnType<typeof setup>["hook"]) => {
  act(() => {
    hook.result.current.onPanStart();
    hook.result.current.onPanEnd();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(140);
  });
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("optional seamless preview navigation", () => {
  it("only advances after an actual settled pan, keeping the centre target and same-sector candidate", async () => {
    const { options, hook } = setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    act(() => hook.result.current.onPanEnd());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(options.readView).not.toHaveBeenCalled();
    act(() => {
      hook.result.current.onPanStart();
      hook.result.current.onPanEnd();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(139);
    });
    expect(options.navigate).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(options.findCandidates).toHaveBeenCalledWith(view);
    expect(options.navigate).toHaveBeenCalledWith(candidate().step);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(options.navigate).toHaveBeenCalledOnce();
  });

  it.each([
    "disabled",
    "busy",
    "unchanged-anchor",
    "away-from-edge",
    "outside-source",
    "no-anchor",
  ])("does not search when %s", async (condition) => {
    const { options, hook } = setup();
    if (condition === "disabled") hook.rerender({ ...options, enabled: false });
    if (condition === "busy") options.busyRef.current = true;
    if (condition === "unchanged-anchor")
      options.readView.mockResolvedValue({ ...view, target: start });
    if (condition === "away-from-edge")
      options.readView.mockResolvedValue({ ...view, viewportMargin: 0.1 });
    if (condition === "outside-source")
      options.readView.mockResolvedValue({ ...view, centerMargin: -0.1 });
    if (condition === "no-anchor") options.readTarget.mockReturnValue(null);
    await pan(hook);
    expect(options.findCandidates).not.toHaveBeenCalled();
    expect(options.navigate).not.toHaveBeenCalled();
  });

  it("rejects other directions, absent coverage, the current image and marginal improvements", async () => {
    const { options, hook } = setup();
    const wrongSector = candidate("south");
    wrongSector.step.candidate.record.sector = 2;
    const uncovered = candidate("uncovered");
    uncovered.step.candidate.coversTarget = false;
    const marginal = { ...candidate("marginal"), centerMargin: 0.21 };
    options.findCandidates.mockResolvedValue([
      wrongSector,
      uncovered,
      candidate("a"),
      marginal,
    ]);
    await pan(hook);
    expect(options.navigate).not.toHaveBeenCalled();
    options.findCandidates.mockResolvedValue([wrongSector, candidate("best")]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledWith(candidate("best").step);
  });

  it.each(["cancel", "busy", "stale", "disabled"])(
    "discards a late indexed result after %s",
    async (condition) => {
      const { options, hook } = setup();
      let resolve!: (value: readonly SeamlessPreviewCandidate[]) => void;
      options.findCandidates.mockReturnValue(
        new Promise((done) => {
          resolve = done;
        })
      );
      await pan(hook);
      expect(options.findCandidates).toHaveBeenCalledOnce();
      if (condition === "cancel") act(() => hook.result.current.cancel());
      if (condition === "busy") options.busyRef.current = true;
      if (condition === "stale") options.isCurrent.mockReturnValue(false);
      if (condition === "disabled")
        hook.rerender({ ...options, enabled: false });
      await act(async () => {
        resolve([candidate()]);
      });
      expect(options.navigate).not.toHaveBeenCalled();
    }
  );

  it("blocks immediate reverse jumps until a later substantial user pan", async () => {
    const { options, hook } = setup();
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledOnce();
    const reverse = candidate("a", "b");
    options.findCandidates.mockResolvedValue([reverse]);
    options.readView.mockResolvedValue({
      ...view,
      imageId: "b",
      target: { ...target, longitude: target.longitude + 0.00002 },
    });
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledOnce();
    options.readView.mockResolvedValue({
      ...view,
      imageId: "b",
      target: { ...target, longitude: target.longitude + 0.0003 },
    });
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledTimes(2);
    expect(options.navigate).toHaveBeenLastCalledWith(reverse.step);
  });

  it("keeps the current image when no overlap exists or selection fails", async () => {
    const { options, hook } = setup();
    options.findCandidates.mockResolvedValue([]);
    await pan(hook);
    options.findCandidates.mockRejectedValue(new Error("catalog unavailable"));
    await pan(hook);
    expect(options.navigate).not.toHaveBeenCalled();
  });
});
