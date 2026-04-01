// @vitest-environment jsdom

import { useContext, type PropsWithChildren } from "react";

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { type Scene } from "@carma-cesium";
import { degToRadNumeric } from "@carma-units";
import type { Meters, Radians } from "@carma-units";

import { ViewStateNavigationManagerProvider } from "../providers/navigation/ViewStateNavigationManagerProvider";
import { ViewStateContext } from "../providers/view-state/ViewStateContext";
import { ViewStateProvider } from "../providers/view-state/ViewStateProvider";
import { buildViewState } from "../../core/construct";
import type { ViewState, ViewStateHashCodec } from "../../core/types";
import { useCesiumNavigationBridge } from "./useCesiumNavigationBridge";
const updateHashMock = vi.fn();
const publishCurrentStateMock = vi.fn(() => true);
const claimControlMock = vi.fn(() => true);
const releaseControlMock = vi.fn();
const pushStateMock = vi.fn();
const readCurrentStateMock = vi.fn(() => null);

let currentHashValues: Record<string, unknown> = {};
let lastOnInteraction: (() => void) | undefined;

vi.mock("@carma-providers/hash-state", () => ({
  HASH_CLEAR_KEY_SET: {
    SCENE_VIEW_STATE: "scene-view-state",
  },
  useHashState: () => ({
    getHashValues: () => currentHashValues,
    registerOnPopState: () => () => {
      // intentionally no-op for bridge-level tests
    },
    updateHash: updateHashMock,
  }),
}));

vi.mock("./useCesiumRuntimeBridge", () => ({
  useCesiumRuntimeBridge: (
    options: {
      onInteraction?: () => void;
    } = {}
  ) => {
    lastOnInteraction = options.onInteraction;
    return {
      isController: false,
      claimControl: claimControlMock,
      releaseControl: releaseControlMock,
      pushState: pushStateMock,
      publishCurrentState: publishCurrentStateMock,
      readCurrentState: readCurrentStateMock,
    };
  },
}));

const meters = (value: number): Meters => value as Meters;
const radians = (valueDeg: number): Radians =>
  degToRadNumeric(valueDeg)! as Radians;

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
      timestampMs: Date.now(),
      sourceId,
      source,
    },
  });

const codec: ViewStateHashCodec = {
  encode: (state) =>
    state
      ? {
          lat: 51.27,
          lng:
            state.metadata.sourceId === "cesium-after-interaction" ? 7.4 : 7.2,
          altitude: 180,
        }
      : null,
  decode: (hashValues) =>
    typeof hashValues.lat === "number"
      ? buildTestState({
          sourceId: "hash",
          source: "hash",
        })
      : null,
};

const wrapper = ({ children }: PropsWithChildren) => (
  <ViewStateProvider>
    <ViewStateNavigationManagerProvider codec={codec}>
      {children}
    </ViewStateNavigationManagerProvider>
  </ViewStateProvider>
);

const createSceneStub = (): Scene =>
  ({
    canvas: document.createElement("div"),
    camera: {
      moveEnd: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    },
    morphComplete: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  } as unknown as Scene);

describe("useCesiumNavigationBridge", () => {
  beforeEach(() => {
    currentHashValues = {};
    lastOnInteraction = undefined;
    updateHashMock.mockReset();
    publishCurrentStateMock.mockClear();
    claimControlMock.mockClear();
    releaseControlMock.mockClear();
    pushStateMock.mockClear();
    readCurrentStateMock.mockClear();
  });

  it("suppresses commits until the user interacts with the canvas again", () => {
    const scene = createSceneStub();
    const { result } = renderHook(
      () => ({
        bridge: useCesiumNavigationBridge({
          id: "cesium",
          scene,
        }),
        viewStateContext: useContext(ViewStateContext),
      }),
      { wrapper }
    );

    let unregister: (() => void) | undefined;
    act(() => {
      unregister = result.current.viewStateContext?.register(
        "cesium-after-interaction",
        "cesium"
      );
    });

    act(() => {
      result.current.bridge.suppressCommitsUntilInteraction();
    });

    act(() => {
      expect(
        result.current.bridge.commitCurrentSceneState("interaction-settled", {
          replace: false,
        })
      ).toBe(false);
      expect(
        result.current.bridge.commitCurrentSceneState("interaction-settled", {
          replace: false,
        })
      ).toBe(false);
    });

    expect(updateHashMock).not.toHaveBeenCalled();
    expect(publishCurrentStateMock).toHaveBeenCalledTimes(2);

    act(() => {
      lastOnInteraction?.();
      result.current.viewStateContext?.claimControl(
        "cesium-after-interaction",
        "user-interaction"
      );
      result.current.viewStateContext?.update(
        buildTestState({
          sourceId: "cesium-after-interaction",
          source: "user-interaction",
          lng: 7.4,
        }),
        {
          sourceId: "cesium-after-interaction",
          timestampMs: Date.now() + 1,
          priority: "user-interaction",
        }
      );
    });

    act(() => {
      expect(
        result.current.bridge.commitCurrentSceneState("interaction-settled", {
          replace: false,
        })
      ).toBe(true);
    });

    expect(updateHashMock).toHaveBeenCalledTimes(1);
    expect(updateHashMock).toHaveBeenCalledWith(
      {
        lat: 51.27,
        lng: 7.4,
        altitude: 180,
      },
      expect.objectContaining({
        clearKeySetIds: ["scene-view-state"],
        replace: false,
      })
    );

    unregister?.();
  });
});
