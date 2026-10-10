import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { degToRadNumeric, type Radians } from "@carma-units";
import { CardinalDirectionEnum } from "../../core/utils/orientation";
import { useActiveDirection } from "./useActiveDirection";

const calibrated = [55, 145, 235, 325].map(
  (value) => degToRadNumeric(value) as Radians
);
const setup = () => {
  let bearing = 55;
  const listeners = new Map<string, Set<() => void>>();
  const map = {
    getBearing: () => bearing,
    on: vi.fn((event: string, callback: () => void) => {
      const callbacks = listeners.get(event) ?? new Set<() => void>();
      callbacks.add(callback);
      listeners.set(event, callbacks);
    }),
    off: vi.fn((event: string, callback: () => void) =>
      listeners.get(event)?.delete(callback)
    ),
  };
  return {
    map: map as unknown as MaplibreMap,
    rawMap: map,
    onChange: vi.fn(),
    rotate: (value: number, event = "rotate") =>
      act(() => {
        bearing = value;
        listeners.get(event)?.forEach((callback) => callback());
      }),
  };
};

describe("active photo direction", () => {
  it("labels calibrated series North independently of the true-world quadrant", () => {
    const f = setup();
    const hook = renderHook(() =>
      useActiveDirection({
        map: f.map,
        onChange: f.onChange,
        enabled: true,
        busy: false,
        headingOffsetDeg: 0,
        cardinalHeadings: calibrated,
      })
    );
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.North);
    f.rotate(145);
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.East);
    f.rotate(235, "moveend");
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.South);
    f.rotate(-35);
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.West);
    hook.unmount();
    const count = f.onChange.mock.calls.length;
    f.rotate(55);
    expect(f.onChange).toHaveBeenCalledTimes(count);
    expect(f.rawMap.off).toHaveBeenCalledTimes(2);
  });

  it("retains the existing zero/default and configured-offset behavior without provided headings", () => {
    const f = setup();
    const hook = renderHook(
      ({ headingOffsetDeg }) =>
        useActiveDirection({
          map: f.map,
          onChange: f.onChange,
          enabled: true,
          busy: false,
          headingOffsetDeg,
        }),
      { initialProps: { headingOffsetDeg: 0 } }
    );
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.East);
    f.rotate(0);
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.North);
    hook.rerender({ headingOffsetDeg: 55 });
    f.rotate(55);
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.North);
    hook.unmount();
  });

  it("keeps stable arrays subscribed and updates when the supplied series headings change", () => {
    const f = setup();
    const hook = renderHook(
      ({ cardinalHeadings }) =>
        useActiveDirection({
          map: f.map,
          onChange: f.onChange,
          enabled: true,
          busy: false,
          headingOffsetDeg: 0,
          cardinalHeadings,
        }),
      { initialProps: { cardinalHeadings: calibrated } }
    );
    expect(f.rawMap.on).toHaveBeenCalledTimes(2);
    expect(f.onChange).toHaveBeenCalledOnce();
    hook.rerender({ cardinalHeadings: calibrated });
    expect(f.rawMap.on).toHaveBeenCalledTimes(2);
    expect(f.onChange).toHaveBeenCalledOnce();
    hook.rerender({
      cardinalHeadings: [0, 90, 180, 270].map(
        (value) => degToRadNumeric(value) as Radians
      ),
    });
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.East);
    expect(f.rawMap.off).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it("preserves busy suppression, disabled/null clearing, and callback replacement", () => {
    const f = setup();
    const hook = renderHook(
      (props) =>
        useActiveDirection({
          headingOffsetDeg: 0,
          cardinalHeadings: calibrated,
          ...props,
        }),
      {
        initialProps: {
          map: f.map as MaplibreMap | null,
          onChange: f.onChange,
          enabled: true,
          busy: true,
        },
      }
    );
    f.rotate(145);
    expect(f.onChange).not.toHaveBeenCalled();
    hook.rerender({
      map: f.map,
      onChange: f.onChange,
      enabled: true,
      busy: false,
    });
    expect(f.onChange).toHaveBeenLastCalledWith(CardinalDirectionEnum.East);
    const next = vi.fn();
    hook.rerender({ map: f.map, onChange: next, enabled: true, busy: false });
    expect(next).toHaveBeenLastCalledWith(CardinalDirectionEnum.East);
    const oldCount = f.onChange.mock.calls.length;
    f.rotate(55);
    expect(next).toHaveBeenLastCalledWith(CardinalDirectionEnum.North);
    expect(f.onChange).toHaveBeenCalledTimes(oldCount);
    hook.rerender({ map: f.map, onChange: next, enabled: false, busy: false });
    expect(next).toHaveBeenLastCalledWith(null);
    const count = next.mock.calls.length;
    f.rotate(145);
    expect(next).toHaveBeenCalledTimes(count);
    hook.rerender({ map: null, onChange: next, enabled: true, busy: false });
    expect(next).toHaveBeenCalledTimes(count + 1);
    expect(next).toHaveBeenLastCalledWith(null);
    hook.unmount();
  });
});
