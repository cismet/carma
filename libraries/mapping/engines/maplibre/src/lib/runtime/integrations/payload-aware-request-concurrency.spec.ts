import { describe, expect, it } from "vitest";

import { createPayloadAwareRequestConcurrency } from "./payload-aware-request-concurrency";

describe("payload-aware request concurrency", () => {
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
});
