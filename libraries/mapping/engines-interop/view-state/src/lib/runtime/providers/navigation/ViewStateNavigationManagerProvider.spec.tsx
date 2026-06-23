// @vitest-environment jsdom

import { useContext, useRef, type PropsWithChildren } from "react";

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { degToRadNumeric } from "@carma-units";
import type { Meters, Radians } from "@carma-units";

import { ViewStateContext } from "../view-state/ViewStateContext";
import { ViewStateProvider } from "../view-state/ViewStateProvider";
import { buildViewState } from "../../../core/construct";
import {
  VIEW_STATE_NAVIGATION_EVENT,
  type ViewState,
  type ViewStateNavigationEvent,
} from "../../../core/types";
import { useOnViewStateNavigationEvent } from "./useOnViewStateNavigationEvent";
import { useViewStateNavigationContext } from "./useViewStateNavigationContext";
import { useViewStateNavigationRestore } from "./useViewStateNavigationRestore";
import { ViewStateNavigationManagerProvider } from "./ViewStateNavigationManagerProvider";
const updateHashMock = vi.fn();
let currentHashParams: Record<string, unknown> = {};
let popStateListener:
  | ((event: {
      stateValues: Record<string, unknown>;
      hashParams: Record<string, string>;
      changedStateKeys: string[];
      removedStateKeys: string[];
      source: "popstate";
    }) => void)
  | undefined;

vi.mock("@carma-providers/hash-state", () => ({
  HASH_CLEAR_STATE_KEY_SET: {
    SCENE_VIEW_STATE: "scene-view-state",
  },
  useHashState: () => ({
    getHashStateValues: () => currentHashParams,
    registerOnPopState: (callback: NonNullable<typeof popStateListener>) => {
      popStateListener = callback;
      return () => {
        if (popStateListener === callback) {
          popStateListener = undefined;
        }
      };
    },
    updateHashState: updateHashMock,
  }),
}));

const meters = (value: number): Meters => value as Meters;
const radians = (valueDeg: number): Radians =>
  degToRadNumeric(valueDeg)! as Radians;

const RESTORE_HASH_PARAMS = {
  lat: 51.27,
  lng: 7.2,
  altitude: 180,
  bearing: 195,
  fov: 60,
  pitch: 58,
  zoom: 17.003,
};

const RESTORE_HASH_PARAM_STRINGS = Object.fromEntries(
  Object.entries(RESTORE_HASH_PARAMS).map(([key, value]) => [
    key,
    String(value),
  ])
);

const buildTestState = ({
  sourceId,
  source,
  lng = 7.2,
}: {
  sourceId: string;
  source: ViewState["metadata"]["source"];
  lng?: number;
}): ViewState =>
  buildViewState({
    longitude: radians(lng),
    latitude: radians(51.27),
    altitude: meters(180),
    bearing: radians(195),
    pitch: radians(58),
    range: meters(620),
    intrinsics: {
      type: CAMERA_TYPE.PERSPECTIVE,
      fov: radians(60),
    },
    metadata: {
      frameId: 1,
      timestampMs: 1_700_000_000_000,
      sourceId,
      source,
    },
  });

const wrapper = ({ children }: PropsWithChildren) => (
  <ViewStateProvider>
    <ViewStateNavigationManagerProvider>
      {children}
    </ViewStateNavigationManagerProvider>
  </ViewStateProvider>
);

const useNavigationEventCollector = () => {
  const eventsRef = useRef<ViewStateNavigationEvent[]>([]);
  useOnViewStateNavigationEvent((event) => {
    eventsRef.current.push(event);
  });
  return eventsRef;
};

describe("ViewStateNavigationManagerProvider", () => {
  beforeEach(() => {
    currentHashParams = {};
    popStateListener = undefined;
    updateHashMock.mockReset();
  });

  it("decodes the initial restore state synchronously", () => {
    currentHashParams = RESTORE_HASH_PARAMS;

    const { result } = renderHook(() => useViewStateNavigationRestore(), {
      wrapper,
    });

    expect(result.current.isRestoreResolved).toBe(true);
    expect(result.current.restoreState?.metadata.sourceId).toBe(
      "shareable-hash-restore"
    );
    expect(result.current.restoreState?.metadata.source).toBe("restore");
  });

  it("writes hash on explicit commits", () => {
    const { result } = renderHook(
      () => ({
        navigationContext: useViewStateNavigationContext(),
        viewStateContext: useContext(ViewStateContext),
      }),
      {
        wrapper,
      }
    );

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = result.current.viewStateContext?.register(
        "cesium",
        "cesium"
      );
      result.current.viewStateContext?.claimControl("cesium", "sync");
      result.current.viewStateContext?.update(
        buildTestState({
          sourceId: "cesium",
          source: "sync",
        }),
        {
          sourceId: "cesium",
          timestampMs: 1_700_000_000_001,
          priority: "sync",
        }
      );
    });

    act(() => {
      expect(
        result.current.navigationContext.commitCurrentState(
          "interaction-settled"
        )
      ).toBe(true);
    });

    expect(updateHashMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: expect.any(Number),
        lng: expect.any(Number),
        altitude: expect.any(Number),
        zoom: expect.any(Number),
      }),
      expect.objectContaining({
        clearStateKeySetIds: ["scene-view-state"],
        label: "ViewStateNavigationManagerProvider",
        replace: true,
      })
    );

    unregister?.();
  });

  it("updates restore state and emits a browser navigation event on popstate", () => {
    const { result } = renderHook(
      () => ({
        navigationRestore: useViewStateNavigationRestore(),
        viewStateContext: useContext(ViewStateContext),
        navigationEventsRef: useNavigationEventCollector(),
      }),
      {
        wrapper,
      }
    );

    act(() => {
      popStateListener?.({
        stateValues: RESTORE_HASH_PARAMS,
        hashParams: RESTORE_HASH_PARAM_STRINGS,
        changedStateKeys: ["lat"],
        removedStateKeys: [],
        source: "popstate",
      });
    });

    expect(
      result.current.navigationRestore.restoreState?.metadata.sourceId
    ).toBe("shareable-hash-restore");
    expect(result.current.viewStateContext?.getState()).toBeNull();
    expect(result.current.navigationEventsRef.current).toEqual([
      expect.objectContaining({
        type: VIEW_STATE_NAVIGATION_EVENT.BROWSER_POPSTATE_RESTORE,
      }),
    ]);
    expect(
      result.current.navigationEventsRef.current[0]?.state.metadata.sourceId
    ).toBe("shareable-hash-restore");
  });

  it("does not emit a navigation event when popstate does not decode to a view state", () => {
    const { result } = renderHook(
      () => {
        const eventsRef = useRef<ViewStateNavigationEvent[]>([]);
        useOnViewStateNavigationEvent((event) => {
          eventsRef.current.push(event);
        });
        return {
          navigationRestore: useViewStateNavigationRestore(),
          eventsRef,
        };
      },
      {
        wrapper,
      }
    );

    act(() => {
      popStateListener?.({
        stateValues: {},
        hashParams: {},
        changedStateKeys: [],
        removedStateKeys: ["lat"],
        source: "popstate",
      });
    });

    expect(result.current.navigationRestore.restoreState).toBeNull();
    expect(result.current.eventsRef.current).toEqual([]);
  });

  it("does not push a duplicate hash entry on the first settle after popstate restore", () => {
    const { result } = renderHook(
      () => ({
        navigationContext: useViewStateNavigationContext(),
        viewStateContext: useContext(ViewStateContext),
      }),
      {
        wrapper,
      }
    );

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = result.current.viewStateContext?.register(
        "cesium",
        "cesium"
      );
      result.current.viewStateContext?.claimControl("cesium", "sync");
    });

    act(() => {
      popStateListener?.({
        stateValues: RESTORE_HASH_PARAMS,
        hashParams: RESTORE_HASH_PARAM_STRINGS,
        changedStateKeys: ["lat"],
        removedStateKeys: [],
        source: "popstate",
      });
      result.current.viewStateContext?.update(
        buildTestState({
          sourceId: "cesium",
          source: "restore",
        }),
        {
          sourceId: "cesium",
          timestampMs: 1_700_000_000_001,
          priority: "sync",
        }
      );
    });

    act(() => {
      expect(
        result.current.navigationContext.commitCurrentState(
          "interaction-settled",
          {
            replace: false,
          }
        )
      ).toBe(false);
    });

    expect(updateHashMock).not.toHaveBeenCalled();

    unregister?.();
  });

  it("pushes a new hash entry once the shared state no longer matches the restored hash", () => {
    const { result } = renderHook(
      () => ({
        navigationContext: useViewStateNavigationContext(),
        viewStateContext: useContext(ViewStateContext),
      }),
      {
        wrapper,
      }
    );

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = result.current.viewStateContext?.register(
        "cesium-after-interaction",
        "cesium"
      );
      result.current.viewStateContext?.claimControl(
        "cesium-after-interaction",
        "user-interaction"
      );
      popStateListener?.({
        stateValues: RESTORE_HASH_PARAMS,
        hashParams: RESTORE_HASH_PARAM_STRINGS,
        changedStateKeys: ["lat"],
        removedStateKeys: [],
        source: "popstate",
      });
      result.current.viewStateContext?.update(
        buildTestState({
          sourceId: "cesium-after-interaction",
          source: "user-interaction",
          lng: 7.4,
        }),
        {
          sourceId: "cesium-after-interaction",
          timestampMs: 1_700_000_000_002,
          priority: "user-interaction",
        }
      );
    });

    act(() => {
      expect(
        result.current.navigationContext.commitCurrentState(
          "interaction-settled",
          {
            replace: false,
          }
        )
      ).toBe(true);
    });

    expect(updateHashMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 51.27,
        lng: 7.4,
        altitude: 180,
        zoom: expect.any(Number),
      }),
      expect.objectContaining({
        clearStateKeySetIds: ["scene-view-state"],
        replace: false,
      })
    );

    unregister?.();
  });
});
