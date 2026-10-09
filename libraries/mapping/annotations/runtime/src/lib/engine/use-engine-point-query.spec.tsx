import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";

import {
  ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS,
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  type AnnotationClientPosition,
  type AnnotationEngine,
  type AnnotationScreenPosition,
} from "./annotation-engine.types";
import { useEnginePointQuery } from "./use-engine-point-query";

const mockedPerformanceNow = vi.spyOn(performance, "now");

type CameraMoveListeners = {
  onMoveStart?: () => void;
  onMoveEnd?: () => void;
};

const createFakeEngine = () => {
  let preRenderListener: (() => void) | null = null;
  let cameraMoveListeners: CameraMoveListeners | null = null;
  let pointerSubscriber:
    | ((clientPosition: AnnotationClientPosition | null) => void)
    | null = null;
  let currentPointerPosition: AnnotationScreenPosition | null = null;
  // Pointer releases reach the hook through a window listener, so the canvas
  // has to be part of the document for them to bubble that far.
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  const resolveSurfacePick = vi.fn();
  const sampleSurfaceNormalAt = vi.fn();
  const releasePointerTracker = vi.fn();

  const engine = {
    canvas,
    isDestroyed: () => false,
    requestRender: vi.fn(),
    subscribePreRender: (listener: () => void) => {
      preRenderListener = listener;
      return () => {
        if (preRenderListener === listener) {
          preRenderListener = null;
        }
      };
    },
    subscribeCameraMove: (listeners: CameraMoveListeners) => {
      cameraMoveListeners = listeners;
      return () => {
        if (cameraMoveListeners === listeners) {
          cameraMoveListeners = null;
        }
      };
    },
    resolveSurfacePick,
    sampleSurfaceNormalAt,
    pointer: {
      register: vi.fn(() => releasePointerTracker),
      getScreenPosition: vi.fn(() => currentPointerPosition),
      getClientPosition: vi.fn(() => currentPointerPosition),
      subscribeClientPosition: vi.fn(
        (
          listener: (clientPosition: AnnotationClientPosition | null) => void
        ) => {
          pointerSubscriber = listener;
          return () => {
            if (pointerSubscriber === listener) {
              pointerSubscriber = null;
            }
          };
        }
      ),
      clear: vi.fn(),
    },
  } as unknown as AnnotationEngine;

  return {
    engine,
    canvas,
    resolveSurfacePick,
    sampleSurfaceNormalAt,
    releasePointerTracker,
    setPointerPosition: (position: AnnotationScreenPosition | null) => {
      currentPointerPosition = position;
    },
    notifyPointerMove: () => {
      pointerSubscriber?.(currentPointerPosition);
    },
    flushPreRender: () => {
      preRenderListener?.();
    },
    triggerCameraMoveStart: () => {
      cameraMoveListeners?.onMoveStart?.();
    },
    triggerCameraMoveEnd: () => {
      cameraMoveListeners?.onMoveEnd?.();
    },
  };
};

// jsdom has no PointerEvent; the hook only reads MouseEvent fields, so a
// MouseEvent dispatched under the pointer event name stands in for it.
const dispatchPointerEvent = (
  target: EventTarget,
  type: string,
  position: AnnotationScreenPosition,
  init: MouseEventInit = {}
) =>
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: position.x,
      clientY: position.y,
      ...init,
    })
  );

const pressCanvas = (
  canvas: HTMLCanvasElement,
  position: AnnotationScreenPosition,
  init?: MouseEventInit
) => dispatchPointerEvent(canvas, "pointerdown", position, init);

const releaseCanvas = (
  canvas: HTMLCanvasElement,
  position: AnnotationScreenPosition,
  init?: MouseEventInit
) => dispatchPointerEvent(canvas, "pointerup", position, init);

const clickCanvas = (
  canvas: HTMLCanvasElement,
  position: AnnotationScreenPosition,
  init?: MouseEventInit
) => {
  pressCanvas(canvas, position, init);
  releaseCanvas(canvas, position, init);
};

const doubleClickCanvas = (
  canvas: HTMLCanvasElement,
  position: AnnotationScreenPosition,
  init?: MouseEventInit
) => dispatchPointerEvent(canvas, "dblclick", position, init);

describe("useEnginePointQuery", () => {
  beforeEach(() => {
    mockedPerformanceNow.mockReturnValue(0);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("repicks hover state after point creation even when the pointer has not moved", () => {
    const initialHoverPick = new Vector3(1, 2, 3);
    const clickPick = new Vector3(4, 5, 6);
    const refreshedHoverPick = new Vector3(7, 8, 9);
    const fakeEngine = createFakeEngine();
    fakeEngine.sampleSurfaceNormalAt.mockReturnValue(null);
    fakeEngine.resolveSurfacePick
      .mockReturnValueOnce({
        surfacePositionECEF: initialHoverPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        surfacePositionECEF: clickPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        surfacePositionECEF: refreshedHoverPick,
        globePositionECEF: null,
      });

    const onPointCreate = vi.fn();
    const onPointerMove = vi.fn();
    const pointerPosition = { x: 10, y: 20 };
    fakeEngine.setPointerPosition(pointerPosition);

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        onPointCreate,
        onPointerMove,
      })
    );

    expect(fakeEngine.engine.pointer.register).toHaveBeenCalledTimes(1);

    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenCalledTimes(1);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      initialHoverPick,
      pointerPosition,
      null
    );

    act(() => {
      clickCanvas(fakeEngine.canvas, pointerPosition);
    });

    expect(onPointCreate).toHaveBeenCalledTimes(1);
    expect(onPointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: clickPick,
      globePositionECEF: null,
    });

    act(() => {
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenCalledTimes(2);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      refreshedHoverPick,
      pointerPosition,
      null
    );
  });

  it("does not treat shift state as a global force-accept override", () => {
    const clickPick = new Vector3(4, 5, 6);
    const fakeEngine = createFakeEngine();
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const pointerPosition = { x: 10, y: 20 };

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        onPointCreate,
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      clickCanvas(fakeEngine.canvas, pointerPosition);
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    });

    expect(onPointCreate).toHaveBeenCalledTimes(1);
    expect(onPointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: clickPick,
      globePositionECEF: null,
    });
  });

  it("ignores lone presses, drags, and modifier clicks without opt-in", () => {
    const clickPick = new Vector3(4, 5, 6);
    const fakeEngine = createFakeEngine();
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const onLineFinish = vi.fn();
    const pointerPosition = { x: 10, y: 20 };
    const draggedPointerPosition = { x: 20, y: 30 };

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        onPointCreate,
        onLineFinish,
      })
    );

    act(() => {
      pressCanvas(fakeEngine.canvas, pointerPosition);
    });
    expect(onPointCreate).not.toHaveBeenCalled();

    act(() => {
      releaseCanvas(fakeEngine.canvas, draggedPointerPosition);
    });
    expect(onPointCreate).not.toHaveBeenCalled();

    act(() => {
      clickCanvas(fakeEngine.canvas, pointerPosition, { shiftKey: true });
      clickCanvas(fakeEngine.canvas, pointerPosition, { ctrlKey: true });
      clickCanvas(fakeEngine.canvas, pointerPosition, { button: 2 });
      doubleClickCanvas(fakeEngine.canvas, pointerPosition, {
        shiftKey: true,
      });
    });
    expect(onPointCreate).not.toHaveBeenCalled();
    expect(onLineFinish).not.toHaveBeenCalled();

    act(() => {
      clickCanvas(fakeEngine.canvas, pointerPosition);
    });
    expect(onPointCreate).toHaveBeenCalledTimes(1);
  });

  it("skips point creation when onBeforePointCreate vetoes", () => {
    const clickPick = new Vector3(4, 5, 6);
    const fakeEngine = createFakeEngine();
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onBeforePointCreate = vi.fn(() => false);
    const onPointCreate = vi.fn();
    const pointerPosition = { x: 10, y: 20 };

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        onBeforePointCreate,
        onPointCreate,
      })
    );

    act(() => {
      clickCanvas(fakeEngine.canvas, pointerPosition);
    });

    expect(onBeforePointCreate).toHaveBeenCalledTimes(1);
    expect(onBeforePointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: clickPick,
      globePositionECEF: null,
    });
    expect(onPointCreate).not.toHaveBeenCalled();
    expect(fakeEngine.engine.requestRender).toHaveBeenCalled();
  });

  it("reports opt-in shift-clicks as input metadata", () => {
    const clickPick = new Vector3(4, 5, 6);
    const fakeEngine = createFakeEngine();
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const pointerPosition = { x: 10, y: 20 };

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        inputModifiers: [ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT],
        onPointCreate,
      })
    );

    act(() => {
      clickCanvas(fakeEngine.canvas, pointerPosition, { shiftKey: true });
    });

    expect(onPointCreate).toHaveBeenCalledTimes(1);
    expect(onPointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: clickPick,
      globePositionECEF: null,
      inputModifier: ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT,
    });
  });

  it("uses the active opt-in shift state for normal click events", () => {
    const clickPick = new Vector3(4, 5, 6);
    const fakeEngine = createFakeEngine();
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const pointerPosition = { x: 10, y: 20 };

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        inputModifiers: [ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT],
        onPointCreate,
      })
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      clickCanvas(fakeEngine.canvas, pointerPosition);
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    });

    expect(onPointCreate).toHaveBeenCalledTimes(1);
    expect(onPointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: clickPick,
      globePositionECEF: null,
      inputModifier: ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT,
    });
  });

  it("does not mark hover samples while shift is pressed without opt-in", () => {
    const hoverPick = new Vector3(1, 2, 3);
    const fakeEngine = createFakeEngine();
    fakeEngine.sampleSurfaceNormalAt.mockReturnValue(null);
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: hoverPick,
      globePositionECEF: null,
    });

    const onPointerMove = vi.fn();
    const pointerPosition = { x: 10, y: 20 };
    fakeEngine.setPointerPosition(pointerPosition);

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        onPointerMove,
      })
    );

    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      hoverPick,
      pointerPosition,
      null
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      hoverPick,
      pointerPosition,
      null
    );
  });

  it("reports opt-in shift hover samples as input metadata", () => {
    const hoverPick = new Vector3(1, 2, 3);
    const fakeEngine = createFakeEngine();
    fakeEngine.sampleSurfaceNormalAt.mockReturnValue(null);
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: hoverPick,
      globePositionECEF: null,
    });

    const onPointerMove = vi.fn();
    const pointerPosition = { x: 10, y: 20 };
    fakeEngine.setPointerPosition(pointerPosition);

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        inputModifiers: [ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT],
        onPointerMove,
      })
    );

    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      hoverPick,
      pointerPosition,
      null
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      hoverPick,
      pointerPosition,
      null,
      { inputModifier: ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT }
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      hoverPick,
      pointerPosition,
      null
    );
  });

  it("clears hover continuity before opt-in shift fresh picks", () => {
    const continuityHoverPick = new Vector3(1, 2, 3);
    const fakeEngine = createFakeEngine();
    fakeEngine.sampleSurfaceNormalAt.mockReturnValue(null);
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: continuityHoverPick,
      globePositionECEF: null,
    });

    const onPointerMove = vi.fn();
    const pointerPosition = { x: 10, y: 20 };
    fakeEngine.setPointerPosition(pointerPosition);

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        inputModifiers: [ANNOTATION_ENGINE_POINT_QUERY_INPUT_MODIFIERS.SHIFT],
        onPointerMove,
      })
    );

    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      continuityHoverPick,
      pointerPosition,
      null
    );

    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: null,
      globePositionECEF: null,
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      fakeEngine.flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(null, pointerPosition, null);
  });

  it("ignores a same-position click after delayed line finish", () => {
    vi.useFakeTimers();
    const clickPick = new Vector3(4, 5, 6);
    const fakeEngine = createFakeEngine();
    fakeEngine.resolveSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const onLineFinish = vi.fn();
    const pointerPosition = { x: 10, y: 20 };

    const { unmount } = renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        clickStrategy:
          ANNOTATION_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH,
        config: { clickDelayMs: 20 },
        onLineFinish,
        onPointCreate,
      })
    );

    try {
      act(() => {
        clickCanvas(fakeEngine.canvas, pointerPosition);
        clickCanvas(fakeEngine.canvas, pointerPosition);
        doubleClickCanvas(fakeEngine.canvas, pointerPosition);
      });

      expect(onLineFinish).toHaveBeenCalledTimes(1);

      act(() => {
        clickCanvas(fakeEngine.canvas, pointerPosition);
        vi.advanceTimersByTime(20);
      });

      expect(onPointCreate).not.toHaveBeenCalled();
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("throttles hover picks during camera movement while keeping screen-space updates live", () => {
    const idleHoverPick = new Vector3(1, 2, 3);
    const movingHoverPick = new Vector3(4, 5, 6);
    const throttledHoverPick = new Vector3(7, 8, 9);
    const settledHoverPick = new Vector3(10, 11, 12);
    const fakeEngine = createFakeEngine();
    fakeEngine.resolveSurfacePick
      .mockReturnValueOnce({
        surfacePositionECEF: idleHoverPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        surfacePositionECEF: movingHoverPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        surfacePositionECEF: throttledHoverPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        surfacePositionECEF: settledHoverPick,
        globePositionECEF: null,
      });
    fakeEngine.sampleSurfaceNormalAt
      .mockReturnValueOnce(new Vector3(0, 0, 1))
      .mockReturnValueOnce(new Vector3(0, 1, 0));

    const onPointerMove = vi.fn();
    const onScreenPositionChange = vi.fn();
    const initialPointerPosition = { x: 10, y: 20 };
    const movingPointerPosition = { x: 11, y: 21 };
    const throttledPointerPosition = { x: 12, y: 22 };
    const settledPointerPosition = { x: 13, y: 23 };

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        onPointerMove,
        onScreenPositionChange,
      })
    );

    mockedPerformanceNow.mockReturnValue(0);
    fakeEngine.setPointerPosition(initialPointerPosition);
    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).toHaveBeenCalledTimes(1);
    expect(fakeEngine.sampleSurfaceNormalAt).toHaveBeenCalledTimes(1);

    act(() => {
      fakeEngine.triggerCameraMoveStart();
    });

    mockedPerformanceNow.mockReturnValue(10);
    fakeEngine.setPointerPosition(movingPointerPosition);
    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).toHaveBeenCalledTimes(2);
    expect(fakeEngine.sampleSurfaceNormalAt).toHaveBeenCalledTimes(1);

    mockedPerformanceNow.mockReturnValue(20);
    fakeEngine.setPointerPosition(throttledPointerPosition);
    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).toHaveBeenCalledTimes(2);
    expect(onScreenPositionChange).toHaveBeenCalledTimes(3);
    expect(onScreenPositionChange).toHaveBeenLastCalledWith(
      throttledPointerPosition
    );

    mockedPerformanceNow.mockReturnValue(90);
    act(() => {
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).toHaveBeenCalledTimes(3);
    expect(fakeEngine.sampleSurfaceNormalAt).toHaveBeenCalledTimes(1);

    mockedPerformanceNow.mockReturnValue(91);
    fakeEngine.setPointerPosition(settledPointerPosition);
    act(() => {
      fakeEngine.triggerCameraMoveEnd();
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).toHaveBeenCalledTimes(4);
    expect(fakeEngine.sampleSurfaceNormalAt).toHaveBeenCalledTimes(2);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      settledHoverPick,
      settledPointerPosition,
      new Vector3(0, 1, 0)
    );
  });

  it("honors the hover surface miss limit and logs debug state", () => {
    const consoleDebugSpy = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);

    try {
      const retainedHoverSurfacePosition = new Vector3(1, 2, 3);
      const fakeEngine = createFakeEngine();
      fakeEngine.sampleSurfaceNormalAt.mockReturnValue(null);
      fakeEngine.resolveSurfacePick
        .mockReturnValueOnce({
          surfacePositionECEF: retainedHoverSurfacePosition,
          globePositionECEF: null,
        })
        .mockReturnValue({
          surfacePositionECEF: null,
          globePositionECEF: null,
        });

      const onPointerMove = vi.fn();
      const initialPointerPosition = { x: 10, y: 20 };
      const firstMissPointerPosition = { x: 11, y: 21 };
      const secondMissPointerPosition = { x: 12, y: 22 };

      renderHook(() =>
        useEnginePointQuery(fakeEngine.engine, {
          enabled: true,
          config: { surfaceMissLimit: 1, debugLog: true },
          onPointerMove,
        })
      );

      fakeEngine.setPointerPosition(initialPointerPosition);
      act(() => {
        fakeEngine.notifyPointerMove();
        fakeEngine.flushPreRender();
      });

      expect(onPointerMove).toHaveBeenLastCalledWith(
        retainedHoverSurfacePosition,
        initialPointerPosition,
        null
      );

      fakeEngine.setPointerPosition(firstMissPointerPosition);
      act(() => {
        fakeEngine.notifyPointerMove();
        fakeEngine.flushPreRender();
      });

      expect(onPointerMove).toHaveBeenLastCalledWith(
        retainedHoverSurfacePosition,
        firstMissPointerPosition,
        null
      );

      fakeEngine.setPointerPosition(secondMissPointerPosition);
      act(() => {
        fakeEngine.notifyPointerMove();
        fakeEngine.flushPreRender();
      });

      expect(onPointerMove).toHaveBeenLastCalledWith(
        null,
        secondMissPointerPosition,
        null
      );
      expect(consoleDebugSpy).toHaveBeenCalledTimes(2);
      expect(consoleDebugSpy).toHaveBeenNthCalledWith(
        1,
        "[ANNOTATION_ENGINE|POINT_QUERY|HOVER_SURFACE_MISS]",
        {
          event: "retain",
          missCount: 1,
          missLimit: 1,
          screenPosition: { x: 11, y: 21 },
        }
      );
      expect(consoleDebugSpy).toHaveBeenNthCalledWith(
        2,
        "[ANNOTATION_ENGINE|POINT_QUERY|HOVER_SURFACE_MISS]",
        {
          event: "clear",
          missCount: 2,
          missLimit: 1,
          screenPosition: { x: 12, y: 22 },
        }
      );
    } finally {
      consoleDebugSpy.mockRestore();
    }
  });

  it("reuses the last sampled surface normal across nearby static hover moves", () => {
    const initialHoverPick = new Vector3(1, 2, 3);
    const nearbyHoverPick = new Vector3(4, 5, 6);
    const refreshedHoverPick = new Vector3(7, 8, 9);
    const fakeEngine = createFakeEngine();
    fakeEngine.resolveSurfacePick
      .mockReturnValueOnce({
        surfacePositionECEF: initialHoverPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        surfacePositionECEF: nearbyHoverPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        surfacePositionECEF: refreshedHoverPick,
        globePositionECEF: null,
      });
    fakeEngine.sampleSurfaceNormalAt
      .mockReturnValueOnce(new Vector3(0, 0, 1))
      .mockReturnValueOnce(new Vector3(0, 1, 0));

    const onPointerMove = vi.fn();
    const initialPointerPosition = { x: 10, y: 20 };
    const nearbyPointerPosition = { x: 11, y: 21 };
    const refreshedPointerPosition = { x: 20, y: 30 };

    renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        onPointerMove,
      })
    );

    mockedPerformanceNow.mockReturnValue(0);
    fakeEngine.setPointerPosition(initialPointerPosition);
    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).toHaveBeenCalledTimes(1);
    expect(fakeEngine.sampleSurfaceNormalAt).toHaveBeenCalledTimes(1);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      initialHoverPick,
      initialPointerPosition,
      new Vector3(0, 0, 1)
    );

    mockedPerformanceNow.mockReturnValue(10);
    fakeEngine.setPointerPosition(nearbyPointerPosition);
    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).toHaveBeenCalledTimes(2);
    expect(fakeEngine.sampleSurfaceNormalAt).toHaveBeenCalledTimes(1);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      nearbyHoverPick,
      nearbyPointerPosition,
      new Vector3(0, 0, 1)
    );

    mockedPerformanceNow.mockReturnValue(60);
    fakeEngine.setPointerPosition(refreshedPointerPosition);
    act(() => {
      fakeEngine.notifyPointerMove();
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).toHaveBeenCalledTimes(3);
    expect(fakeEngine.sampleSurfaceNormalAt).toHaveBeenCalledTimes(2);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      refreshedHoverPick,
      refreshedPointerPosition,
      new Vector3(0, 1, 0)
    );
  });

  it("releases engine subscriptions and the pointer tracker on unmount", () => {
    const fakeEngine = createFakeEngine();
    const onScreenPositionChange = vi.fn();

    const { unmount } = renderHook(() =>
      useEnginePointQuery(fakeEngine.engine, {
        enabled: true,
        onScreenPositionChange,
      })
    );

    unmount();

    expect(fakeEngine.releasePointerTracker).toHaveBeenCalledTimes(1);
    expect(fakeEngine.engine.canvas.style.cursor).toBe("");

    act(() => {
      clickCanvas(fakeEngine.canvas, { x: 10, y: 20 });
      fakeEngine.flushPreRender();
    });

    expect(fakeEngine.resolveSurfacePick).not.toHaveBeenCalled();
  });
});
