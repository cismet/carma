// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createTerrainRetainedByteLedger } from "./terrain-retained-byte-ledger";

describe("terrain resident byte ledger", () => {
  it("matches a full recount across insert, replacement, mutation, transfer and removal", () => {
    const records = new Map<string, { bytes: number }>();
    const measure = vi.fn((record: { bytes: number }) => record.bytes);
    const ledger = createTerrainRetainedByteLedger(measure);
    const recount = () =>
      [...records.values()].reduce((sum, record) => sum + record.bytes, 0);
    const check = () => expect(ledger.total()).toBe(recount());

    const first = { bytes: 40 };
    records.set("a", first);
    ledger.set("a", first);
    check();
    records.set("b", { bytes: 60 });
    ledger.set("b", records.get("b")!);
    check();
    records.set("a", { bytes: 35 });
    ledger.set("a", records.get("a")!);
    check();
    records.get("b")!.bytes = 75;
    ledger.refresh("b");
    check();
    const transferred = records.get("a")!;
    records.delete("a");
    ledger.remove("a");
    check();
    records.set("fallback:a", transferred);
    ledger.set("fallback:a", transferred);
    check();
    records.delete("b");
    ledger.remove("b");
    check();
    expect(ledger.bytes("b")).toBeNull();
    const measured = measure.mock.calls.length;
    for (let i = 0; i < 100; i++) check();
    expect(measure).toHaveBeenCalledTimes(measured);
    records.clear();
    ledger.clear();
    check();
  });
});
