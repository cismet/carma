import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import type { LiveAnnotationAnchors } from "../interaction/live-annotation-anchors";
import type { OverlayVisibilityState } from "./overlay-visibility.shared";
import {
  useOverlayStateCache,
  type OverlayStateComputeContext,
} from "./use-overlay-state-cache";

const createState = (): OverlayVisibilityState => ({
  screenPosition: null,
  isInViewport: false,
  isHidden: true,
  isOccluded: false,
});

const setup = () => {
  const frame = { key: 1, viewKey: "a" };
  let cameraListeners: { onMoveStart?: () => void; onMoveEnd?: () => void } =
    {};
  const engine = {
    isDestroyed: () => false,
    requestRender: vi.fn(),
    getFrameKey: () => frame.key,
    captureProjectionSnapshot: () => ({
      viewportWidth: 100,
      viewportHeight: 100,
      viewKey: frame.viewKey,
    }),
    subscribeCameraMove: (listeners: typeof cameraListeners) => {
      cameraListeners = listeners;
      return () => undefined;
    },
  } as unknown as AnnotationEngine;
  const anchors = { size: 0 };
  const computeStates = vi.fn(
    ({
      previousStatesById,
    }: OverlayStateComputeContext<OverlayVisibilityState>) =>
      new Map([
        ["a", { ...createState(), isOccluded: previousStatesById.size > 0 }],
      ])
  );
  const updatePositions = vi.fn();
  const hook = renderHook(() =>
    useOverlayStateCache({
      engine,
      liveAnchors: anchors as LiveAnnotationAnchors,
      updatePositions,
      computeStates,
      createEmptyState: createState,
    })
  );
  return {
    frame,
    anchors,
    computeStates,
    updatePositions,
    engine,
    hook,
    camera: () => cameraListeners,
  };
};

describe("useOverlayStateCache", () => {
  it("computes once per scene snapshot and reuses the states on later frames", () => {
    const { frame, computeStates, hook } = setup();
    const { resolveState } = hook.result.current;

    expect(resolveState("a").isOccluded).toBe(false);
    expect(resolveState("a")).toBeDefined();
    expect(computeStates).toHaveBeenCalledTimes(1);

    frame.key = 2;
    resolveState("a");
    expect(computeStates).toHaveBeenCalledTimes(1);

    frame.key = 3;
    frame.viewKey = "b";
    expect(resolveState("a").isOccluded).toBe(true);
    expect(computeStates).toHaveBeenCalledTimes(2);
  });

  it("falls back to the empty state for unknown ids", () => {
    const { hook } = setup();
    expect(hook.result.current.resolveState("missing")).toEqual(createState());
  });

  it("recomputes every frame during live drags and once more on the settle frame", () => {
    const { frame, anchors, computeStates, hook } = setup();
    const { resolveState } = hook.result.current;

    anchors.size = 1;
    frame.key = 2;
    resolveState("a");
    frame.key = 3;
    resolveState("a");
    expect(computeStates).toHaveBeenCalledTimes(2);

    anchors.size = 0;
    frame.key = 4;
    resolveState("a");
    expect(computeStates).toHaveBeenCalledTimes(3);

    frame.key = 5;
    resolveState("a");
    expect(computeStates).toHaveBeenCalledTimes(3);
  });

  it("tells the compute step whether the camera is moving and refreshes when it stops", () => {
    const { frame, engine, camera, computeStates, updatePositions, hook } =
      setup();
    const { resolveState } = hook.result.current;

    act(() => camera().onMoveStart?.());
    frame.key = 2;
    resolveState("a");
    expect(computeStates).toHaveBeenLastCalledWith(
      expect.objectContaining({ isCameraMoving: true })
    );

    act(() => camera().onMoveEnd?.());
    expect(updatePositions).toHaveBeenCalledTimes(1);
    expect(engine.requestRender).toHaveBeenCalledTimes(1);
    frame.key = 3;
    resolveState("a");
    expect(computeStates).toHaveBeenLastCalledWith(
      expect.objectContaining({ isCameraMoving: false })
    );
  });

  it("invalidate keeps the previous states unless asked to clear them", () => {
    const { frame, computeStates, hook } = setup();
    const { resolveState, invalidate, readCachedState } = hook.result.current;

    resolveState("a");
    act(() => invalidate());
    frame.key = 2;
    resolveState("a");
    expect(computeStates).toHaveBeenLastCalledWith(
      expect.objectContaining({
        previousStatesById: expect.objectContaining({ size: 1 }),
      })
    );
    expect(readCachedState("a")).toBeDefined();

    act(() => invalidate(true));
    expect(readCachedState("a")).toBeUndefined();
  });
});
