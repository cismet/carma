// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { createShadowIdleTerrainPrefetch } from "./shadow-idle-prefetch";

afterEach(() => vi.unstubAllGlobals());

const createScheduler = () => {
  const tasks: Array<{
    run: () => Promise<void>;
    reject: (reason: unknown) => void;
    options: { priority: string; delay: number; signal: AbortSignal };
  }> = [];
  const postTask = vi.fn(
    (
      callback: () => Promise<void>,
      options: { priority: string; delay: number; signal: AbortSignal }
    ) =>
      new Promise<void>((resolve, reject) => {
        tasks.push({
          options,
          reject,
          run: async () => {
            try {
              await callback();
              resolve();
            } catch (error) {
              reject(error);
            }
            // Drain the scheduler promise's reactions at a task boundary,
            // instead of assuming a particular number of microtasks.
            await new Promise<void>((nextTurn) => setImmediate(nextTurn));
          },
        });
      })
  );
  vi.stubGlobal("scheduler", { postTask });
  return { tasks, postTask };
};

describe("settled shadow terrain prefetch scheduling", () => {
  it("does nothing without the native background scheduler", () => {
    vi.stubGlobal("scheduler", undefined);
    const getRequest = vi.fn(() => null);
    const idle = createShadowIdleTerrainPrefetch({ getRequest });
    idle.onSettled();
    expect(getRequest).not.toHaveBeenCalled();
    idle.dispose();
  });

  it("schedules once per settled key and never runs preparation inline", async () => {
    const { tasks, postTask } = createScheduler();
    const run = vi.fn(async () => undefined);
    let key = "scene:epoch:pose";
    const idle = createShadowIdleTerrainPrefetch({
      getRequest: () => ({ key, run }),
    });
    idle.onSettled();
    idle.onSettled();
    expect(postTask).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    expect(tasks[0].options).toMatchObject({
      priority: "background",
      delay: 150,
    });
    await tasks[0].run();
    expect(run).toHaveBeenCalledWith(tasks[0].options.signal);
    idle.onSettled();
    expect(postTask).toHaveBeenCalledTimes(1);
    key = "scene:next-epoch:next-pose";
    idle.onSettled();
    expect(postTask).toHaveBeenCalledTimes(2);
    await tasks[1].run();
    idle.dispose();
  });

  it("does not queue retries while foreground coverage is unavailable", () => {
    const { postTask } = createScheduler();
    const idle = createShadowIdleTerrainPrefetch({ getRequest: () => null });
    idle.onSettled();
    idle.onSettled();
    expect(postTask).not.toHaveBeenCalled();
    idle.dispose();
  });

  it.each(["unavailable", "superseded"] as const)(
    "rechecks %s work after the background delay without retrying",
    async (change) => {
      const { tasks, postTask } = createScheduler();
      const run = vi.fn(async () => undefined);
      let current: { key: string; run: typeof run } | null = { key: "one", run };
      const idle = createShadowIdleTerrainPrefetch({ getRequest: () => current });
      idle.onSettled();
      current = change === "unavailable" ? null : { key: "two", run };
      await tasks[0].run();
      expect(run).not.toHaveBeenCalled();
      expect(postTask).toHaveBeenCalledTimes(1);
      idle.dispose();
    }
  );

  it("aborts a queued job and remains inert after disposal", async () => {
    const { tasks, postTask } = createScheduler();
    const run = vi.fn(async () => undefined);
    const idle = createShadowIdleTerrainPrefetch({
      getRequest: () => ({ key: "one", run }),
    });
    idle.onSettled();
    idle.cancel();
    expect(tasks[0].options.signal.aborted).toBe(true);
    await tasks[0].run();
    expect(run).not.toHaveBeenCalled();
    idle.dispose();
    idle.onSettled();
    expect(postTask).toHaveBeenCalledTimes(1);
  });

  it("coalesces new settled views behind an aborted running job without overlap", async () => {
    const { tasks, postTask } = createScheduler();
    let finish!: () => void;
    const run = vi.fn((key: string, signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return key === "one"
        ? new Promise<void>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve();
    });
    let key = "one";
    const idle = createShadowIdleTerrainPrefetch({
      getRequest: () => {
        const settledKey = key;
        return { key: settledKey, run: (signal) => run(settledKey, signal) };
      },
    });
    idle.onSettled();
    const running = tasks[0].run();
    expect(run).toHaveBeenCalledOnce();
    idle.cancel();
    tasks[0].reject(new Error("scheduler aborted before preparation finished"));
    key = "two";
    idle.onSettled();
    key = "three";
    idle.onSettled();
    await new Promise<void>((nextTurn) => setImmediate(nextTurn));
    expect(postTask).toHaveBeenCalledTimes(1);
    expect(tasks[0].options.signal.aborted).toBe(true);
    finish();
    await running;
    expect(postTask).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(1);
    await tasks[1].run();
    expect(run).toHaveBeenLastCalledWith("three", tasks[1].options.signal);
    expect(run).toHaveBeenCalledTimes(2);
    idle.onSettled();
    expect(postTask).toHaveBeenCalledTimes(2);
    idle.dispose();
  });

  it("rechecks pending settled work only after the busy runtime becomes available", async () => {
    const { tasks, postTask } = createScheduler();
    let finish!: () => void;
    let busy = false;
    let key = "one";
    const run = vi.fn(async () => {
      busy = true;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      busy = false;
    });
    const idle = createShadowIdleTerrainPrefetch({
      getRequest: () => (busy ? null : { key, run }),
    });
    idle.onSettled();
    const running = tasks[0].run();
    idle.cancel();
    key = "two";
    idle.onSettled();
    expect(postTask).toHaveBeenCalledTimes(1);
    finish();
    await running;
    expect(postTask).toHaveBeenCalledTimes(2);
    idle.dispose();
    await tasks[1].run();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each(["cancel", "dispose", "unavailable"] as const)(
    "drops a pending settled intent on %s without retrying",
    async (change) => {
      const { tasks, postTask } = createScheduler();
      let finish!: () => void;
      const run = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      let key = "one";
      let available = true;
      const idle = createShadowIdleTerrainPrefetch({
        getRequest: () => (available ? { key, run } : null),
      });
      idle.onSettled();
      const running = tasks[0].run();
      idle.cancel();
      key = "two";
      idle.onSettled();
      if (change === "cancel") idle.cancel();
      else if (change === "dispose") idle.dispose();
      else available = false;
      finish();
      await running;
      available = true;
      expect(postTask).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledTimes(1);
      idle.dispose();
    }
  );

  it("swallows failed speculative work without scheduling a retry", async () => {
    const { tasks, postTask } = createScheduler();
    const run = vi.fn(async () => {
      throw new Error("cache unavailable");
    });
    const idle = createShadowIdleTerrainPrefetch({
      getRequest: () => ({ key: "one", run }),
    });
    idle.onSettled();
    await tasks[0].run();
    idle.onSettled();
    expect(postTask).toHaveBeenCalledTimes(1);
    idle.dispose();
  });
});
