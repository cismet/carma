import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SeriesStatus } from "@carma-mapping/show-remote";

import { createSeriesStatusPublisher } from "./series-status-publisher";

const status = (extra: Partial<SeriesStatus> = {}): SeriesStatus => ({
  key: "t50",
  total: 24,
  loaded: 0,
  failed: 0,
  ready: false,
  step: 0,
  playing: true,
  ...extra,
});

/** a write that stays out until `settle` is called */
const slowWrites = () => {
  const sent: (SeriesStatus | null)[] = [];
  const pending: (() => void)[] = [];
  const write = (value: SeriesStatus | null) => {
    sent.push(value);
    return new Promise<void>((resolve) => pending.push(resolve));
  };
  const settle = async () => {
    pending.shift()?.();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { sent, write, settle };
};

describe("createSeriesStatusPublisher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says a status once, however often it is published", () => {
    const { sent, write } = slowWrites();
    const publisher = createSeriesStatusPublisher(write);

    publisher.publish(status());
    publisher.publish(status());

    expect(sent).toEqual([status()]);
    publisher.stop();
  });

  it("sends only the newest of the statuses that came while one was out", async () => {
    const { sent, write, settle } = slowWrites();
    const publisher = createSeriesStatusPublisher(write);

    publisher.publish(status({ loaded: 1 }));
    publisher.publish(status({ loaded: 2 }));
    publisher.publish(status({ loaded: 3 }));
    await settle();

    expect(sent.map((value) => value?.loaded)).toEqual([1, 3]);
    publisher.stop();
  });

  it("repeats a series' status on the heartbeat, but not the absence of one", async () => {
    const { sent, write, settle } = slowWrites();
    const publisher = createSeriesStatusPublisher(write, 1000);

    publisher.publish(status());
    await settle();
    vi.advanceTimersByTime(1000);
    expect(sent).toHaveLength(2);

    await settle();
    publisher.publish(null);
    await settle();
    vi.advanceTimersByTime(5000);
    expect(sent).toEqual([status(), status(), null]);

    publisher.stop();
  });

  it("keeps going after a failed write", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sent: (SeriesStatus | null)[] = [];
    const publisher = createSeriesStatusPublisher(async (value) => {
      sent.push(value);
      if (sent.length === 1) {
        throw new Error("relay down");
      }
    }, 1000);

    publisher.publish(status());
    await vi.advanceTimersByTimeAsync(1000);

    expect(sent).toHaveLength(2);
    expect(warn).toHaveBeenCalledTimes(1);
    publisher.stop();
    warn.mockRestore();
  });

  it("sends nothing after it stopped", () => {
    const { sent, write } = slowWrites();
    const publisher = createSeriesStatusPublisher(write, 1000);
    publisher.stop();

    publisher.publish(status());
    vi.advanceTimersByTime(5000);

    expect(sent).toEqual([]);
  });
});
