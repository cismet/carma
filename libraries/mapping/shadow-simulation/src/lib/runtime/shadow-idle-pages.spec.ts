import { Box3, Group, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { prewarmShadowPages } from "./shadow-idle-pages";
import type { ShadowPrewarmResult } from "./tiled-shadow-renderer";

const fixture = () => {
  const controller = new AbortController();
  const group = new Group();
  const lease = {
    covered: true,
    group,
    isCurrent: vi.fn(() => true),
    dispose: vi.fn(),
  };
  const page = {
    id: "64:1:0",
    receiverBounds: new Box3(new Vector3(), new Vector3(64, 100, 64)),
    casterBounds: new Box3(new Vector3(), new Vector3(64, 100, 64)),
    width: 64,
    height: 64,
    samples: 3,
    sampleBudget: 3,
    cachedSamples: 0,
    limited: false,
    canPrewarm: true,
  };
  let samples = 0;
  const render = vi.fn(
    (
      pageId: string,
      _group: Group | null,
      _signal: AbortSignal
    ): ShadowPrewarmResult => ({
      pageId,
      rendered: 1 as const,
      cachedSamples: ++samples,
      totalSamples: 3,
      complete: samples === 3,
      budgetLimited: false,
      aborted: false,
    })
  );
  const options = {
    pages: [page],
    signal: controller.signal,
    prepare: vi.fn(async () => lease),
    render,
    yieldToInput: vi.fn(async () => undefined),
  };
  return { controller, lease, page, options };
};

describe("idle neighbouring shadow pages", () => {
  it("requires full coverage and yields before preparation and every sample", async () => {
    const f = fixture();
    const result = await prewarmShadowPages(f.options);
    expect(result).toEqual({
      offered: 1,
      completed: 1,
      renderedSamples: 3,
      skippedCoverage: 0,
      budgetLimited: false,
      aborted: false,
    });
    expect(f.options.yieldToInput).toHaveBeenCalledTimes(4);
    expect(f.options.render).toHaveBeenCalledWith(
      f.page.id,
      f.lease.group,
      f.controller.signal
    );
    expect(f.lease.dispose).toHaveBeenCalledOnce();
  });

  it("does not touch geometry for a fully cached page", async () => {
    const f = fixture();
    f.page.cachedSamples = 3;
    expect((await prewarmShadowPages(f.options)).completed).toBe(1);
    expect(f.options.prepare).not.toHaveBeenCalled();
    expect(f.options.render).not.toHaveBeenCalled();
  });

  it("does not fetch a corridor if no sample fits in spare memory", async () => {
    const f = fixture();
    f.page.canPrewarm = false;
    expect((await prewarmShadowPages(f.options)).budgetLimited).toBe(true);
    expect(f.options.prepare).not.toHaveBeenCalled();
    expect(f.options.render).not.toHaveBeenCalled();
  });

  it.each(["coverage", "stale"])(
    "skips %s leases without submitting shadows",
    async (reason) => {
      const f = fixture();
      if (reason === "coverage") f.lease.covered = false;
      else f.lease.isCurrent.mockReturnValue(false);
      expect((await prewarmShadowPages(f.options)).skippedCoverage).toBe(1);
      expect(f.options.render).not.toHaveBeenCalled();
      expect(f.lease.dispose).toHaveBeenCalledOnce();
    }
  );

  it("releases partial work immediately after input and never starts the next page", async () => {
    const f = fixture();
    f.options.pages.push({ ...f.page, id: "64:2:0" });
    f.options.yieldToInput.mockImplementation(async () => {
      if (f.options.render.mock.calls.length === 1) f.controller.abort();
    });
    const result = await prewarmShadowPages(f.options);
    expect(result.aborted).toBe(true);
    expect(result.renderedSamples).toBe(1);
    expect(result.completed).toBe(0);
    expect(f.options.prepare).toHaveBeenCalledOnce();
    expect(f.lease.dispose).toHaveBeenCalledOnce();
  });

  it("does not render a lease whose preparation completed after cancellation", async () => {
    const f = fixture();
    f.options.prepare.mockImplementation(async () => {
      f.controller.abort();
      return f.lease;
    });
    expect((await prewarmShadowPages(f.options)).aborted).toBe(true);
    expect(f.options.render).not.toHaveBeenCalled();
    expect(f.lease.dispose).toHaveBeenCalledOnce();
  });

  it("does not retry a full page and can still offer a smaller page", async () => {
    const f = fixture();
    f.options.pages.push({ ...f.page, id: "64:2:0" });
    f.options.render.mockReturnValue({
      pageId: f.page.id,
      rendered: 0,
      cachedSamples: 0,
      totalSamples: 3,
      complete: false,
      budgetLimited: true,
      aborted: false,
    });
    const result = await prewarmShadowPages(f.options);
    expect(result.budgetLimited).toBe(true);
    expect(result.completed).toBe(0);
    expect(f.options.prepare).toHaveBeenCalledTimes(2);
    expect(f.lease.dispose).toHaveBeenCalledTimes(2);
  });

  it("spreads a fair sample budget across neighbouring directions", async () => {
    const f = fixture();
    f.page.sampleBudget = 1;
    f.options.pages.push({ ...f.page, id: "64:2:0" });
    f.options.render.mockReturnValue({
      pageId: f.page.id,
      rendered: 1,
      cachedSamples: 1,
      totalSamples: 3,
      complete: false,
      budgetLimited: false,
      aborted: false,
    });
    const result = await prewarmShadowPages(f.options);
    expect(result.renderedSamples).toBe(2);
    expect(result.completed).toBe(0);
    expect(result.budgetLimited).toBe(true);
    expect(f.options.render.mock.calls.map(([id]) => id)).toEqual([
      "64:1:0",
      "64:2:0",
    ]);
  });

  it("releases resources after a renderer failure", async () => {
    const f = fixture();
    f.options.render.mockImplementation(() => {
      throw new Error("lost context");
    });
    await expect(prewarmShadowPages(f.options)).rejects.toThrow("lost context");
    expect(f.lease.dispose).toHaveBeenCalledOnce();
  });

  it("bounds a renderer that makes no progress", async () => {
    const f = fixture();
    f.options.render.mockReturnValue({
      pageId: f.page.id,
      rendered: 0,
      cachedSamples: 0,
      totalSamples: 3,
      complete: false,
      budgetLimited: false,
      aborted: false,
    });
    const result = await prewarmShadowPages(f.options);
    expect(result.completed).toBe(0);
    expect(f.options.render).toHaveBeenCalledOnce();
  });
});
