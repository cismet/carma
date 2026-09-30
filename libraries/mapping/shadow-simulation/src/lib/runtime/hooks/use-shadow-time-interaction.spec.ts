import { act, cleanup, renderHook } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, expect, it } from "vitest";
import {
  useShadowTimeInteraction,
  useShadowTimeInteractionState,
} from "./use-shadow-time-interaction";

afterEach(cleanup);

it("keeps gestures local to a map and releases only the departing control's lease", () => {
  const firstMap = {} as MaplibreMap;
  const secondMap = {} as MaplibreMap;
  const first = renderHook(() => useShadowTimeInteraction(firstMap));
  const sibling = renderHook(() => useShadowTimeInteraction(firstMap));
  const observer = renderHook(({ map }) => useShadowTimeInteractionState(map), {
    initialProps: { map: firstMap },
  });
  act(() => first.result.current(true));
  expect(observer.result.current).toBe(true);
  observer.rerender({ map: secondMap });
  expect(observer.result.current).toBe(false);
  observer.rerender({ map: firstMap });
  act(() => sibling.result.current(true));
  first.unmount();
  expect(observer.result.current).toBe(true);
  sibling.unmount();
  expect(observer.result.current).toBe(false);
});
