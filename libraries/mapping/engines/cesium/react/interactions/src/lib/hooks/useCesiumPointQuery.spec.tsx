import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cesiumInteractionMocks = vi.hoisted(() => ({
  handlers: [] as Array<{
    setInputAction: (callback: (event: { position: unknown }) => void, type: unknown) => void;
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
      type: unknown
    ) {
      this.inputActions.set(type, callback);
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
    },
  };
});

const pointQueryPickingMocks = vi.hoisted(() => ({
  resolvePreferredPointQueryPick: vi.fn(),
  samplePreferredPointQuerySurfaceNormal: vi.fn(),
}));

vi.mock("./pointQueryPicking", () => ({
  resolvePreferredPointQueryPick:
    pointQueryPickingMocks.resolvePreferredPointQueryPick,
  samplePreferredPointQuerySurfaceNormal:
    pointQueryPickingMocks.samplePreferredPointQuerySurfaceNormal,
}));

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
  ScreenSpaceEventType,
  type Scene,
} from "@carma-cesium";

import { useCesiumPointQuery } from "./useCesiumPointQuery";

const createFakeScene = () => {
  let preRenderListener: (() => void) | null = null;

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
    } as unknown as Scene,
    flushPreRender: () => {
      preRenderListener?.();
    },
  };
};

describe("useCesiumPointQuery", () => {
  beforeEach(() => {
    cesiumInteractionMocks.handlers = [];
    cesiumInteractionMocks.pointerSubscriber = null;
    cesiumInteractionMocks.currentPointerPosition = null;
    pointQueryPickingMocks.resolvePreferredPointQueryPick.mockReset();
    pointQueryPickingMocks.samplePreferredPointQuerySurfaceNormal.mockReset();
    pointQueryPickingMocks.samplePreferredPointQuerySurfaceNormal.mockReturnValue(
      null
    );
    scenePointerTrackerMocks.registerCesiumScenePointerTracker.mockClear();
    scenePointerTrackerMocks.subscribeCesiumScenePointerClientPosition.mockClear();
    scenePointerTrackerMocks.getCesiumScenePointerScreenPosition.mockClear();
  });

  it("repicks hover state after point creation even when the pointer has not moved", () => {
    const initialHoverPick = new Cartesian3(1, 2, 3);
    const clickPick = new Cartesian3(4, 5, 6);
    const refreshedHoverPick = new Cartesian3(7, 8, 9);
    pointQueryPickingMocks.resolvePreferredPointQueryPick
      .mockReturnValueOnce({
        pickedPositionECEF: initialHoverPick,
        scenePositionECEF: initialHoverPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        pickedPositionECEF: clickPick,
        scenePositionECEF: clickPick,
        globePositionECEF: null,
      })
      .mockReturnValueOnce({
        pickedPositionECEF: refreshedHoverPick,
        scenePositionECEF: refreshedHoverPick,
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
      activeHandler?.inputActions
        .get(ScreenSpaceEventType.LEFT_CLICK)
        ?.({ position: pointerPosition });
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
});