// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createTerrainMemoryAdmission,
  planTerrainAdmissionFamilies,
} from "./terrain-memory-admission";

const family = ["a", "b", "c", "d"];
const fixture = (initialGrant: number) => {
  const records = new Map<string, number>([["parent", 100]]);
  let grant = initialGrant;
  const admission = createTerrainMemoryAdmission({
    residentBytes: () => [...records.values()].reduce((a, b) => a + b, 0),
    resident: (key) => records.has(key),
    grantBytes: () => grant,
    initialEstimateBytes: 25,
  });
  return { admission, records, setGrant: (next: number) => (grant = next) };
};

describe("terrain family memory admission", () => {
  it("reserves all siblings or none, including a lower-priority completion sibling", () => {
    const f = fixture(199);
    expect(f.admission.reserveFamily(family)).toBe(false);
    expect(f.admission.reservedBytes()).toBe(0);
    expect([...f.records.keys()]).toEqual(["parent"]);
    f.setGrant(200);
    f.admission.resetDeferred();
    expect(f.admission.reserveFamily(family)).toBe(true);
    for (const key of family) {
      expect(f.admission.canInstall(key, 25)).toBe(true);
      f.records.set(key, 25);
      f.admission.installed(key, 25);
    }
    expect(f.admission.reservedBytes()).toBe(0);
    expect(f.records.size).toBe(5);
  });

  it("deduplicates cached/shared siblings and checks underestimated results against other reservations", () => {
    const f = fixture(200);
    f.records.set("a", 25);
    expect(f.admission.reserveFamily([...family, "b"])).toBe(true);
    expect(f.admission.reservedBytes()).toBe(75);
    expect(f.admission.canInstall("b", 26)).toBe(false);
    expect(f.admission.rejectFamily("b")).toEqual(family);
    expect(f.admission.reservedBytes()).toBe(0);
    expect(f.admission.reserveFamily(family)).toBe(false);
    expect(f.records.get("parent")).toBe(100);
  });

  it("releases stale request reservations without retiring resident terrain", () => {
    const f = fixture(200);
    f.admission.reserveFamily(family);
    f.admission.reconcile(new Set(["a"]));
    expect(f.admission.reservedBytes()).toBe(25);
    expect(f.records.get("parent")).toBe(100);
    f.admission.release("a");
    expect(f.admission.reservedBytes()).toBe(0);
  });

  it("allows a small first surface despite a conservative forecast but never exceeds the actual grant", () => {
    const f = fixture(110);
    expect(f.admission.reserveFamily(["a"], true)).toBe(true);
    expect(f.admission.canInstall("a", 10)).toBe(true);
    expect(f.admission.canInstall("a", 11)).toBe(false);
  });

  it("gathers only direct families across stages and keeps inputs unchanged", () => {
    const entries = [
      { key: "a", parent: "p" },
      { key: "b", parent: "p" },
      { key: "c", parent: "q" },
    ];
    const stages = [[entries[0]], [entries[2], entries[1], entries[0]]];
    const groups = planTerrainAdmissionFamilies(
      stages,
      (e) => e.key,
      (e) => e.parent,
      [
        { key: "d", parent: "p" },
        { key: "ignored", parent: "absent" },
      ]
    );
    expect(groups.get("a")).toEqual(["a", "b", "d"]);
    expect(groups.has("ignored")).toBe(false);
    expect(groups.get("c")).toEqual(["c"]);
    expect(stages[1]).toHaveLength(3);
  });
});
