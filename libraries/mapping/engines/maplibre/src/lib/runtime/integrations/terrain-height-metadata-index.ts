import { resolveDerivedCacheAssetEpoch } from "@carma-commons/utils";
import {
  decodeTerrainHeightMetadata,
  encodeTerrainHeightMetadata,
  MAX_TERRAIN_HEIGHT_METADATA_ENTRIES,
  type TerrainHeightRange,
} from "../../core/terrain-height-metadata";
import { terrainTileKey, type TerrainTile } from "../../core/raster-dem-tile";
import { runTerrainWorkerTask } from "./terrain-worker-client";

/** Source-space metadata survives mesh eviction; persistence is optional and
 * uses the same immutable main+worker graph epoch as generated geometry.
 * Decision: TERRAIN-VOLUMES-20260908 in engines/maplibre/README.md.
 */
export const createTerrainHeightMetadataIndex = (
  sourceKey: string,
  options: Readonly<{ producerAssetUrl?: string; onRestored?: () => void }> = {}
) => {
  const { producerAssetUrl, onRestored } = options;
  const ranges = new Map<string, TerrainHeightRange>();
  const dirty = new Map<string, TerrainHeightRange>();
  const enabled =
    resolveDerivedCacheAssetEpoch({
      production: import.meta.env.PROD,
      assetUrl: producerAssetUrl ?? "",
    }) !== null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let writeYieldRetries = 0;
  const readAbort = new AbortController();
  const remember = (key: string, range: TerrainHeightRange) => {
    const previous = ranges.get(key);
    const merged: TerrainHeightRange = previous
      ? [Math.min(previous[0], range[0]), Math.max(previous[1], range[1])]
      : range;
    if (previous?.[0] === merged[0] && previous[1] === merged[1]) return false;
    ranges.delete(key);
    ranges.set(key, merged);
    if (ranges.size > MAX_TERRAIN_HEIGHT_METADATA_ENTRIES)
      ranges.delete(ranges.keys().next().value!);
    return true;
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!enabled || !dirty.size) return;
    const updates = encodeTerrainHeightMetadata(dirty);
    dirty.clear();
    // Low-priority worker I/O: no raster, geometry, codec or JSON parse on the
    // pointer/render path. Storage rejection stays optional; a worker yielded
    // to foreground terrain gets a bounded retry instead of losing the batch.
    void runTerrainWorkerTask({
      kind: "write-height-metadata",
      key: sourceKey,
      ranges: updates,
      producerAssetUrl,
    }).catch((error: unknown) => {
      if (
        disposed ||
        !(error instanceof Error) ||
        error.name !== "AbortError" ||
        writeYieldRetries >= 3
      )
        return;
      writeYieldRetries += 1;
      for (const key of decodeTerrainHeightMetadata(updates).keys()) {
        const range = ranges.get(key);
        if (range) dirty.set(key, range);
      }
      while (dirty.size > MAX_TERRAIN_HEIGHT_METADATA_ENTRIES)
        dirty.delete(dirty.keys().next().value!);
      if (timer === undefined)
        timer = setTimeout(flush, 1000 * writeYieldRetries);
    });
  };
  const ready = enabled
    ? (async () => {
        let deadline: ReturnType<typeof setTimeout> | undefined;
        const read = runTerrainWorkerTask(
          { kind: "read-height-metadata", key: sourceKey, producerAssetUrl },
          readAbort.signal
        )
          .then((result) => {
            if (disposed || result.kind !== "read-height-metadata") return;
            let changed = false;
            for (const [key, range] of decodeTerrainHeightMetadata(
              result.ranges
            ))
              changed = remember(key, range) || changed;
            if (changed) onRestored?.();
          })
          .catch(() => undefined);
        try {
          await Promise.race([
            read,
            // Cold worker startup may exceed this budget. Late metadata still
            // improves the next selection; it must not delay first screen fill.
            new Promise<void>((resolve) => {
              deadline = setTimeout(resolve, 50);
            }),
          ]);
        } catch {
          /* No persistent storage must never block normal source loading. */
        } finally {
          clearTimeout(deadline);
        }
      })()
    : Promise.resolve();
  return {
    ready,
    snapshot: () => Object.fromEntries(ranges),
    record(
      tile: Pick<
        TerrainTile,
        "id" | "minimumHeightMeters" | "maximumHeightMeters"
      >
    ) {
      if (disposed) return;
      const minimum = tile.minimumHeightMeters,
        maximum = tile.maximumHeightMeters;
      if (
        !Number.isFinite(minimum) ||
        !Number.isFinite(maximum) ||
        minimum > maximum
      )
        return;
      const key = terrainTileKey(tile.id);
      if (!remember(key, [minimum, maximum])) return;
      if (enabled) {
        writeYieldRetries = 0;
        dirty.set(key, ranges.get(key)!);
        if (dirty.size > MAX_TERRAIN_HEIGHT_METADATA_ENTRIES)
          dirty.delete(dirty.keys().next().value!);
        if (timer === undefined) timer = setTimeout(flush, 1000);
      }
    },
    dispose() {
      disposed = true;
      readAbort.abort();
      flush();
      ranges.clear();
    },
  };
};
