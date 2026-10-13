// @vitest-environment jsdom
import type { Map as MaplibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";
import type { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";
import { debugTilesRuntimes } from "./three-tiles-runtime-debug";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("mesh runtime loading pause", () => {
  it("composes the host pause with the foreground network pause", async () => {
    const runtime = buildThreeTilesRuntime(
      "loading-pause",
      "mesh.json",
      [7.2, 51.2]
    );
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    runtime.scene.onAdd?.(map);
    try {
      runtime.debug.setDiagnosticsEnabled(true);
      await vi.dynamicImportSettled();
      const state = [...(debugTilesRuntimes() ?? [])].find(
        (entry) => (entry as { layerId: string }).layerId === "loading-pause"
      ) as { loadingPaused: boolean };
      expect(state.loadingPaused).toBe(false);
      runtime.scene.setLoadingPaused?.(true);
      expect(state.loadingPaused).toBe(true);
      runtime.loading.setPaused(true);
      runtime.scene.setLoadingPaused?.(false);
      // The diagnostics pause still holds after the lease is gone.
      expect(state.loadingPaused).toBe(true);
      runtime.scene.setLoadingPaused?.(true);
      runtime.loading.setPaused(false);
      expect(state.loadingPaused).toBe(true);
      runtime.scene.setLoadingPaused?.(false);
      expect(state.loadingPaused).toBe(false);
    } finally {
      runtime.debug.setDiagnosticsEnabled(false);
      runtime.scene.dispose?.();
    }
  });
  it("gates root and base-cache requests, resumes waiters and cancels them on abort or dispose", async () => {
    const runtime = buildThreeTilesRuntime(
      "network-gate",
      "mesh.json",
      [7.2, 51.2]
    );
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    runtime.scene.onAdd?.(map);
    runtime.debug.setDiagnosticsEnabled(true);
    const state = [...(debugTilesRuntimes() ?? [])].find(
      (entry) => (entry as { layerId: string }).layerId === "network-gate"
    ) as { tiles: { getPluginByName: (name: string) => Gltf1UpgradePlugin } };
    const source = state.tiles.getPluginByName("GLTF1_UPGRADE_PLUGIN");
    try {
      runtime.scene.setLoadingPaused?.(true);
      const first = source.fetchData("https://tiles.test/root.json", {});
      const aborted = new AbortController();
      const cancelled = source.fetchData("https://tiles.test/cancelled.json", {
        signal: aborted.signal,
      });
      const cancelledCheck = expect(cancelled).rejects.toMatchObject({
        name: "AbortError",
      });
      await Promise.resolve();
      expect(fetch).not.toHaveBeenCalled();
      aborted.abort();
      await cancelledCheck;
      // A short release immediately followed by a new hold must not dispatch.
      runtime.scene.setLoadingPaused?.(false);
      runtime.scene.setLoadingPaused?.(true);
      await Promise.resolve();
      expect(fetch).not.toHaveBeenCalled();
      runtime.scene.setLoadingPaused?.(false);
      await first;
      expect(fetch).toHaveBeenCalledTimes(1);
      runtime.scene.setLoadingPaused?.(true);
      const disposed = source.fetchData("https://tiles.test/disposed.json", {});
      const disposedCheck = expect(disposed).rejects.toMatchObject({
        name: "AbortError",
      });
      runtime.scene.dispose?.();
      await disposedCheck;
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      runtime.debug.setDiagnosticsEnabled(false);
      runtime.scene.dispose?.();
      fetch.mockRestore();
    }
  });
});
