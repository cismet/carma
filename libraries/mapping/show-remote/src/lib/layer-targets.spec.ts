import type { MappingConfig } from "@carma-api";

import {
  layerTargetChoice,
  layerTargetsFor,
  layerTargetsOf,
  presenterConfigOf,
  presenterLayerTargetsOf,
  withLayerTarget,
  withTargetSections,
} from "./layer-targets";
import { resolveTargets } from "./relay-document";

const config = (...ids: string[]): MappingConfig => ({
  layers: ids.map((id) => ({ id })),
});

const ids = (value: unknown) =>
  (value as MappingConfig | null)?.layers.map(({ id }) => id);

describe("layerTargetsOf", () => {
  it("keeps valid tags and drops the rest, and marks left without any", () => {
    expect(
      layerTargetsOf({
        a: ["outlet", "outlet"],
        b: ["Outlet", "*", "_x"],
        c: "outlet",
        d: [],
        e: ["geoportal", 3],
      })
    ).toEqual({ a: ["outlet"], e: ["geoportal"] });
  });

  it("reads anything else as no marks", () => {
    expect(layerTargetsOf(undefined)).toEqual({});
    expect(layerTargetsOf(["outlet"])).toEqual({});
  });
});

describe("withLayerTarget", () => {
  it("marks a layer and takes the mark away again", () => {
    const marked = withLayerTarget(undefined, "a", ["outlet"]);
    expect(marked).toEqual({ a: ["outlet"] });
    expect(withLayerTarget(marked, "b", ["geoportal"])).toEqual({
      a: ["outlet"],
      b: ["geoportal"],
    });
    expect(withLayerTarget(marked, "a", null)).toBeUndefined();
  });
});

describe("layerTargetsFor", () => {
  it("keeps the marks of the given layers only", () => {
    const marks = { a: ["outlet"], gone: ["geoportal"] };
    expect(layerTargetsFor(marks, config("a", "b").layers)).toEqual({
      a: ["outlet"],
    });
    expect(layerTargetsFor(marks, config("b").layers)).toBeUndefined();
  });
});

describe("layerTargetChoice", () => {
  it("is the target a marked layer goes to, null for every display", () => {
    const marks = { a: ["geoportal"] };
    expect(layerTargetChoice(marks, "a")).toBe("geoportal");
    expect(layerTargetChoice(marks, "b")).toBeNull();
    expect(layerTargetChoice(undefined, "a")).toBeNull();
  });
});

describe("withTargetSections", () => {
  const state = { config: config("A", "O", "G", "B"), bounds: [1, 2, 3, 4] };
  const marks = { O: ["outlet"], G: ["geoportal"] };

  it("writes everything shared while no layer is marked", () => {
    expect(withTargetSections(state, {})).toEqual({ "*": state });
    expect(withTargetSections(state, { gone: ["outlet"] })).toEqual({
      "*": state,
    });
    expect(withTargetSections({ bounds: [1, 2, 3, 4] }, marks)).toEqual({
      "*": { bounds: [1, 2, 3, 4] },
    });
  });

  it("gives each display what its marks say, the rest shared", () => {
    const doc = withTargetSections(state, marks);

    expect(ids((doc["*"] as Record<string, unknown>)["config"])).toEqual([
      "A",
      "B",
    ]);
    expect(ids(resolveTargets(doc, ["outlet"])?.["config"])).toEqual([
      "A",
      "O",
      "B",
    ]);
    expect(ids(resolveTargets(doc, ["geoportal"])?.["config"])).toEqual([
      "A",
      "G",
      "B",
    ]);
    // a display nobody marked for gets the shared layers only
    expect(ids(resolveTargets(doc, ["legend"])?.["config"])).toEqual([
      "A",
      "B",
    ]);
    expect(resolveTargets(doc, ["outlet"])?.["bounds"]).toEqual([1, 2, 3, 4]);
  });

  it("sends a layer marked for two displays to both", () => {
    const doc = withTargetSections(state, { O: ["outlet", "geoportal"] });
    expect(ids(resolveTargets(doc, ["geoportal"])?.["config"])).toEqual([
      "A",
      "O",
      "G",
      "B",
    ]);
    expect(ids(resolveTargets(doc, [])?.["config"])).toEqual(["A", "G", "B"]);
  });
});

describe("presenterConfigOf", () => {
  it("gets every layer back from the sections, each display's order kept", () => {
    const doc = withTargetSections(
      { config: config("A", "O", "G", "B") },
      { O: ["outlet"], G: ["geoportal"] }
    );
    const all = ids(presenterConfigOf(doc)) ?? [];

    expect([...all].sort()).toEqual(["A", "B", "G", "O"]);
    expect(all.filter((id) => id !== "G")).toEqual(["A", "O", "B"]);
    expect(all.filter((id) => id !== "O")).toEqual(["A", "G", "B"]);
  });

  it("reads a document from a remote that knows no targets", () => {
    expect(ids(presenterConfigOf({ config: config("A") }))).toEqual(["A"]);
  });

  it("is null without any configuration", () => {
    expect(presenterConfigOf({ "*": { bounds: [1, 2, 3, 4] } })).toBeNull();
    expect(presenterConfigOf(null)).toBeNull();
  });
});

describe("presenterLayerTargetsOf", () => {
  it("gets the marks back that the sections were written with", () => {
    const marks = {
      O: ["outlet"],
      G: ["geoportal"],
      OG: ["outlet", "geoportal"],
    };
    const doc = withTargetSections(
      { config: config("A", "O", "G", "OG", "B") },
      marks
    );

    expect(presenterLayerTargetsOf(doc)).toEqual(marks);
  });

  it("has none for a document whose layers all go everywhere", () => {
    expect(presenterLayerTargetsOf({ "*": { config: config("A") } })).toEqual(
      {}
    );
    expect(presenterLayerTargetsOf({ config: config("A") })).toEqual({});
    expect(presenterLayerTargetsOf(null)).toEqual({});
  });
});
