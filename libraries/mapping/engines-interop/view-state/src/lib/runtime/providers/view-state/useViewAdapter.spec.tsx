// @vitest-environment jsdom

import { useContext, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { degToRadNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import { buildViewState } from "../../../core/construct";
import { type ViewState } from "../../../core/types";
import { ViewStateContext } from "./ViewStateContext";
import { useViewAdapter } from "./useViewAdapter";
import { ViewStateProvider } from "./ViewStateProvider";

const meters = (value: number): Meters => value as Meters;
const radians = (valueDeg: number): Radians =>
  degToRadNumeric(valueDeg)! as Radians;

const buildTestState = (sourceId: string): ViewState =>
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
      source: "sync",
    },
  });

const wrapper = ({ children }: PropsWithChildren) => (
  <ViewStateProvider>{children}</ViewStateProvider>
);

describe("useViewAdapter", () => {
  it("does not re-apply incoming state when it originated from the same adapter", async () => {
    const apply = vi.fn();
    const { result } = renderHook(
      () => {
        const ctx = useContext(ViewStateContext);
        useViewAdapter("slot-2", "maplibre", {
          apply,
        });
        return ctx;
      },
      { wrapper }
    );

    act(() => {
      result.current?.update(buildTestState("slot-2"), {
        sourceId: "slot-2",
        timestampMs: 1_700_000_000_001,
        priority: "sync",
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(apply).not.toHaveBeenCalled();
  });

  it("applies incoming state from a different adapter", async () => {
    const apply = vi.fn();
    const { result } = renderHook(
      () => {
        const ctx = useContext(ViewStateContext);
        useViewAdapter("slot-2", "maplibre", {
          apply,
        });
        return ctx;
      },
      { wrapper }
    );

    let unregisterOther: (() => void) | undefined;
    act(() => {
      unregisterOther = result.current?.register("slot-1", "cesium");
      result.current?.claimControl("slot-1", "sync");
      result.current?.update(buildTestState("slot-1"), {
        sourceId: "slot-1",
        timestampMs: 1_700_000_000_002,
        priority: "sync",
      });
    });

    await waitFor(() => {
      expect(apply).toHaveBeenCalledTimes(1);
    });

    unregisterOther?.();
  });
});
