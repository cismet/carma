import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStandaloneObliqueDocument } from "../../core/utils/standalone-oblique-document";
import { standalonePreparedFixture } from "../../core/utils/standalone-oblique.test-fixture";
import { datasetFromStandaloneAvif } from "../utils/adhoc-oblique-datasets";
import { useObliqueData } from "./useObliqueData";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("standalone-only catalog loading", () => {
  it("makes no request or worker when no default series are enabled", async () => {
    const fetchMock = vi.fn(() => {
        throw Error("No enabled catalog");
      }),
      worker = vi.fn(() => {
        throw Error("No enabled worker");
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("Worker", worker);
    const view = renderHook(() => useObliqueData([], true));
    expect(await view.result.current.awaitAll()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });

  it("loads one ad-hoc inline series without external catalog/footprint/geoid traffic", async () => {
    const fetchMock = vi.fn(() => {
        throw Error("Inline AVIF must not fetch its catalogue");
      }),
      worker = vi.fn(() => {
        throw Error("Inline AVIF must not start catalog worker");
      });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("Worker", worker);
    const dataset = datasetFromStandaloneAvif(
        createStandaloneObliqueDocument(standalonePreparedFixture()),
        "blob:hook-sample",
        "adhoc-hook-one"
      ),
      series = [dataset];
    const view = renderHook(() => useObliqueData(series, true));
    await waitFor(() =>
      expect(view.result.current.data?.imageRecords.size).toBe(1)
    );
    expect(view.result.current.data?.datasets.has(dataset.id)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(worker).not.toHaveBeenCalled();
  });
});
