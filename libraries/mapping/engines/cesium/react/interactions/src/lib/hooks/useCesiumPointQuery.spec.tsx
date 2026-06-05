import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cesiumInteractionMocks = vi.hoisted(() => ({
  handlers: [] as Array<{
    setInputAction: (
      callback: (event: { position: unknown }) => void,
      type: unknown,
      modifier?: unknown
    ) => void;
    destroy: () => void;
    inputActions: Map<unknown, (event: { position: unknown }) => void>;
  }>,
  pointerSubscriber: null as null | (() => void),
  currentPointerPosition: null as unknown,
}));

vi.mock("@carma-cesium", async () => {
  const actual = await vi.importActual<typeof import("@carma-cesium")>(
    "@carma-cesium"
  );

  class MockScreenSpaceEventHandler {
    inputActions = new Map<unknown, (event: { position: unknown }) => void>();

    constructor() {
      cesiumInteractionMocks.handlers.push(this);
    }

    setInputAction(
      callback: (event: { position: unknown }) => void,
      type: unknown,
      modifier?: unknown
    ) {
      this.inputActions.set(
        modifier === undefined ? type : `${String(type)}:${String(modifier)}`,
        callback
      );
    }

    destroy() {
      this.inputActions.clear();
    }
  }

  return {
    ...actual,
    ScreenSpaceEventHandler: MockScreenSpaceEventHandler,
    ScreenSpaceEventType: {
      LEFT_CLICK: "LEFT_CLICK",
      LEFT_DOUBLE_CLICK: "LEFT_DOUBLE_CLICK",
      LEFT_DOWN: "LEFT_DOWN",
      LEFT_UP: "LEFT_UP",
    },
    KeyboardEventModifier: {
      SHIFT: "SHIFT",
    },
  };
});

const pointQueryPickingMocks = vi.hoisted(() => ({
  resolvePreferredSurfacePick: vi.fn(),
  sampleSurfacePickNormalAtScreenPosition: vi.fn(),
}));

vi.mock("@carma-mapping/engines/cesium/core", () => {
  return {
    resolvePreferredSurfacePick:
      pointQueryPickingMocks.resolvePreferredSurfacePick,
    sampleSurfacePickNormalAtScreenPosition:
      pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition,
  };
});

const scenePointerTrackerMocks = vi.hoisted(() => ({
  registerCesiumScenePointerTracker: vi.fn(() => vi.fn()),
  subscribeCesiumScenePointerClientPosition: vi.fn(
    (_scene: unknown, callback: () => void) => {
      cesiumInteractionMocks.pointerSubscriber = callback;
      return () => {
        if (cesiumInteractionMocks.pointerSubscriber === callback) {
          cesiumInteractionMocks.pointerSubscriber = null;
        }
      };
    }
  ),
  getCesiumScenePointerScreenPosition: vi.fn(
    () => cesiumInteractionMocks.currentPointerPosition
  ),
}));

vi.mock("./scenePointerTracker", () => ({
  registerCesiumScenePointerTracker:
    scenePointerTrackerMocks.registerCesiumScenePointerTracker,
  subscribeCesiumScenePointerClientPosition:
    scenePointerTrackerMocks.subscribeCesiumScenePointerClientPosition,
  getCesiumScenePointerScreenPosition:
    scenePointerTrackerMocks.getCesiumScenePointerScreenPosition,
}));

import {
  Cartesian2,
  Cartesian3,
  KeyboardEventModifier,
  ScreenSpaceEventType,
  type Scene,
} from "@carma-cesium";

import {
  CESIUM_POINT_QUERY_CLICK_STRATEGY,
  useCesiumPointQuery,
} from "./useCesiumPointQuery";

const mockedPerformanceNow = vi.spyOn(performance, "now");

const createFakeEvent = () => {
  let listener: (() => void) | null = null;

  return {
    addEventListener: (nextListener: () => void) => {
      listener = nextListener;
      return () => {
        if (listener === nextListener) {
          listener = null;
        }
      };
    },
    raiseEvent: () => {
      listener?.();
    },
  };
};

const createFakeScene = () => {
  let preRenderListener: (() => void) | null = null;
  const moveStart = createFakeEvent();
  const moveEnd = createFakeEvent();

  return {
    scene: {
      canvas: {
        style: {},
      },
      isDestroyed: () => false,
      requestRender: vi.fn(),
      preRender: {
        addEventListener: (listener: () => void) => {
          preRenderListener = listener;
          return () => {
            if (preRenderListener === listener) {
              preRenderListener = null;
            }
          };
        },
      },
      camera: {
        moveStart,
        moveEnd,
      },
    } as unknown as Scene,
    flushPreRender: () => {
      preRenderListener?.();
    },
    triggerCameraMoveStart: () => {
      moveStart.raiseEvent();
    },
    triggerCameraMoveEnd: () => {
      moveEnd.raiseEvent();
    },
  };
};

describe("useCesiumPointQuery", () => {
  beforeEach(() => {
    cesiumInteractionMocks.handlers = [];
    cesiumInteractionMocks.pointerSubscriber = null;
    cesiumInteractionMocks.currentPointerPosition = null;
    pointQueryPickingMocks.resolvePreferredSurfacePick.mockReset();
    pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition.mockReset();
    pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition.mockReturnValue(
      null
    );
    scenePointerTrackerMocks.registerCesiumScenePointerTracker.mockClear();
    scenePointerTrackerMocks.subscribeCesiumScenePointerClientPosition.mockClear();
    scenePointerTrackerMocks.getCesiumScenePointerScreenPosition.mockClear();
    mockedPerformanceNow.mockReturnValue(0);
  });

  it("repicks hover state after point creation even when the pointer has not moved", () => {
    const initialHoverPick = new Cartesian3(1, 2, 3);
    const clickPick = new Cartesian3(4, 5, 6);
    const refreshedHoverPick = new Cartesian3(7, 8, 9);
    pointQueryPickingMocks.resolvePreferredSurfacePick
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
    const { scene, flushPreRender } = createFakeScene();
    const pointerPosition = new Cartesian2(10, 20);
    cesiumInteractionMocks.currentPointerPosition = pointerPosition;

    renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        onPointCreate,
        onPointerMove,
      })
    );

    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
    });

    expect(onPointerMove).toHaveBeenCalledTimes(1);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      initialHoverPick,
      pointerPosition,
      null
    );

    const activeHandler = cesiumInteractionMocks.handlers[0];
    expect(activeHandler).toBeDefined();

    act(() => {
      activeHandler?.inputActions.get(ScreenSpaceEventType.LEFT_CLICK)?.({
        position: pointerPosition,
      });
    });

    expect(onPointCreate).toHaveBeenCalledTimes(1);
    expect(onPointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: clickPick,
      globePositionECEF: null,
    });

    act(() => {
      flushPreRender();
    });

    expect(onPointerMove).toHaveBeenCalledTimes(2);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      refreshedHoverPick,
      pointerPosition,
      null
    );
  });

  it("marks shift-clicked points as force accepted", () => {
    const clickPick = new Cartesian3(4, 5, 6);
    pointQueryPickingMocks.resolvePreferredSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const { scene } = createFakeScene();
    const pointerPosition = new Cartesian2(10, 20);

    renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        onPointCreate,
      })
    );

    const activeHandler = cesiumInteractionMocks.handlers[0];
    expect(activeHandler).toBeDefined();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      activeHandler?.inputActions.get(ScreenSpaceEventType.LEFT_CLICK)?.({
        position: pointerPosition,
      });
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    });

    expect(onPointCreate).toHaveBeenCalledTimes(1);
    expect(onPointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: clickPick,
      globePositionECEF: null,
      forceAccepted: true,
    });
  });

  it("registers Cesium shift-click modifier events as force accepted clicks", () => {
    const clickPick = new Cartesian3(4, 5, 6);
    pointQueryPickingMocks.resolvePreferredSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const { scene } = createFakeScene();
    const pointerPosition = new Cartesian2(10, 20);

    renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        onPointCreate,
      })
    );

    const activeHandler = cesiumInteractionMocks.handlers[0];
    expect(activeHandler).toBeDefined();

    act(() => {
      activeHandler?.inputActions
        .get(
          `${String(ScreenSpaceEventType.LEFT_CLICK)}:${String(
            KeyboardEventModifier.SHIFT
          )}`
        )
        ?.({
          position: pointerPosition,
        });
    });

    expect(onPointCreate).toHaveBeenCalledTimes(1);
    expect(onPointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: clickPick,
      globePositionECEF: null,
      forceAccepted: true,
    });
  });

  it("uses the retained hover sample for force accepted clicks without a new surface pick", () => {
    const hoverPick = new Cartesian3(1, 2, 3);
    pointQueryPickingMocks.resolvePreferredSurfacePick
      .mockReturnValueOnce({
        surfacePositionECEF: hoverPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        surfacePositionECEF: null,
        globePositionECEF: null,
      });

    const onPointCreate = vi.fn();
    const { scene, flushPreRender } = createFakeScene();
    const pointerPosition = new Cartesian2(10, 20);
    cesiumInteractionMocks.currentPointerPosition = pointerPosition;

    renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        onPointCreate,
      })
    );

    const activeHandler = cesiumInteractionMocks.handlers[0];
    expect(activeHandler).toBeDefined();

    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      activeHandler?.inputActions.get(ScreenSpaceEventType.LEFT_CLICK)?.({
        position: pointerPosition,
      });
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    });

    expect(onPointCreate).toHaveBeenCalledTimes(1);
    expect(onPointCreate).toHaveBeenLastCalledWith({
      screenPosition: pointerPosition,
      pickedPositionECEF: hoverPick,
      globePositionECEF: null,
      forceAccepted: true,
    });
  });

  it("marks hover samples as force accepted while shift is pressed", () => {
    const hoverPick = new Cartesian3(1, 2, 3);
    pointQueryPickingMocks.resolvePreferredSurfacePick.mockReturnValue({
      surfacePositionECEF: hoverPick,
      globePositionECEF: null,
    });

    const onPointerMove = vi.fn();
    const { scene, flushPreRender } = createFakeScene();
    const pointerPosition = new Cartesian2(10, 20);
    cesiumInteractionMocks.currentPointerPosition = pointerPosition;

    renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        onPointerMove,
      })
    );

    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      hoverPick,
      pointerPosition,
      null
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
      flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      hoverPick,
      pointerPosition,
      null,
      { forceAccepted: true }
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
      flushPreRender();
    });

    expect(onPointerMove).toHaveBeenLastCalledWith(
      hoverPick,
      pointerPosition,
      null
    );
  });

  it("captures shift state at click time for delayed point creation", () => {
    vi.useFakeTimers();
    const clickPick = new Cartesian3(4, 5, 6);
    pointQueryPickingMocks.resolvePreferredSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const { scene } = createFakeScene();
    const pointerPosition = new Cartesian2(10, 20);

    const { unmount } = renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        clickStrategy: CESIUM_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH,
        pointClickDelayMs: 20,
        onLineFinish: vi.fn(),
        onPointCreate,
      })
    );

    try {
      const activeHandler = cesiumInteractionMocks.handlers[0];
      expect(activeHandler).toBeDefined();

      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
        activeHandler?.inputActions.get(ScreenSpaceEventType.LEFT_CLICK)?.({
          position: pointerPosition,
        });
        window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
        vi.advanceTimersByTime(20);
      });

      expect(onPointCreate).toHaveBeenCalledTimes(1);
      expect(onPointCreate).toHaveBeenLastCalledWith({
        screenPosition: pointerPosition,
        pickedPositionECEF: clickPick,
        globePositionECEF: null,
        forceAccepted: true,
      });
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("forces point creation after long press and suppresses the following click", () => {
    vi.useFakeTimers();
    const clickPick = new Cartesian3(4, 5, 6);
    pointQueryPickingMocks.resolvePreferredSurfacePick.mockReturnValue({
      surfacePositionECEF: clickPick,
      globePositionECEF: null,
    });

    const onPointCreate = vi.fn();
    const { scene } = createFakeScene();
    const pointerPosition = new Cartesian2(10, 20);

    const { unmount } = renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        onPointCreate,
      })
    );

    try {
      const activeHandler = cesiumInteractionMocks.handlers[0];
      expect(activeHandler).toBeDefined();

      act(() => {
        activeHandler?.inputActions.get(ScreenSpaceEventType.LEFT_DOWN)?.({
          position: pointerPosition,
        });
        vi.advanceTimersByTime(480);
      });

      expect(onPointCreate).toHaveBeenCalledTimes(1);
      expect(onPointCreate).toHaveBeenLastCalledWith({
        screenPosition: pointerPosition,
        pickedPositionECEF: clickPick,
        globePositionECEF: null,
        forceAccepted: true,
      });

      act(() => {
        activeHandler?.inputActions.get(ScreenSpaceEventType.LEFT_UP)?.({
          position: pointerPosition,
        });
        activeHandler?.inputActions.get(ScreenSpaceEventType.LEFT_CLICK)?.({
          position: pointerPosition,
        });
      });

      expect(onPointCreate).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      vi.useRealTimers();
    }
  });

  it("throttles hover picks during camera movement while keeping screen-space updates live", () => {
    const idleHoverPick = new Cartesian3(1, 2, 3);
    const movingHoverPick = new Cartesian3(4, 5, 6);
    const throttledHoverPick = new Cartesian3(7, 8, 9);
    const settledHoverPick = new Cartesian3(10, 11, 12);
    pointQueryPickingMocks.resolvePreferredSurfacePick
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
    pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
      .mockReturnValueOnce(new Cartesian3(0, 0, 1))
      .mockReturnValueOnce(new Cartesian3(0, 1, 0));

    const onPointerMove = vi.fn();
    const onScreenPositionChange = vi.fn();
    const {
      scene,
      flushPreRender,
      triggerCameraMoveEnd,
      triggerCameraMoveStart,
    } = createFakeScene();
    const initialPointerPosition = new Cartesian2(10, 20);
    const movingPointerPosition = new Cartesian2(11, 21);
    const throttledPointerPosition = new Cartesian2(12, 22);
    const settledPointerPosition = new Cartesian2(13, 23);

    renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        onPointerMove,
        onScreenPositionChange,
      })
    );

    mockedPerformanceNow.mockReturnValue(0);
    cesiumInteractionMocks.currentPointerPosition = initialPointerPosition;
    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
    });

    expect(
      pointQueryPickingMocks.resolvePreferredSurfacePick
    ).toHaveBeenCalledTimes(1);
    expect(
      pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
    ).toHaveBeenCalledTimes(1);

    act(() => {
      triggerCameraMoveStart();
    });

    mockedPerformanceNow.mockReturnValue(10);
    cesiumInteractionMocks.currentPointerPosition = movingPointerPosition;
    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
    });

    expect(
      pointQueryPickingMocks.resolvePreferredSurfacePick
    ).toHaveBeenCalledTimes(2);
    expect(
      pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
    ).toHaveBeenCalledTimes(1);

    mockedPerformanceNow.mockReturnValue(20);
    cesiumInteractionMocks.currentPointerPosition = throttledPointerPosition;
    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
    });

    expect(
      pointQueryPickingMocks.resolvePreferredSurfacePick
    ).toHaveBeenCalledTimes(2);
    expect(onScreenPositionChange).toHaveBeenCalledTimes(3);
    expect(onScreenPositionChange).toHaveBeenLastCalledWith(
      throttledPointerPosition
    );

    mockedPerformanceNow.mockReturnValue(90);
    act(() => {
      flushPreRender();
    });

    expect(
      pointQueryPickingMocks.resolvePreferredSurfacePick
    ).toHaveBeenCalledTimes(3);
    expect(
      pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
    ).toHaveBeenCalledTimes(1);

    mockedPerformanceNow.mockReturnValue(91);
    cesiumInteractionMocks.currentPointerPosition = settledPointerPosition;
    act(() => {
      triggerCameraMoveEnd();
      flushPreRender();
    });

    expect(
      pointQueryPickingMocks.resolvePreferredSurfacePick
    ).toHaveBeenCalledTimes(4);
    expect(
      pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
    ).toHaveBeenCalledTimes(2);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      settledHoverPick,
      settledPointerPosition,
      new Cartesian3(0, 1, 0)
    );
  });

  it("reuses the last sampled surface normal across nearby static hover moves", () => {
    const initialHoverPick = new Cartesian3(1, 2, 3);
    const nearbyHoverPick = new Cartesian3(4, 5, 6);
    const refreshedHoverPick = new Cartesian3(7, 8, 9);
    pointQueryPickingMocks.resolvePreferredSurfacePick
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
    pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
      .mockReturnValueOnce(new Cartesian3(0, 0, 1))
      .mockReturnValueOnce(new Cartesian3(0, 1, 0));

    const onPointerMove = vi.fn();
    const { scene, flushPreRender } = createFakeScene();
    const initialPointerPosition = new Cartesian2(10, 20);
    const nearbyPointerPosition = new Cartesian2(11, 21);
    const refreshedPointerPosition = new Cartesian2(20, 30);

    renderHook(() =>
      useCesiumPointQuery(scene, {
        enabled: true,
        onPointerMove,
      })
    );

    mockedPerformanceNow.mockReturnValue(0);
    cesiumInteractionMocks.currentPointerPosition = initialPointerPosition;
    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
    });

    expect(
      pointQueryPickingMocks.resolvePreferredSurfacePick
    ).toHaveBeenCalledTimes(1);
    expect(
      pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
    ).toHaveBeenCalledTimes(1);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      initialHoverPick,
      initialPointerPosition,
      new Cartesian3(0, 0, 1)
    );

    mockedPerformanceNow.mockReturnValue(10);
    cesiumInteractionMocks.currentPointerPosition = nearbyPointerPosition;
    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
    });

    expect(
      pointQueryPickingMocks.resolvePreferredSurfacePick
    ).toHaveBeenCalledTimes(2);
    expect(
      pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
    ).toHaveBeenCalledTimes(1);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      nearbyHoverPick,
      nearbyPointerPosition,
      new Cartesian3(0, 0, 1)
    );

    mockedPerformanceNow.mockReturnValue(60);
    cesiumInteractionMocks.currentPointerPosition = refreshedPointerPosition;
    act(() => {
      cesiumInteractionMocks.pointerSubscriber?.();
      flushPreRender();
    });

    expect(
      pointQueryPickingMocks.resolvePreferredSurfacePick
    ).toHaveBeenCalledTimes(3);
    expect(
      pointQueryPickingMocks.sampleSurfacePickNormalAtScreenPosition
    ).toHaveBeenCalledTimes(2);
    expect(onPointerMove).toHaveBeenLastCalledWith(
      refreshedHoverPick,
      refreshedPointerPosition,
      new Cartesian3(0, 1, 0)
    );
  });
});
