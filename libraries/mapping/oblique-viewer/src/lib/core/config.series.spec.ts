import { describe, expect, it } from "vitest";
import { mergeObliqueSeries } from "./config";
import type { ObliqueDataset } from "./types";

const series = (id: string, label = id) => ({ id, label } as ObliqueDataset);

describe("configured and local image series", () => {
  it("exposes a local series before a remote catalogue resolves", () => {
    const local = [series("local", "photo.avif")];
    expect(mergeObliqueSeries([], local)).toBe(local);
  });

  it("retains configured series when a local photo is added", () => {
    const configured = [series("2024"), series("2026")];
    const local = series("local", "photo.avif");
    expect(mergeObliqueSeries(configured, [local])).toEqual([
      ...configured,
      local,
    ]);
    expect(configured).toHaveLength(2);
  });

  it("does not duplicate an explicit series identity", () => {
    const local = series("shared", "photo.avif");
    expect(
      mergeObliqueSeries([series("shared"), series("2024")], [local])
    ).toEqual([local, series("2024")]);
  });

  it("preserves the configured array when nothing is added", () => {
    const configured = [series("2024")];
    expect(mergeObliqueSeries(configured, [])).toBe(configured);
  });
});
