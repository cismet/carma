import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Radians, Ratio } from "@carma-units";
import { Matrix4, Vector3 } from "three";
import type {
  NearestObliqueImageRecord,
  ObliqueGroundTarget,
} from "../../core/types";
import { scoreBestImageGeometry } from "../../core/utils/best-image";
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
const angularDeviation = (
  imagePoint: { x: number; y: number },
  centerY = 0.3
): Ratio => {
  const projection = new Matrix4().set(
    1,
    0,
    0,
    0.5,
    0,
    1,
    0,
    0.5,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    0
  );
  return scoreBestImageGeometry(
    {
      projection,
      eye: new Vector3(),
      preferredDirection: new Vector3(0, centerY - 0.5, 1),
    },
    new Vector3(imagePoint.x - 0.5, imagePoint.y - 0.5, 1)
  )!.deviation;
};
const view: SeamlessPreviewView = {
  imageId: "a",
  sector: 0,
  target,
  epoch: 1,
  imagePoint: { x: 0.8, y: 0.3 },
  bestImageDeviation: angularDeviation({ x: 0.8, y: 0.3 }),
};
const candidate = (
  id = "b",
  origin = "a",
  imagePoint = { x: 0.55, y: 0.3 },
  centerY = 0.3
): SeamlessPreviewCandidate => ({
  approaching: true,
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
  imagePoint,
  bestImageDeviation: angularDeviation(imagePoint, centerY),
});
const withPoint = (
  item: SeamlessPreviewCandidate,
  imagePoint: { x: number; y: number },
  centerY = 0.3
): SeamlessPreviewCandidate => ({
  ...item,
  imagePoint,
  bestImageDeviation: angularDeviation(imagePoint, centerY),
});
const setup = () => {
  const options = {
    enabled: true,
    centerY: 0.3,
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

  it.each(["disabled", "busy", "unchanged-anchor", "no-anchor"])(
    "does not search when %s",
    async (condition) => {
      const { options, hook } = setup();
      if (condition === "disabled")
        hook.rerender({ ...options, enabled: false });
      if (condition === "busy") options.busyRef.current = true;
      if (condition === "unchanged-anchor")
        options.readView.mockResolvedValue({ ...view, target: start });
      if (condition === "no-anchor") options.readTarget.mockReturnValue(null);
      await pan(hook);
      expect(options.findCandidates).not.toHaveBeenCalled();
      expect(options.navigate).not.toHaveBeenCalled();
    }
  );

  it("rejects other directions, absent coverage, the current image and marginal improvements", async () => {
    const { options, hook } = setup();
    const wrongSector = candidate("south");
    wrongSector.step.candidate.record.sector = 2;
    const uncovered = candidate("uncovered");
    uncovered.step.candidate.coversTarget = false;
    const marginal = withPoint(candidate("marginal"), { x: 0.79999, y: 0.3 });
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

  it("switches early inside the source image and ranks every indexed candidate by the configured centre", async () => {
    const { options, hook } = setup();
    options.readView.mockResolvedValue({
      ...view,
      imagePoint: { x: 0.65, y: 0.3 },
      bestImageDeviation: angularDeviation({ x: 0.65, y: 0.3 }),
    });
    const near = withPoint(candidate("near"), { x: 0.58, y: 0.3 });
    const best = withPoint(candidate("best"), { x: 0.51, y: 0.3 });
    options.findCandidates.mockResolvedValue([near, best]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledWith(best.step);
  });

  it("uses the slider's bottom-up centre rather than geometric image centre", async () => {
    const { options, hook } = setup();
    hook.rerender({ ...options, centerY: 0.8 });
    options.readView.mockResolvedValue({
      ...view,
      imagePoint: { x: 0.5, y: 0.5 },
      bestImageDeviation: angularDeviation({ x: 0.5, y: 0.5 }, 0.8),
    });
    const bottom = withPoint(candidate("bottom"), { x: 0.5, y: 0.3 }, 0.8);
    const top = withPoint(candidate("top"), { x: 0.5, y: 0.8 }, 0.8);
    options.findCandidates.mockResolvedValue([bottom, top]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledWith(top.step);
  });

  it("keeps the current photo on equal ranking and bounds consideration to 128 indexed/visible candidates", async () => {
    const { options, hook } = setup();
    const equal = withPoint(candidate("equal"), view.imagePoint!);
    options.findCandidates.mockResolvedValue([
      ...Array.from({ length: 128 }, () => equal),
      candidate("outside-limit"),
    ]);
    await pan(hook);
    expect(options.navigate).not.toHaveBeenCalled();
  });

  it.each(["cancel", "busy", "stale", "disabled", "centre-changed"])(
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
      if (condition === "centre-changed")
        hook.rerender({ ...options, centerY: 0.8 });
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

  it("coalesces pan-step queries and prepares a neighbour without navigating during the gesture", async () => {
    const { options, hook } = setup();
    const prepareCandidate = vi.fn(async () => undefined);
    hook.rerender({ ...options, prepareCandidate } as typeof options);
    act(() => {
      hook.result.current.onPanStart();
      hook.result.current.onPanStep();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(prepareCandidate).toHaveBeenCalledWith(
      view,
      candidate(),
      expect.any(AbortSignal)
    );
    expect(options.navigate).not.toHaveBeenCalled();
    act(() => {
      for (let i = 0; i < 20; i++) hook.result.current.onPanStep();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(options.findCandidates).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(options.findCandidates).toHaveBeenCalledTimes(2);
    // The same neighbour can need a different cropped ROI after another pan.
    expect(prepareCandidate).toHaveBeenCalledTimes(2);
    expect(options.navigate).not.toHaveBeenCalled();
    act(() => hook.result.current.onPanEnd());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(140);
    });
    expect(options.navigate).toHaveBeenCalledOnce();
  });

  it("serializes slow queries and gives the settled pan priority over queued preview work", async () => {
    const { options, hook } = setup();
    const prepareCandidate = vi.fn(async () => undefined);
    hook.rerender({ ...options, prepareCandidate } as typeof options);
    let resolve!: (value: readonly SeamlessPreviewCandidate[]) => void;
    options.findCandidates.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    act(() => {
      hook.result.current.onPanStart();
      hook.result.current.onPanStep();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      for (let i = 0; i < 10; i++) hook.result.current.onPanStep();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(options.findCandidates).toHaveBeenCalledOnce();
    act(() => hook.result.current.onPanEnd());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(140);
    });
    expect(options.findCandidates).toHaveBeenCalledOnce();
    // A metadata/footprint refresh must not replace the already queued navigation.
    act(() => hook.result.current.refreshPreparation());
    await act(async () => {
      resolve([candidate()]);
    });
    expect(prepareCandidate).not.toHaveBeenCalled();
    expect(options.findCandidates).toHaveBeenCalledTimes(2);
    expect(options.navigate).toHaveBeenCalledOnce();
  });

  it("aborts replaced preparations, keeps one preparation in flight and cancels queued replacements", async () => {
    const { options, hook } = setup();
    let finish!: () => void;
    const prepareCandidate = vi.fn(
      (
        _view: SeamlessPreviewView,
        _candidate: SeamlessPreviewCandidate,
        _signal: AbortSignal
      ) =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    hook.rerender({ ...options, prepareCandidate } as typeof options);
    act(() => {
      hook.result.current.onPanStart();
      hook.result.current.onPanStep();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const firstSignal = prepareCandidate.mock.calls[0][2];
    options.findCandidates.mockResolvedValue([candidate("c")]);
    act(() => hook.result.current.onPanStep());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(firstSignal.aborted).toBe(true);
    expect(prepareCandidate).toHaveBeenCalledOnce();
    act(() => hook.result.current.cancel());
    await act(async () => {
      finish();
    });
    expect(prepareCandidate).toHaveBeenCalledOnce();
    expect(options.navigate).not.toHaveBeenCalled();
  });

  it("ranks visible candidates beyond the classic twelve-entry shortlist", async () => {
    const { options, hook } = setup();
    options.findCandidates.mockResolvedValue([
      ...Array.from({ length: 12 }, () => ({
        ...withPoint(candidate("equal"), view.imagePoint!),
      })),
      candidate("thirteenth"),
    ]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledWith(candidate("thirteenth").step);
  });
  it("prepares an approaching neighbour before the handover threshold while retaining the current photo", async () => {
    const { options, hook } = setup();
    const prepareCandidate = vi.fn(async () => undefined);
    hook.rerender({ ...options, prepareCandidate } as typeof options);
    const future = withPoint(candidate("future"), { x: 0.85, y: 0.3 });
    const receding = { ...candidate("receding"), approaching: false };
    options.findCandidates.mockResolvedValue([receding, future]);
    act(() => {
      hook.result.current.onPanStart();
      hook.result.current.onPanStep();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(options.findCandidates).toHaveBeenCalledWith(view, start);
    expect(prepareCandidate).toHaveBeenCalledWith(
      view,
      future,
      expect.any(AbortSignal)
    );
    expect(options.navigate).not.toHaveBeenCalled();
    options.findCandidates.mockResolvedValue([future]);
    act(() => hook.result.current.onPanEnd());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(140);
    });
    expect(options.navigate).not.toHaveBeenCalled();
  });
  it("prepares a better initial neighbour without a gesture or automatic navigation", async () => {
    const { options, hook } = setup();
    const prepareCandidate = vi.fn(async () => undefined);
    options.readView.mockResolvedValue({ ...view, target: start });
    options.findCandidates.mockResolvedValue([
      { ...candidate(), approaching: false },
    ]);
    hook.rerender({ ...options, prepareCandidate } as typeof options);
    act(() => hook.result.current.refreshPreparation());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(options.findCandidates).toHaveBeenCalledWith({
      ...view,
      target: start,
    });
    expect(prepareCandidate).toHaveBeenCalledOnce();
    expect(options.navigate).not.toHaveBeenCalled();
  });

  it("keeps preparation eligible during continued pan but still requires the exact target for navigation", async () => {
    const { options, hook } = setup();
    const prepareCandidate = vi.fn(async () => undefined);
    const isSelectionCurrent = vi.fn(() => true);
    options.isCurrent.mockReturnValue(false);
    hook.rerender({
      ...options,
      prepareCandidate,
      isSelectionCurrent,
    } as typeof options);
    act(() => {
      hook.result.current.onPanStart();
      hook.result.current.onPanStep();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(prepareCandidate).toHaveBeenCalledOnce();
    expect(isSelectionCurrent).toHaveBeenCalledWith(view);
    act(() => hook.result.current.onPanEnd());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(140);
    });
    expect(options.navigate).not.toHaveBeenCalled();
  });

  it("does not prepare a neighbour after the selected image/epoch becomes stale", async () => {
    const { options, hook } = setup();
    const prepareCandidate = vi.fn(async () => undefined);
    const isSelectionCurrent = vi.fn(() => false);
    hook.rerender({
      ...options,
      prepareCandidate,
      isSelectionCurrent,
    } as typeof options);
    act(() => hook.result.current.refreshPreparation());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(options.findCandidates).not.toHaveBeenCalled();
    expect(prepareCandidate).not.toHaveBeenCalled();
    expect(options.navigate).not.toHaveBeenCalled();
  });

  it.each([null, { x: -0.1, y: 0.3 }])(
    "can leave an uncovered source for a covering neighbour (%s)",
    async (imagePoint) => {
      const { options, hook } = setup();
      options.readView.mockResolvedValue({
        ...view,
        imagePoint,
        bestImageDeviation: null,
      });
      await pan(hook);
      expect(options.navigate).toHaveBeenCalledWith(candidate().step);
    }
  );
});

describe("shared best-image angular ranking", () => {
  it("chooses the least angular deviation after actual sensor coverage checks", async () => {
    const { options, hook } = setup();
    options.readView.mockResolvedValue({
      ...view,
      imagePoint: { x: 0.8, y: 0.3 },
      bestImageDeviation: angularDeviation({ x: 0.8, y: 0.3 }),
    });
    const closer = withPoint(candidate("closer"), { x: 0.7, y: 0.3 });
    const best = withPoint(candidate("angular-best"), { x: 0.51, y: 0.3 });
    options.findCandidates.mockResolvedValue([closer, best]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledWith(best.step);
  });
  it("rejects null/nonfinite candidate scores and preserves the current image on equality", async () => {
    const { options, hook } = setup();
    options.readView.mockResolvedValue({
      ...view,
    });
    options.findCandidates.mockResolvedValue(
      [null, NaN, -1, Infinity, angularDeviation(view.imagePoint!)].map(
        (value, index) => ({
          ...candidate(`invalid-${index}`),
          bestImageDeviation: value as Ratio | null,
        })
      )
    );
    await pan(hook);
    expect(options.navigate).not.toHaveBeenCalled();
    const accepted = withPoint(candidate("improved"), { x: 0.51, y: 0.3 });
    options.findCandidates.mockResolvedValue([accepted]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledWith(accepted.step);
  });
  it("keeps actual sensor coverage and same-heading safeguards", async () => {
    const { options, hook } = setup();
    const outside = {
      ...candidate("outside"),
      imagePoint: { x: 1.01, y: 0.5 },
      bestImageDeviation: 0 as Ratio,
    };
    const uncovered = candidate("uncovered");
    uncovered.step.candidate.coversTarget = false;
    const wrongHeading = candidate("wrong-heading");
    wrongHeading.step.candidate.record.sector = 2;
    const inside = withPoint(candidate("inside"), { x: 0.51, y: 0.3 });
    options.findCandidates.mockResolvedValue([
      outside,
      uncovered,
      wrongHeading,
      inside,
    ]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledWith(inside.step);
  });
  it("may prepare an approaching candidate early, while still requiring an angular score", async () => {
    const { options, hook } = setup();
    const prepareCandidate = vi.fn(async () => undefined);
    hook.rerender({ ...options, prepareCandidate } as typeof options);
    const future = withPoint(candidate("future"), { x: 0.85, y: 0.3 });
    options.findCandidates.mockResolvedValue([
      { ...candidate("missing"), bestImageDeviation: null },
      { ...candidate("receding"), approaching: false },
      future,
    ]);
    act(() => {
      hook.result.current.onPanStart();
      hook.result.current.onPanStep();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(prepareCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: "a" }),
      future,
      expect.any(AbortSignal)
    );
    expect(options.navigate).not.toHaveBeenCalled();
  });
  it("allows a covered candidate to replace an uncovered current source", async () => {
    const { options, hook } = setup();
    options.readView.mockResolvedValue({
      ...view,
      imagePoint: null,
      bestImageDeviation: null,
    });
    const eligible = candidate("eligible");
    options.findCandidates.mockResolvedValue([eligible]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledWith(eligible.step);
  });
});

describe("settled pan scheduling and transient view readiness", () => {
  it("keeps the final 140ms job when a stationary refresh arrives inside the preparation throttle", async () => {
    const { options, hook } = setup();
    const prepareCandidate = vi.fn(async () => undefined);
    hook.rerender({ ...options, prepareCandidate } as typeof options);
    act(() => hook.result.current.refreshPreparation());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(options.readView).toHaveBeenCalledOnce();
    act(() => {
      hook.result.current.onPanStart();
      hook.result.current.onPanEnd();
      hook.result.current.refreshPreparation();
    });
    await act(async () => vi.advanceTimersByTimeAsync(100));
    act(() => hook.result.current.refreshPreparation());
    await act(async () => vi.advanceTimersByTimeAsync(39));
    expect(options.navigate).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(options.navigate).toHaveBeenCalledOnce();
    expect(options.readView).toHaveBeenCalledTimes(2);
  });

  it("retries a missing view cooperatively and reads the fresh settled target", async () => {
    const { options, hook } = setup();
    const fresh = { ...view, target: { ...target, longitude: 7.002 } };
    options.readView.mockResolvedValueOnce(null).mockResolvedValue(fresh);
    await pan(hook);
    expect(options.findCandidates).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(199));
    expect(options.readView).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(options.findCandidates).toHaveBeenCalledWith(fresh);
    expect(options.navigate).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(options.readView).toHaveBeenCalledTimes(2);
  });

  it("retries a changed camera signature while keeping selection and epoch fixed", async () => {
    const { options, hook } = setup();
    const isSelectionCurrent = vi.fn(() => true);
    hook.rerender({ ...options, isSelectionCurrent } as typeof options);
    options.isCurrent.mockReturnValueOnce(false).mockReturnValue(true);
    await pan(hook);
    expect(options.findCandidates).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(options.navigate).toHaveBeenCalledOnce();
  });

  it("stops after four cooperative retries when the view remains unavailable", async () => {
    const { options, hook } = setup();
    options.readView.mockResolvedValue(null);
    await pan(hook);
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(options.readView).toHaveBeenCalledTimes(5);
    expect(options.navigate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry a complete angular ranking below the hysteresis threshold", async () => {
    const { options, hook } = setup();
    const almostEqual = {
      ...candidate(),
      bestImageDeviation: (view.bestImageDeviation! - 1e-12) as Ratio,
    };
    options.findCandidates.mockResolvedValue([almostEqual]);
    await pan(hook);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(options.readView).toHaveBeenCalledOnce();
    expect(options.navigate).not.toHaveBeenCalled();
  });

  it("applies the 0.05-degree hysteresis in angular units near and far from the optical axis", async () => {
    const deviationAt = (degrees: number) =>
      (1 - Math.cos((degrees * Math.PI) / 180)) as Ratio;
    for (const [currentDegrees, candidateDegrees] of [
      [0.1, 0.06],
      [20, 19.96],
    ]) {
      const { options, hook } = setup();
      options.readView.mockResolvedValue({
        ...view,
        bestImageDeviation: deviationAt(currentDegrees),
      });
      options.findCandidates.mockResolvedValue([
        {
          ...candidate(),
          bestImageDeviation: deviationAt(candidateDegrees),
        },
      ]);
      await pan(hook);
      expect(options.navigate).not.toHaveBeenCalled();
      hook.unmount();
    }

    const { options, hook } = setup();
    options.readView.mockResolvedValue({
      ...view,
      bestImageDeviation: deviationAt(20),
    });
    options.findCandidates.mockResolvedValue([
      { ...candidate(), bestImageDeviation: deviationAt(19.94) },
    ]);
    await pan(hook);
    expect(options.navigate).toHaveBeenCalledOnce();
  });

  it.each(["cancel", "gesture", "disabled", "centre", "selection", "unmount"])(
    "cancels a pending retry on %s",
    async (reason) => {
      const { options, hook } = setup();
      options.readView.mockResolvedValueOnce(null);
      await pan(hook);
      act(() => {
        if (reason === "cancel") hook.result.current.cancel();
        if (reason === "gesture") hook.result.current.onPanStart();
        if (reason === "disabled")
          hook.rerender({ ...options, enabled: false });
        if (reason === "centre") hook.rerender({ ...options, centerY: 0.7 });
        if (reason === "selection")
          hook.rerender({
            ...options,
            selectionKey: "other:2",
          } as typeof options);
        if (reason === "unmount") hook.unmount();
      });
      await act(async () => vi.advanceTimersByTimeAsync(2000));
      expect(options.readView).toHaveBeenCalledOnce();
      expect(options.navigate).not.toHaveBeenCalled();
    }
  );

  it("does not transfer a stale view retry to a different image or epoch", async () => {
    const { options, hook } = setup();
    options.isCurrent.mockReturnValueOnce(false).mockReturnValue(true);
    await pan(hook);
    options.readView.mockResolvedValue({ ...view, imageId: "other", epoch: 2 });
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(options.readView).toHaveBeenCalledTimes(2);
    expect(options.findCandidates).not.toHaveBeenCalled();
    expect(options.navigate).not.toHaveBeenCalled();
  });
});
