import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebGLRenderer } from "three";

import {
  benchmarkSunShadowPasses,
  waitForSunShadowBenchmarkFrame,
} from "./sun-shadow-benchmark";

class BenchmarkContext {
  QUERY_RESULT_AVAILABLE = 1;
  QUERY_RESULT = 2;
  NO_ERROR = 0;
  getExtension = vi.fn(() => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }));
  isContextLost = vi.fn(() => false);
  createQuery = vi.fn(() => ({}));
  beginQuery = vi.fn();
  endQuery = vi.fn();
  deleteQuery = vi.fn();
  getQueryParameter = vi.fn(() => false);
  getParameter = vi.fn(() => false);
  getError = vi.fn(() => 0);
}

describe("sun shadow benchmark lifecycle", () => {
  let frame: FrameRequestCallback | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("WebGL2RenderingContext", BenchmarkContext);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        frame = callback;
        return 1;
      })
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const run = (
    gl: BenchmarkContext,
    abort: AbortController,
    render = vi.fn()
  ) =>
    benchmarkSunShadowPasses(
      { getContext: () => gl } as unknown as WebGLRenderer,
      4,
      render,
      vi.fn(),
      abort.signal,
      vi.fn()
    );

  it("ends and deletes the timer query when a render callback throws", async () => {
    const gl = new BenchmarkContext();
    const result = run(
      gl,
      new AbortController(),
      vi.fn(() => {
        throw new Error("render failed");
      })
    );
    const rejected = expect(result).rejects.toThrow("render failed");
    frame?.(0);
    await rejected;
    expect(gl.endQuery).toHaveBeenCalledOnce();
    expect(gl.deleteQuery).toHaveBeenCalledOnce();
  });

  it("cancels and deletes a pending query without another animation frame", async () => {
    const gl = new BenchmarkContext();
    const abort = new AbortController();
    const result = run(gl, abort);
    const rejected = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    frame?.(0);
    await Promise.resolve();
    abort.abort();
    await rejected;
    expect(gl.endQuery).toHaveBeenCalledOnce();
    expect(gl.deleteQuery).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it("times out a pending query even when animation frames are suspended", async () => {
    const gl = new BenchmarkContext();
    const result = run(gl, new AbortController());
    const rejected = expect(result).rejects.toThrow("GPU timer timed out");
    frame?.(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_001);
    await rejected;
    expect(gl.deleteQuery).toHaveBeenCalledOnce();
  });

  it("rejects an already aborted wait without scheduling a frame", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      waitForSunShadowBenchmarkFrame(abort.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("removes the abort listener after a completed frame", async () => {
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, "removeEventListener");
    const result = waitForSunShadowBenchmarkFrame(abort.signal);
    frame?.(0);
    await result;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times complete custom case callbacks and excludes only warm-up results", async () => {
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => setTimeout(() => callback(0), 0))
    );
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const gl = new BenchmarkContext();
    gl.getQueryParameter.mockReturnValue(true);
    const events: string[] = [];
    gl.beginQuery.mockImplementation(() => {
      events.push("begin");
    });
    gl.endQuery.mockImplementation(() => {
      events.push("end");
    });
    const reset = vi.fn();
    const result = benchmarkSunShadowPasses(
      { getContext: () => gl } as unknown as WebGLRenderer,
      4,
      (round, mode) => {
        if (round === 0) events.push(`${mode}:capture`);
        events.push(`${mode}:sample`);
        if (round === 3) events.push(`${mode}:composite`);
      },
      reset,
      new AbortController().signal,
      vi.fn(),
      { cases: ["full", "full-rgb-reference"] }
    );
    await vi.runAllTimersAsync();
    const measurements = await result;
    expect(measurements.map(({ case: mode }) => mode)).toEqual([
      "full",
      "full-rgb-reference",
    ]);
    expect(
      measurements.every(({ measurements: values }) => values.length === 5)
    ).toBe(true);
    expect(reset).toHaveBeenCalledTimes(12);
    expect(events.slice(0, 8)).toEqual([
      "begin",
      "full:capture",
      "full:sample",
      "full:sample",
      "full:sample",
      "full:sample",
      "full:composite",
      "end",
    ]);
    expect(gl.deleteQuery).toHaveBeenCalledTimes(12);
  });
});
