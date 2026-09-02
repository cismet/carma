import { afterEach, describe, expect, it, vi } from "vitest";

import { createPayloadAwareRequestConcurrency } from "./payload-aware-request-concurrency";

describe("payload-aware request concurrency", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses hundreds of parallel requests for small payloads", () => {
    const concurrency = createPayloadAwareRequestConcurrency(
      64 * 1024 ** 2,
      32 * 1024
    );

    expect(concurrency.getConcurrency()).toBe(256);
  });

  it("reduces concurrency for larger payloads", () => {
    const concurrency = createPayloadAwareRequestConcurrency(
      64 * 1024 ** 2,
      256 * 1024
    );

    for (let index = 0; index < 20; index += 1) {
      concurrency.observePayload(2 * 1024 ** 2);
    }

    expect(concurrency.getConcurrency()).toBeGreaterThanOrEqual(16);
    expect(concurrency.getConcurrency()).toBeLessThan(40);
  });

  it("respects a caller-provided maximum", () => {
    const concurrency = createPayloadAwareRequestConcurrency();

    expect(concurrency.getConcurrency(12)).toBe(12);
    expect(concurrency.getConcurrency(0)).toBe(0);
  });

  it("backs off after failures and recovers after successful payloads", () => {
    const concurrency = createPayloadAwareRequestConcurrency();

    expect(concurrency.getConcurrency()).toBe(64);
    concurrency.observeFailure();
    expect(concurrency.getConcurrency()).toBe(32);
    concurrency.observeFailure();
    expect(concurrency.getConcurrency()).toBe(16);

    for (let index = 0; index < 20; index += 1) {
      concurrency.observePayload(1024 ** 2);
    }
    expect(concurrency.getConcurrency()).toBeGreaterThan(50);
  });

  it("pauses an origin after overload responses without extending a burst", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const concurrency = createPayloadAwareRequestConcurrency();
    const overload = new Error("Failed with status 429: Too Many Requests");

    expect(concurrency.observeFailure(overload)).toBe(1_000);
    expect(concurrency.getConcurrency()).toBe(0);
    vi.advanceTimersByTime(200);
    expect(concurrency.observeFailure(overload)).toBe(800);

    vi.advanceTimersByTime(800);
    expect(concurrency.getConcurrency()).toBeGreaterThan(0);
    expect(concurrency.observeFailure(new Error("request timed out"))).toBe(
      2_000
    );
    expect(concurrency.getConcurrency()).toBe(0);
  });

  it("does not globally pause for a permanent missing tile", () => {
    const concurrency = createPayloadAwareRequestConcurrency();

    expect(concurrency.observeFailure(new Error("status 404"))).toBe(0);
    expect(concurrency.getConcurrency()).toBeGreaterThan(0);
  });
});
