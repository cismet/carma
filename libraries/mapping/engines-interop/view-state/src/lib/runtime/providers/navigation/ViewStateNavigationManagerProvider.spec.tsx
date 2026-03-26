// @vitest-environment jsdom

import { useContext, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { degToRadNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import { buildViewState } from "../../../core/construct";
import type { ViewState, ViewStateHashCodec } from "../../../core/types";
import { ViewStateContext } from "../view-state/ViewStateContext";
import { ViewStateNavigationManagerProvider } from "./ViewStateNavigationManagerProvider";
import { useViewStateNavigationManager } from "./useViewStateNavigationManager";
import { ViewStateProvider } from "../view-state/ViewStateProvider";

const updateHashMock = vi.fn();
let currentHashValues: Record<string, unknown> = {};

vi.mock("@carma-providers/hash-state", () => ({
  HASH_CLEAR_KEY_SET: {
    SCENE_VIEW_STATE: "scene-view-state",
  },
  useHashState: () => ({
    getHashValues: () => currentHashValues,
    updateHash: updateHashMock,
  }),
}));

const meters = (value: number): Meters => value as Meters;
const radians = (valueDeg: number): Radians =>
  degToRadNumeric(valueDeg)! as Radians;

const buildTestState = ({
  sourceId,
  source,
}: {
  sourceId: string;
  source: ViewState["metadata"]["source"];
}): ViewState =>
  buildViewState({
    longitude: radians(7.2),
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

const codec: ViewStateHashCodec = {
  encode: (state) =>
    state
      ? {
          lat: 51.27,
          lng: 7.2,
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

describe("ViewStateNavigationManagerProvider", () => {
  beforeEach(() => {
    currentHashValues = {};
    updateHashMock.mockReset();
  });

  it("decodes the initial restore state synchronously", () => {
    currentHashValues = {
      lat: 51.27,
    };

    const { result } = renderHook(() => useViewStateNavigationManager(), {
      wrapper,
    });

    expect(result.current.isInitialRestoreResolved).toBe(true);
    expect(result.current.initialRestoreState?.metadata.sourceId).toBe("hash");
    expect(result.current.initialRestoreState?.metadata.source).toBe("hash");
  });

  it("writes hash on explicit commits and records commit history", () => {
    const { result } = renderHook(
      () => ({
        navigation: useViewStateNavigationManager(),
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
        result.current.navigation.commitCurrentState("interaction-settled")
      ).toBe(true);
    });

    expect(updateHashMock).toHaveBeenCalledWith(
      {
        lat: 51.27,
        lng: 7.2,
        altitude: 180,
      },
      expect.objectContaining({
        clearKeySetIds: ["scene-view-state"],
        label: "ViewStateNavigationManager",
        replace: true,
      })
    );
    expect(result.current.navigation.getHistory().length).toBe(1);
    expect(result.current.navigation.getHistory().recent(1)[0]?.reason).toBe(
      "interaction-settled"
    );

    unregister?.();
  });
});
