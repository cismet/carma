import {
  KNOWN_TARGETS,
  PRESENTER_KEY,
  isPresenter,
  isRelayWriter,
  isTargetTag,
  newPresenterDevice,
  presenterOf,
  presenterRole,
  resolveTargets,
  withPresenter,
  writerSessionCode,
  writerTarget,
} from "./relay-document";

describe("resolveTargets", () => {
  it("applies the shared section, then the display's own on top", () => {
    const doc = {
      "*": { config: "shared", bounds: [1, 2, 3, 4] },
      outlet: { config: "outlet" },
      geoportal: { config: "geoportal" },
    };

    expect(resolveTargets(doc, ["outlet"])).toEqual({
      config: "outlet",
      bounds: [1, 2, 3, 4],
    });
    expect(resolveTargets(doc, ["geoportal"])).toEqual({
      config: "geoportal",
      bounds: [1, 2, 3, 4],
    });
    expect(resolveTargets(doc, [])).toEqual({
      config: "shared",
      bounds: [1, 2, 3, 4],
    });
  });

  it("replaces a key whole instead of merging into it", () => {
    const doc = {
      "*": { config: { layers: ["a", "b"], background: "x" } },
      outlet: { config: { layers: ["a"] } },
    };

    expect(resolveTargets(doc, ["outlet"])).toEqual({
      config: { layers: ["a"] },
    });
  });

  it("switches a shared key off where a section says null", () => {
    const doc = {
      "*": { pointer: { x: 1 }, highlights: [] },
      geoportal: { pointer: null },
    };

    expect(resolveTargets(doc, ["geoportal"])).toEqual({ highlights: [] });
    expect(resolveTargets(doc, ["outlet"])).toEqual({
      pointer: { x: 1 },
      highlights: [],
    });
  });

  it("applies several tags left to right", () => {
    const doc = {
      "*": { a: 0, b: 0 },
      outlet: { a: 1, b: 1 },
      screen: { b: 2 },
    };

    expect(resolveTargets(doc, ["outlet", "screen"])).toEqual({ a: 1, b: 2 });
    expect(resolveTargets(doc, ["screen", "outlet"])).toEqual({ a: 1, b: 1 });
  });

  it("reads a document without a shared section as entirely shared", () => {
    const doc = { config: "old", bounds: [1, 2, 3, 4], outlet: { x: 1 } };

    expect(resolveTargets(doc, ["outlet"])).toEqual(doc);
  });

  it("leaves out the writer's metadata", () => {
    const presenter = { name: "Ann", device: "d1" };

    expect(
      resolveTargets(
        { "*": { a: 1, _note: "x" }, [PRESENTER_KEY]: presenter },
        ["outlet"]
      )
    ).toEqual({ a: 1 });
    expect(resolveTargets({ a: 1, [PRESENTER_KEY]: presenter }, [])).toEqual({
      a: 1,
    });
  });

  it("ignores tags that cannot be target tags", () => {
    const doc = { "*": { a: 0 }, _presenter: { a: 1 }, Outlet: { a: 2 } };

    expect(resolveTargets(doc, ["*", "_presenter", "Outlet"])).toEqual({
      a: 0,
    });
  });

  it("finds nothing in an empty or foreign session", () => {
    expect(resolveTargets(null, ["outlet"])).toBeNull();
    expect(resolveTargets("text", ["outlet"])).toBeNull();
    expect(resolveTargets([1, 2], ["outlet"])).toBeNull();
    expect(resolveTargets({ "*": null }, ["outlet"])).toEqual({});
  });
});

describe("target tags", () => {
  it("knows the outlet and the geoportal", () => {
    expect(KNOWN_TARGETS).toEqual(["outlet", "geoportal"]);
    expect(KNOWN_TARGETS.every(isTargetTag)).toBe(true);
  });

  it("allows lowercase letters, digits and dashes only", () => {
    expect(isTargetTag("info-box2")).toBe(true);
    expect(isTargetTag("*")).toBe(false);
    expect(isTargetTag("_presenter")).toBe(false);
    expect(isTargetTag("Outlet")).toBe(false);
    expect(isTargetTag("")).toBe(false);
    expect(isTargetTag(3)).toBe(false);
  });
});

describe("writer sessions", () => {
  it("puts the presenter on the code and the geoportal next to it", () => {
    expect(writerSessionCode(" wupp1 ", "presenter")).toBe("WUPP1");
    expect(writerSessionCode("wupp1", "geoportal")).toBe("WUPP1-G");
    expect(
      writerTarget(
        { baseUrl: "https://relay.example", code: "wupp1" },
        "geoportal"
      )
    ).toEqual({ baseUrl: "https://relay.example", code: "WUPP1-G" });
  });

  it("knows its writers only", () => {
    expect(isRelayWriter("presenter")).toBe(true);
    expect(isRelayWriter("geoportal")).toBe(true);
    expect(isRelayWriter("outlet")).toBe(false);
    expect(isRelayWriter("toString")).toBe(false);
  });
});

describe("presenter", () => {
  const ann = { name: "Ann", device: "d1" };

  it("needs a name and a device", () => {
    expect(isPresenter(ann)).toBe(true);
    expect(isPresenter({ name: "  ", device: "d1" })).toBe(false);
    expect(isPresenter({ name: "Ann", device: "" })).toBe(false);
    expect(isPresenter({ name: "Ann" })).toBe(false);
    expect(isPresenter(null)).toBe(false);
  });

  it("reads who presents from the document", () => {
    expect(
      presenterOf({ "*": {}, _presenter: { name: " Ann ", device: "d1" } })
    ).toEqual(ann);
    expect(presenterOf({ "*": {} })).toBeNull();
    expect(presenterOf({ _presenter: { name: "Ann" } })).toBeNull();
    expect(presenterOf(null)).toBeNull();
  });

  it("tells this device whether it holds the show", () => {
    const doc = { "*": {}, _presenter: ann };

    expect(presenterRole(doc, "d1")).toBe("self");
    expect(presenterRole(doc, "d2")).toBe("other");
    expect(presenterRole({ "*": {} }, "d1")).toBe("free");
    expect(presenterRole(null, "d1")).toBe("free");
  });

  it("takes over the current document in one write", () => {
    const doc = { "*": { config: "x" }, outlet: { a: 1 }, _presenter: ann };
    const bob = { name: " Bob ", device: "d2" };

    expect(withPresenter(doc, bob)).toEqual({
      "*": { config: "x" },
      outlet: { a: 1 },
      _presenter: { name: "Bob", device: "d2" },
    });
    expect(doc._presenter).toBe(ann);
  });

  it("starts an empty session with a shared section", () => {
    expect(withPresenter(null, ann)).toEqual({ "*": {}, _presenter: ann });
  });

  it("gives every device its own id", () => {
    const device = newPresenterDevice();

    expect(device).toMatch(/^[0-9a-f]{16}$/);
    expect(newPresenterDevice()).not.toBe(device);
  });
});
