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

vi.mock("@carma-providers/hash-state", () => ({
  HASH_CLEAR_KEY_SET: {
    SCENE_VIEW_STATE: "scene-view-state",
  },
  useHashState: () => ({
    getHashValues: () => ({}),
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
  decode: () => null,
};

const wrapper = ({ children }: PropsWithChildren) => (
  <ViewStateProvider>
    <ViewStateNavigationManagerProvider codec={codec}>
      {children}
    </ViewStateNavigationManagerProvider>
  </ViewStateProvider>
);

describe("useViewStateNavigationManager", () => {
  beforeEach(() => {
    updateHashMock.mockReset();
  });

  it("updates the latest commit event and allows forced transition commits", () => {
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
      expect(
        result.current.navigation.commitCurrentState("interaction-settled")
      ).toBe(false);
      expect(
        result.current.navigation.commitCurrentState("transition-complete", {
          force: true,
        })
      ).toBe(true);
    });

    expect(updateHashMock).toHaveBeenCalledTimes(2);
    expect(result.current.navigation.latestCommitEvent?.reason).toBe(
      "transition-complete"
    );
    expect(
      result.current.navigation.latestCommittedState?.metadata.sourceId
    ).toBe("cesium");

    unregister?.();
  });
});
