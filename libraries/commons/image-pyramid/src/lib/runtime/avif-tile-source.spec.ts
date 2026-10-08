import { describe, expect, it, vi } from "vitest";
import { abortable } from "./avif-tile-source";

describe("abortable shared AVIF work", () => {
  it("observes shared rejection even when the caller is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const work = Promise.reject(new Error("underlying request also aborted"));
    const then = vi.spyOn(work, "then");
    await expect(abortable(work, controller.signal)).rejects.toBe(controller.signal.reason);
    const observed = then.mock.calls.some(([, rejection]) => typeof rejection === "function");
    // Always consume fixture rejection, so failure identifies the missing observer
    // rather than creating unrelated unhandled-rejection noise in the test runner.
    await work.catch(() => undefined);
    expect(observed).toBe(true);
  });

  it("lets one aborted consumer stop waiting while shared work still completes", async () => {
    const first = new AbortController(), second = new AbortController();
    let resolve!: (value: number) => void;
    const work = new Promise<number>((done) => { resolve = done; });
    const a = abortable(work, first.signal), b = abortable(work, second.signal);
    first.abort();
    await expect(a).rejects.toBe(first.signal.reason);
    resolve(42);
    await expect(b).resolves.toBe(42);
  });
});
