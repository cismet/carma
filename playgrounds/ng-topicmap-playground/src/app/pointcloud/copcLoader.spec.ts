import { describe, expect, it, vi } from "vitest";

vi.mock("maplibre-gl", () => ({
  MercatorCoordinate: {
    fromLngLat: vi.fn(),
  },
}));

import {
  canonicalPointCloudFieldName,
  createRangeGetter,
  dropConstantCloudFields,
  normalizeCopcScalarFieldValue,
} from "./copcLoader";
import type { CopcPointChunk } from "./copcLoader";

const chunk = (fields: Record<string, number[]>): CopcPointChunk => ({
  positions: new Float32Array(6),
  colors: null,
  spacing: 0.5,
  fieldValues: Object.fromEntries(
    Object.entries(fields).map(([name, values]) => [
      name,
      new Float32Array(values),
    ])
  ),
  pointCount: 2,
});

describe("dropConstantCloudFields", () => {
  it("removes globally constant source fields and retains varying fields", () => {
    const chunks = [
      chunk({ intensity: [0, 0], classification: [2, 2] }),
      chunk({ intensity: [0, 0], classification: [2, 9] }),
    ];

    expect(dropConstantCloudFields(chunks)).toEqual(["intensity"]);
    expect(chunks[0].fieldValues.intensity).toBeUndefined();
    expect(Array.from(chunks[1].fieldValues.classification)).toEqual([2, 9]);
  });
});

describe("canonicalPointCloudFieldName", () => {
  it("normalizes LAS standard and Extra Byte names to lowercase", () => {
    expect(canonicalPointCloudFieldName("UserData")).toBe("userdata");
    expect(canonicalPointCloudFieldName("AO")).toBe("ao");
    expect(canonicalPointCloudFieldName("classification")).toBe(
      "classification"
    );
  });
});

describe("normalizeCopcScalarFieldValue", () => {
  it("normalizes baked uint8 AO while preserving other scalar fields", () => {
    expect(normalizeCopcScalarFieldValue("AO", 0)).toBe(0);
    expect(normalizeCopcScalarFieldValue("AO", 255)).toBe(1);
    expect(normalizeCopcScalarFieldValue("classification", 9)).toBe(9);
  });
});

describe("createRangeGetter", () => {
  it("passes abort signals to range requests and preserves AbortError", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("cancelled", "AbortError");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(abortError);
    const getter = createRangeGetter("https://example.test/cloud.copc.laz", {
      requireByteRanges: true,
      signal: controller.signal,
    });

    controller.abort();
    await expect(getter(0, 32)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/cloud.copc.laz",
      expect.objectContaining({
        headers: { Range: "bytes=0-31" },
        signal: controller.signal,
      })
    );
    fetchMock.mockRestore();
  });
});
