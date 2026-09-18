import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleTileDiagnosticTask } from "./tile-diagnostic-scheduler";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("diagnostic scheduling modes", () => {
  it("defers frame-driven work outside rendering without waiting for idle", async () => {
    const tasks: Array<() => void> = [];
    const postTask = vi.fn((run: () => void, _options: { priority: string }) => {
      tasks.push(run);
      return Promise.resolve();
    });
    vi.stubGlobal("scheduler", { postTask });
    const run = vi.fn();
    scheduleTileDiagnosticTask(run, true);
    expect(run).not.toHaveBeenCalled();
    expect(postTask.mock.calls[0][1]).toEqual({ priority: "user-visible" });
    tasks.shift()!();
    expect(run).toHaveBeenCalledOnce();
    const cancel = scheduleTileDiagnosticTask(run);
    expect(postTask.mock.calls[1][1]).toEqual({ priority: "background" });
    cancel();
    tasks.shift()!();
    expect(run).toHaveBeenCalledOnce();
  });

  it("uses a cancellable immediate timer rather than idle fallback for frame mode", () => {
    vi.useFakeTimers();
    vi.stubGlobal("scheduler", undefined);
    const idle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    const run = vi.fn();
    const cancel = scheduleTileDiagnosticTask(run, true);
    expect(idle).not.toHaveBeenCalled();
    cancel();
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    scheduleTileDiagnosticTask(run, true);
    vi.advanceTimersByTime(0);
    expect(run).toHaveBeenCalledOnce();
    scheduleTileDiagnosticTask(run);
    expect(idle).toHaveBeenCalledOnce();
  });
});
