import {
  RelayError,
  type HeardSeriesStatus,
  type RelaySnapshot,
  type RelayTarget,
  type SeriesStatus,
} from "@carma-mapping/show-remote";

import { followSeriesStatus } from "./series-status-link";

const TARGET: RelayTarget = { baseUrl: "http://localhost:8099", code: "abcd" };

const STATUS: SeriesStatus = {
  key: "t50",
  total: 24,
  loaded: 17,
  failed: 0,
  ready: false,
  step: 0,
  playing: true,
};

/** a relay whose answers the test hands out one by one */
const scriptedLink = (answers: (RelaySnapshot | Error)[]) => {
  const hellos: string[] = [];
  const waits: { code: string; since: number }[] = [];
  let stopWaiting: () => void = () => undefined;
  return {
    hellos,
    waits,
    link: {
      hello: async (target: RelayTarget) => {
        hellos.push(target.code);
      },
      wait: async (target: RelayTarget, since: number) => {
        waits.push({ code: target.code, since });
        const answer = answers.shift();
        if (answer instanceof Error) {
          throw answer;
        }
        if (answer) {
          return answer;
        }
        // nothing scripted: hang like a held request until stopped
        return new Promise<RelaySnapshot>((_resolve, reject) => {
          stopWaiting = () => reject(new Error("stopped"));
        });
      },
      sleep: async () => undefined,
    },
    stop: () => stopWaiting(),
  };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("followSeriesStatus", () => {
  it("opens the display's status session and hands on what it holds, aged on the relay's clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(50_000);
    const relay = scriptedLink([
      { v: 3, state: STATUS, ts: 9_000, now: 10_000 },
    ]);
    const heard: (HeardSeriesStatus | null)[] = [];

    const stop = followSeriesStatus(TARGET, (h) => heard.push(h), relay.link);
    await settle();
    stop();
    relay.stop();

    expect(relay.hellos).toEqual(["ABCD-T"]);
    expect(relay.waits.map(({ since }) => since)).toEqual([-1, 3]);
    expect(heard).toEqual([{ status: STATUS, writtenAt: 49_000 }]);
    vi.restoreAllMocks();
  });

  it("hands on null for a session a display never wrote to", async () => {
    const relay = scriptedLink([{ v: 0, state: null, ts: 0, now: 0 }]);
    const heard: (HeardSeriesStatus | null)[] = [];

    const stop = followSeriesStatus(TARGET, (h) => heard.push(h), relay.link);
    await settle();
    stop();
    relay.stop();

    expect(heard).toEqual([null]);
  });

  it("opens the session again when the relay forgot it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const relay = scriptedLink([
      new RelayError("unknown session", 404),
      { v: 1, state: STATUS, ts: 0, now: 0 },
    ]);
    const heard: (HeardSeriesStatus | null)[] = [];

    const stop = followSeriesStatus(TARGET, (h) => heard.push(h), relay.link);
    await settle();
    stop();
    relay.stop();

    expect(relay.hellos).toEqual(["ABCD-T", "ABCD-T"]);
    expect(relay.waits[1]?.since).toBe(-1);
    expect(heard).toHaveLength(1);
    warn.mockRestore();
  });

  it("hands on nothing once stopped", async () => {
    const relay = scriptedLink([]);
    const heard: (HeardSeriesStatus | null)[] = [];

    const stop = followSeriesStatus(TARGET, (h) => heard.push(h), relay.link);
    await settle();
    stop();
    relay.stop();
    await settle();

    expect(heard).toEqual([]);
  });
});
