import {
  relayTagsOf,
  relayWritersOf,
  withConnected,
  withHeard,
  type MapRelayState,
} from "./map-relay";

const IDLE: MapRelayState = {
  target: { baseUrl: "http://relay.test", code: "ABCD" },
  tags: ["outlet"],
  heard: {},
  connected: {},
};

const META = { v: 3, ageMs: 40, first: true, transport: "longpoll" as const };

describe("relayWritersOf", () => {
  it("follows the presenter by default", () => {
    expect(relayWritersOf(undefined)).toEqual(["presenter"]);
    expect(relayWritersOf({})).toEqual(["presenter"]);
  });

  it("keeps known writers once each", () => {
    expect(
      relayWritersOf({
        writers: ["presenter", "geoportal", "presenter", "nobody" as never],
      })
    ).toEqual(["presenter", "geoportal"]);
  });
});

describe("relayTagsOf", () => {
  it("names the route's target by default", () => {
    expect(relayTagsOf(undefined, "/outlet")).toEqual(["outlet"]);
    expect(relayTagsOf(undefined, "/")).toEqual(["geoportal"]);
    expect(relayTagsOf(undefined, undefined)).toEqual(["geoportal"]);
  });

  it("takes configured tags and drops what cannot be one", () => {
    expect(
      relayTagsOf({ targets: ["outlet", "screen", "*", "Big"] }, "/outlet")
    ).toEqual(["outlet", "screen"]);
    expect(relayTagsOf({ targets: [] }, "/outlet")).toEqual([]);
  });

  it("applies no tag for a route whose name cannot be one", () => {
    expect(relayTagsOf(undefined, "/PM_Show")).toEqual([]);
  });
});

describe("withHeard", () => {
  it("keeps what the writer said, resolved for the page's tags", () => {
    const doc = {
      "*": { config: "shared", bounds: [1, 2, 3, 4] },
      outlet: { config: "outlet" },
      _presenter: { name: "Ann", device: "d1" },
    };

    const next = withHeard(IDLE, "presenter", doc, META, 1_000);

    expect(next.heard.presenter).toEqual({
      state: { config: "outlet", bounds: [1, 2, 3, 4] },
      v: 3,
      ageMs: 40,
      first: true,
      heardAt: 1_000,
    });
    expect(IDLE.heard).toEqual({});
  });

  it("keeps the writers apart", () => {
    const one = withHeard(IDLE, "presenter", { a: 1 }, META, 1);
    const two = withHeard(one, "geoportal", { "*": { b: 2 } }, META, 2);

    expect(two.heard.presenter?.state).toEqual({ a: 1 });
    expect(two.heard.geoportal?.state).toEqual({ b: 2 });
  });

  it("holds null for a session nobody wrote to", () => {
    expect(
      withHeard(IDLE, "geoportal", null, META, 1).heard.geoportal?.state
    ).toBeNull();
  });
});

describe("withConnected", () => {
  it("changes only when the connection did", () => {
    const up = withConnected(IDLE, "presenter", true);

    expect(up.connected).toEqual({ presenter: true });
    expect(withConnected(up, "presenter", true)).toBe(up);
    expect(withConnected(up, "presenter", false).connected).toEqual({
      presenter: false,
    });
  });
});
