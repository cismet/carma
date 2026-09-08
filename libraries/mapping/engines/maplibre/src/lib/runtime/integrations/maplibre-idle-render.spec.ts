import { describe, expect, it, vi } from "vitest";
import { runMapLibreIdleRender } from "./maplibre-idle-render";

describe("MapLibre idle GPU ownership boundary", () => {
  it.each([false, true])(
    "invalidates all host bindings after external work, including failure=%s",
    (fail) => {
      const order: string[] = [];
      const painter = {
        context: {
          setDirty: vi.fn(function () {
            expect(this).toBe(painter.context);
            order.push("dirty");
          }),
        },
        setBaseState: vi.fn(function () {
          expect(this).toBe(painter);
          order.push("base");
        }),
      };
      const render = () => {
        order.push("render");
        if (fail) throw new Error("context lost");
      };
      if (fail)
        expect(() =>
          runMapLibreIdleRender({ painter } as never, render)
        ).toThrow("context lost");
      else
        expect(runMapLibreIdleRender({ painter } as never, render)).toBe(true);
      expect(order).toEqual(["render", "dirty", "base"]);
    }
  );

  it.each([
    null,
    {},
    { painter: {} },
    { painter: { context: { setDirty: () => undefined } } },
  ])("skips work on unsupported hosts", (map) => {
    const render = vi.fn();
    expect(runMapLibreIdleRender(map as never, render)).toBe(false);
    expect(render).not.toHaveBeenCalled();
  });
});
