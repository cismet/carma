import { afterEach, describe, expect, it, vi } from "vitest";

import { loadDzbPrmLayer, MODEL_COLLECTION_LAYER_ID } from "./dzb-prm-layer";

describe("loadDzbPrmLayer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads the sibling ad-hoc layer and validates its identity", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: MODEL_COLLECTION_LAYER_ID, type: "object" }),
    });

    await expect(
      loadDzbPrmLayer(
        "/assets/dz-b-prm/collection.json",
        "https://example.org/"
      )
    ).resolves.toMatchObject({ id: MODEL_COLLECTION_LAYER_ID });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL("https://example.org/assets/dz-b-prm/buga.layer.json")
    );
  });

  it("rejects an unrelated layer", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "other", type: "object" }),
    });

    await expect(
      loadDzbPrmLayer(
        "/assets/dz-b-prm/collection.json",
        "https://example.org/"
      )
    ).rejects.toThrow("Invalid BuGa ad-hoc layer JSON");
  });
});
