import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Milliseconds } from "@carma-units";
import { createPointQueryDiscPresentation } from "./point-query-disc-presentation";
const a = new Vector3(6378137, 0, 0),
  b = a.clone().add(new Vector3(10, 30, -4)),
  c = a.clone().add(new Vector3(-20, 50, 10));
const close = (actual: Vector3, expected: Vector3) =>
  expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
beforeEach(() =>
  vi.useFakeTimers({
    toFake: ["performance", "setTimeout", "clearTimeout", "Date"],
  })
);
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("visual-only snap position presentation", () => {
  it("follows unsnapped input immediately and enters a snap over the configured 300ms", () => {
    const p = createPointQueryDiscPresentation(null);
    close(p.resolvePoint(a, false).pointECEF, a);
    close(p.resolvePoint(c, false).pointECEF, c);
    const target = b.clone();
    const first = p.resolvePoint(target, true);
    close(first.pointECEF, c);
    expect(first.animating).toBe(true);
    vi.advanceTimersByTime(75);
    close(p.resolvePoint(target, true).pointECEF, c.clone().lerp(b, 0.15625));
    vi.advanceTimersByTime(75);
    close(p.resolvePoint(target, true).pointECEF, c.clone().lerp(b, 0.5));
    vi.advanceTimersByTime(150);
    const final = p.resolvePoint(target, true);
    close(final.pointECEF, b);
    expect(final.animating).toBe(false);
    expect(target.equals(b)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not restart on frames at the same snap target", () => {
    const p = createPointQueryDiscPresentation(null);
    p.resolvePoint(a, false);
    p.resolvePoint(b, true);
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(10);
      p.resolvePoint(b.clone(), true);
    }
    const final = p.resolvePoint(b, true);
    close(final.pointECEF, b);
    expect(final.animating).toBe(false);
  });
  it("returns toward the moving surface endpoint without restarting its clock", () => {
    const p = createPointQueryDiscPresentation(null);
    p.resolvePoint(b, true);
    close(p.resolvePoint(a, false).pointECEF, b);
    vi.advanceTimersByTime(100);
    p.resolvePoint(a, false);
    vi.advanceTimersByTime(50);
    close(p.resolvePoint(c, false).pointECEF, b.clone().lerp(c, 0.5));
    vi.advanceTimersByTime(150);
    const final = p.resolvePoint(a, false);
    close(final.pointECEF, a);
    expect(final.animating).toBe(false);
    close(p.resolvePoint(c, false).pointECEF, c);
  });
  it("retargets snap-to-snap travel from the currently displayed point", () => {
    const p = createPointQueryDiscPresentation(null);
    p.resolvePoint(a, false);
    p.resolvePoint(b, true);
    vi.advanceTimersByTime(150);
    const middle = p.resolvePoint(b, true).pointECEF.clone();
    close(p.resolvePoint(c, true).pointECEF, middle);
    vi.advanceTimersByTime(150);
    close(p.resolvePoint(c, true).pointECEF, middle.clone().lerp(c, 0.5));
    vi.advanceTimersByTime(150);
    close(p.resolvePoint(c, true).pointECEF, c);
  });
  it("interrupts rapid lock/unlock changes without a jump", () => {
    const p = createPointQueryDiscPresentation(null);
    p.resolvePoint(a, false);
    p.resolvePoint(b, true);
    vi.advanceTimersByTime(100);
    const entry = p.resolvePoint(b, true).pointECEF.clone();
    close(p.resolvePoint(c, false).pointECEF, entry);
    vi.advanceTimersByTime(100);
    const exit = p.resolvePoint(c, false).pointECEF.clone();
    close(p.resolvePoint(a, true).pointECEF, exit);
    vi.advanceTimersByTime(300);
    const final = p.resolvePoint(a, true);
    close(final.pointECEF, a);
    expect(final.animating).toBe(false);
  });
  it("preserves travel across style refresh but resets for a cleared preview", () => {
    const p = createPointQueryDiscPresentation(null);
    p.resolvePoint(a, false);
    p.resolvePoint(b, true);
    vi.advanceTimersByTime(100);
    const before = p.resolvePoint(b, true).pointECEF.clone();
    p.clear({ preserveSnapTravel: true });
    close(p.resolvePoint(b, true).pointECEF, before);
    vi.advanceTimersByTime(200);
    expect(p.resolvePoint(b, true).animating).toBe(false);
    p.resolvePoint(c, false);
    p.clear();
    const first = p.resolvePoint(a, true);
    close(first.pointECEF, a);
    expect(first.animating).toBe(false);
  });
  it.each([0, -1])(
    "uses immediate snap changes for a duration of %s",
    (duration) => {
      const p = createPointQueryDiscPresentation(null, {
        snapAnimationDurationMs: duration as Milliseconds,
      });
      p.resolvePoint(a, false);
      const snapped = p.resolvePoint(b, true);
      close(snapped.pointECEF, b);
      expect(snapped.animating).toBe(false);
      close(p.resolvePoint(c, false).pointECEF, c);
    }
  );
  it("uses the 300ms default for a nonfinite duration", () => {
    const p = createPointQueryDiscPresentation(null, {
      snapAnimationDurationMs: NaN as Milliseconds,
    });
    p.resolvePoint(a, false);
    p.resolvePoint(b, true);
    vi.advanceTimersByTime(150);
    close(p.resolvePoint(b, true).pointECEF, a.clone().lerp(b, 0.5));
    vi.advanceTimersByTime(150);
    expect(p.resolvePoint(b, true).animating).toBe(false);
  });
  it("respects reduced motion and finishes an ongoing transition immediately if preference changes", () => {
    const media = { matches: false } as MediaQueryList;
    vi.stubGlobal("matchMedia", () => media);
    const p = createPointQueryDiscPresentation(null);
    p.resolvePoint(a, false);
    p.resolvePoint(b, true);
    vi.advanceTimersByTime(100);
    Object.assign(media, { matches: true });
    const final = p.resolvePoint(b, true);
    close(final.pointECEF, b);
    expect(final.animating).toBe(false);
    close(p.resolvePoint(c, false).pointECEF, c);
  });
  it("keeps the radius label hold independent of snap travel and style refresh", () => {
    const label = document.createElement("div"),
      p = createPointQueryDiscPresentation(label);
    p.resolveRadius(5);
    p.resolvePoint(a, false);
    vi.advanceTimersByTime(2700);
    p.resolvePoint(b, true);
    p.clear({ preserveSnapTravel: true });
    p.resolveRadius(5);
    expect(label.style.opacity).toBe("1");
    vi.advanceTimersByTime(299);
    p.resolvePoint(b, true);
    p.resolveRadius(5);
    expect(label.style.opacity).toBe("1");
    vi.advanceTimersByTime(1);
    p.resolvePoint(b, true);
    p.resolveRadius(5);
    expect(label.style.opacity).toBe("0");
    expect(vi.getTimerCount()).toBe(0);
  });
});
