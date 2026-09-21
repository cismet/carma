import type { MappingConfig } from "@carma-api";
import type { TransitionStep } from "@carma-mapping/show-remote";

import { createLatestWinsWriter, runSteps } from "./display-link";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const config = (id: string): MappingConfig => ({ layers: [{ id }] });

const step = (id: string, holdMs: number): TransitionStep => ({
  config: config(id),
  holdMs,
});

describe("createLatestWinsWriter", () => {
  it("sends one state at a time and skips the ones a newer state replaced", async () => {
    const sent: unknown[] = [];
    const requests: Array<ReturnType<typeof deferred>> = [];
    const writer = createLatestWinsWriter((state) => {
      sent.push(state);
      const request = deferred();
      requests.push(request);
      return request.promise;
    });

    const first = writer.write(1);
    const second = writer.write(2);
    const third = writer.write(3);
    expect(sent).toEqual([1]);

    requests[0].resolve();
    await first;
    await flush();
    expect(sent).toEqual([1, 3]);

    requests[1].resolve();
    await Promise.all([second, third]);
    expect(sent).toEqual([1, 3]);
  });

  it("rejects every write the failed request stood for, then carries on", async () => {
    const results: string[] = [];
    let call = 0;
    const writer = createLatestWinsWriter(() =>
      ++call === 2 ? Promise.reject(new Error("down")) : Promise.resolve()
    );

    const first = writer.write("a");
    const replaced = writer.write("b");
    const failing = writer.write("c");
    await first;
    await Promise.allSettled([replaced, failing]).then((settled) =>
      settled.forEach((result) => results.push(result.status))
    );
    expect(results).toEqual(["rejected", "rejected"]);

    await expect(writer.write("d")).resolves.toBeUndefined();
  });
});

describe("runSteps", () => {
  it("writes every step and holds after each for its time", async () => {
    const log: string[] = [];
    const result = await runSteps([step("prepare", 1200), step("fade", 2000), step("final", 0)], {
      apply: (next) => {
        log.push(`write ${next.layers[0].id}`);
        return Promise.resolve();
      },
      sleep: (ms) => {
        log.push(`hold ${ms}`);
        return Promise.resolve();
      },
      isCancelled: () => false,
    });

    expect(result).toBe("done");
    expect(log).toEqual([
      "write prepare",
      "hold 1200",
      "write fade",
      "hold 2000",
      "write final",
    ]);
  });

  it("stops before the next write once it is cancelled", async () => {
    const written: string[] = [];
    let cancelled = false;
    const result = await runSteps([step("prepare", 1200), step("fade", 2000), step("final", 0)], {
      apply: (next) => {
        written.push(next.layers[0].id);
        return Promise.resolve();
      },
      sleep: () => {
        // a newer scene tap arrives during the first hold
        cancelled = true;
        return Promise.resolve();
      },
      isCancelled: () => cancelled,
    });

    expect(result).toBe("cancelled");
    expect(written).toEqual(["prepare"]);
  });

  it("ends the run when a write fails", async () => {
    const written: string[] = [];
    const run = runSteps([step("prepare", 1200), step("fade", 0)], {
      apply: (next) => {
        written.push(next.layers[0].id);
        return Promise.reject(new Error("relay down"));
      },
      sleep: () => Promise.resolve(),
      isCancelled: () => false,
    });

    await expect(run).rejects.toThrow("relay down");
    expect(written).toEqual(["prepare"]);
  });
});
