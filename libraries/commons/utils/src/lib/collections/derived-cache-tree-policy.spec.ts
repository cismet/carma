import { describe, expect, it } from "vitest";
import { planDerivedCacheAdmission, planDerivedCacheTrim, type DerivedCacheMetadata } from "./derived-cache-policy";
import { canDeleteDerivedCacheRecord, matchesDerivedCacheTreeRead, planDerivedCacheTreeProtection } from "./derived-cache-tree-policy";

const node = (key: string, parent: string | null = null, level = 0, protectedNode = false): DerivedCacheMetadata => ({
  namespace: "terrain", key, version: "source-build", bytes: 10, priority: 1, writtenMs: 1,
  lastAccess: 1, hits: 0, recomputeMs: 10, restoreMs: 1,
  tree: { identity: "source/config", node: key, parent, level, protected: protectedNode },
});
const options = { capacityBytes: 40, age: 0, nowMs: 10 };

describe("derived cache hierarchy", () => {
  it("evicts the deepest low-use leaves, retains parents, and refuses unbacked children", () => {
    const root = node("root", null, 0, true);
    const old = node("old", "root", 1);
    const fine = node("fine", "old", 2);
    const hot = { ...node("hot", "old", 2), hits: 5 };
    const plan = planDerivedCacheAdmission([root, old, fine, hot], node("new", "root", 1), options);
    expect(plan.evicted.map(entry => entry.key)).toEqual(["fine", "hot"]);
    expect(plan.record?.key).toBe("new");
    expect(planDerivedCacheAdmission([root], node("orphan", "absent", 2), options).record).toBeNull();
    expect(canDeleteDerivedCacheRecord([root, old, fine], old)).toBe(false);
    expect(planDerivedCacheTrim([root, old, fine], 0).evicted.map(entry => entry.key)).toEqual(["fine"]);
  });

  it("rejects version/source mismatches, legacy restores and ambiguous node collisions", () => {
    const root = node("root");
    const child = node("child", "root", 1);
    expect(planDerivedCacheAdmission([root], { ...child, version: "older-build" }, options).record).toBeNull();
    expect(planDerivedCacheAdmission([root], { ...child, tree: { ...child.tree!, identity: "other-source" } }, options).record).toBeNull();
    expect(planDerivedCacheAdmission([root, child], { ...child, key: "different-fingerprint" }, options).record).toBeNull();
    expect(matchesDerivedCacheTreeRead([root], { ...child, tree: undefined }, { identity: "source/config", node: "child" })).toBe(false);
    expect(matchesDerivedCacheTreeRead([], child, { identity: "source/config", node: "child" })).toBe(false);
  });

  it("replaces protection only for a complete cut and includes ancestor chains", () => {
    const entries = [node("root", null, 0, true), node("old", "root", 1, true), node("new", "root", 1)];
    expect(planDerivedCacheTreeProtection(entries, "terrain", "source-build", "source/config", ["missing"], true)).toBeNull();
    const plan = planDerivedCacheTreeProtection(entries, "terrain", "source-build", "source/config", ["new"], true);
    expect(plan?.filter(entry => entry.tree?.protected).map(entry => entry.key)).toEqual(["root", "new"]);
    expect(entries[1].tree?.protected).toBe(true);
    expect(planDerivedCacheAdmission(entries.slice(0, 2), node("extra", "root", 1), { ...options, capacityBytes: 20 }).record).toBeNull();
  });
});
