import { describe, expect, it } from "vitest";
import {
  meshBaseContentLineage,
  meshBaseRequiredAncestors,
} from "./mesh-base-cache-tree";

type Node = { url: string | null; parent: Node | null };
const content = (tile: Node) => tile.url;
const parent = (tile: Node) => tile.parent;
const root: Node = { url: "root", parent: null };
const container: Node = { url: null, parent: root };
const leaf: Node = { url: "leaf", parent: container };

describe("persistent mesh content lineage", () => {
  it("links through containers to nearest content parent and measures content depth", () => {
    expect(meshBaseContentLineage(leaf, "source", content, parent)).toEqual({
      identity: "source",
      node: "leaf",
      parent: "root",
      level: 1,
    });
    expect(meshBaseContentLineage(root, "source", content, parent)).toEqual({
      identity: "source",
      node: "root",
      parent: null,
      level: 0,
    });
  });
  it("protects the complete cut and its source ancestors without unrelated cached branches", () => {
    const stored = new Set(["root", "leaf", "unused"]);
    expect(
      meshBaseRequiredAncestors([leaf], content, parent, (url) =>
        stored.has(url)
      )
    ).toEqual(new Set(["leaf", "root"]));
    expect(
      meshBaseRequiredAncestors(
        [leaf],
        content,
        parent,
        (url) => url !== "root"
      )
    ).toBeNull();
  });
  it("fails closed for malformed parent cycles", () => {
    const cyclic: Node = { url: "cycle", parent: null };
    cyclic.parent = cyclic;
    expect(
      meshBaseContentLineage(cyclic, "source", content, parent)
    ).toBeNull();
    expect(
      meshBaseRequiredAncestors([cyclic], content, parent, () => true)
    ).toBeNull();
  });
});
