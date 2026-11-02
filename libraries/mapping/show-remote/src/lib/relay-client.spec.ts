import {
  RelayError,
  helloRelay,
  readRelayState,
  subscribeRelay,
  waitRelayState,
  writeRelayState,
  type RelayLink,
  type RelayMeta,
  type RelaySnapshot,
  type RelayStatus,
  type RelayTarget,
} from "./relay-client";

const TARGET: RelayTarget = { baseUrl: "http://relay.test/", code: " abcd " };

const answer = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

describe("relay transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes the state as a CORS-simple text body", async () => {
    const fetch = vi.fn(async () => answer({ v: 4, ts: 99 }));
    vi.stubGlobal("fetch", fetch);

    await expect(writeRelayState(TARGET, { a: 1 })).resolves.toEqual({
      v: 4,
      ts: 99,
    });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://relay.test/s/abcd");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "text/plain" });
    expect(init.body).toBe('{"state":{"a":1}}');
  });

  it("reads, says hello and waits on the session's own paths", async () => {
    const fetch = vi.fn(async () =>
      answer({ v: 2, state: null, ts: 0, now: 0 })
    );
    vi.stubGlobal("fetch", fetch);

    await readRelayState(TARGET);
    await helloRelay(TARGET);
    await waitRelayState(TARGET, 2, 25_000);

    expect(fetch.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      "http://relay.test/s/abcd?since=-1",
      "http://relay.test/s/abcd/hello",
      "http://relay.test/s/abcd?since=2&wait=25000",
    ]);
  });

  it("writes only onto the version it names, and says what came in between", async () => {
    const fetch = vi.fn(async () =>
      answer({ error: "version conflict", v: 6, state: { a: 2 } }, 409)
    );
    vi.stubGlobal("fetch", fetch);

    const error = await writeRelayState(TARGET, { a: 1 }, undefined, 5).catch(
      (e: unknown) => e
    );

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe('{"state":{"a":1},"ifV":5}');
    expect(error).toBeInstanceOf(RelayError);
    expect((error as RelayError).status).toBe(409);
    expect((error as RelayError).current).toEqual({ v: 6, state: { a: 2 } });
  });

  it("names what the relay's status code means", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ error: "unknown session" }, 404))
    );

    const error = await readRelayState(TARGET).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RelayError);
    expect((error as RelayError).status).toBe(404);
    expect((error as RelayError).message).toBe(
      "the relay does not know this session code"
    );
  });

  it("reports an unreachable relay without a status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    const error = await helloRelay(TARGET).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RelayError);
    expect((error as RelayError).status).toBeUndefined();
  });
});

/** a relay whose answers the test hands out one by one */
const scriptedLink = (answers: (RelaySnapshot | Error)[], clock = 0) => {
  const hellos: string[] = [];
  const waits: { code: string; since: number; waitMs: number }[] = [];
  const sleeps: number[] = [];
  const link: RelayLink = {
    hello: async (target) => {
      hellos.push(target.code);
    },
    wait: async (target, since, waitMs, signal) => {
      waits.push({ code: target.code, since, waitMs });
      const next = answers.shift();
      if (next instanceof Error) {
        throw next;
      }
      if (next) {
        return next;
      }
      // nothing scripted: hang like a held request until stopped
      return new Promise<RelaySnapshot>((_resolve, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new RelayError("stopped"))
        );
      });
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => clock,
  };
  return { hellos, waits, sleeps, link };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const follow = async (answers: (RelaySnapshot | Error)[], clock?: number) => {
  const relay = scriptedLink(answers, clock);
  const heard: { state: unknown; meta: RelayMeta }[] = [];
  const statuses: RelayStatus[] = [];
  const subscription = subscribeRelay({
    target: TARGET,
    onState: (state, meta) => heard.push({ state, meta }),
    onStatus: (status) => statuses.push(status),
    link: relay.link,
  });
  await settle();
  subscription.stop();
  await settle();
  return { ...relay, heard, statuses, subscription };
};

describe("subscribeRelay", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the session, then long-polls from the version it heard", async () => {
    const { hellos, waits, heard } = await follow([
      { v: 3, state: { a: 1 }, ts: 9_000, now: 10_000 },
      { v: 3, state: { a: 1 }, ts: 9_000, now: 35_000 },
      { v: 4, state: { a: 2 }, ts: 36_000, now: 36_000 },
    ]);

    expect(hellos).toEqual([" abcd "]);
    expect(waits.map(({ since, waitMs }) => [since, waitMs])).toEqual([
      [-1, 25_000],
      [3, 25_000],
      [3, 25_000],
      [4, 25_000],
    ]);
    expect(heard).toEqual([
      {
        state: { a: 1 },
        meta: { v: 3, ageMs: 1_000, first: true, transport: "longpoll" },
      },
      {
        state: { a: 2 },
        meta: { v: 4, ageMs: 0, first: false, transport: "longpoll" },
      },
    ]);
  });

  it("hands on null for a session nobody wrote to", async () => {
    const { heard } = await follow([{ v: 0, state: null, ts: 0, now: 0 }]);

    expect(heard.map(({ state }) => state)).toEqual([null]);
  });

  it("opens the session again and starts over when the relay forgot it", async () => {
    const { hellos, waits, heard, sleeps } = await follow([
      { v: 7, state: { a: 1 }, ts: 0, now: 0 },
      new RelayError("unknown session", 404),
      { v: 1, state: { a: 2 }, ts: 0, now: 0 },
    ]);

    expect(hellos).toHaveLength(2);
    expect(waits.map(({ since }) => since)).toEqual([-1, 7, -1, 1]);
    expect(sleeps).toEqual([500]);
    expect(heard.map(({ meta }) => meta.first)).toEqual([true, true]);
  });

  it("waits out a block instead of asking again at once", async () => {
    const { sleeps, heard } = await follow([
      new RelayError("too many attempts", 429),
      { v: 1, state: { a: 1 }, ts: 0, now: 0 },
    ]);

    expect(sleeps).toEqual([60_000]);
    expect(heard).toHaveLength(1);
  });

  it("backs off on repeated errors the relay answered", async () => {
    const { sleeps } = await follow([
      new RelayError("the relay answered HTTP 502", 502),
      new RelayError("the relay answered HTTP 502", 502),
      new RelayError("the relay answered HTTP 502", 502),
      new RelayError("the relay answered HTTP 502", 502),
    ]);

    expect(sleeps).toEqual([500, 1_000, 2_000, 4_000]);
  });

  it("falls back to short polling when held requests keep dying", async () => {
    const lost = () => new RelayError("the relay is not reachable");
    const { waits, sleeps, statuses, heard } = await follow([
      lost(),
      lost(),
      lost(),
      { v: 2, state: { a: 1 }, ts: 0, now: 0, pollAfterMs: 250 },
      { v: 2, state: { a: 1 }, ts: 0, now: 0 },
    ]);

    expect(waits.map(({ waitMs }) => waitMs)).toEqual([
      25_000, 25_000, 25_000, 0, 0, 0,
    ]);
    expect(sleeps).toEqual([500, 1_000, 250, 1_000]);
    expect(statuses.at(-1)?.transport).toBe("poll");
    expect(heard[0]?.meta.transport).toBe("poll");
  });

  it("times the network only when a long poll came back promptly", async () => {
    const { statuses } = await follow([{ v: 1, state: null, ts: 0, now: 0 }]);

    expect(statuses[0]).toEqual({
      transport: "longpoll",
      connected: true,
      rttMs: 0,
      v: 1,
    });
  });

  it("keeps following when the handler throws", async () => {
    const relay = scriptedLink([
      { v: 1, state: { a: 1 }, ts: 0, now: 0 },
      { v: 2, state: { a: 2 }, ts: 0, now: 0 },
    ]);
    const heard: unknown[] = [];
    const subscription = subscribeRelay({
      target: TARGET,
      onState: (state) => {
        heard.push(state);
        throw new Error("broken handler");
      },
      link: relay.link,
    });
    await settle();
    subscription.stop();

    expect(heard).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("hands on nothing once stopped", async () => {
    const relay = scriptedLink([]);
    const heard: unknown[] = [];
    const subscription = subscribeRelay({
      target: TARGET,
      onState: (state) => heard.push(state),
      link: relay.link,
    });
    subscription.stop();
    await settle();

    expect(heard).toEqual([]);
    expect(subscription.status().connected).toBe(false);
  });
});
