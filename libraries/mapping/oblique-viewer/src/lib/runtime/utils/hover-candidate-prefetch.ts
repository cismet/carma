import {
  AvifTileSource,
  JpegTileSource,
  type ImageLevel,
  type ImagePyramidSource,
  type ImageTileRef,
  type ImageTileSource,
} from "@carma-commons/image-pyramid";

const IMAGE_BYTES = 500_000;
const MAX_RETAINED_SOURCES = 128;
// A URL's speculative allowance survives viewport changes and option toggles.
// This is an accounting ledger, not a second image cache.
const allowances = new Map<string, { remainingBytes: number }>();
const refsOf = (level: ImageLevel): ImageTileRef[] => {
  const refs: ImageTileRef[] = [];
  for (let row = 0; row < level.rows; row++)
    for (let col = 0; col < level.cols; col++)
      refs.push({ level: level.level, col, row });
  return refs;
};
type Entry = {
  input: ImagePyramidSource;
  source: ImageTileSource;
  levels?: readonly ImageLevel[];
  base?: ImageLevel;
  reading?: boolean;
};

/** Serial compressed-only preparation, sharing the normal URL range cache. */
export const createHoverCandidatePrefetch = () => {
  const entries = new Map<string, Entry>();
  // Progress survives local eviction, but never forbids a future queue from
  // restoring cached ranges with the URL's remaining allowance.
  const progress = new Map<string, number>();
  let candidates: readonly ImagePyramidSource[] = [];
  let paused = false;
  let disposed = false;
  let active:
    | { entry: Entry; controller: AbortController; settled: Promise<void> }
    | undefined;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  const remove = (entry: Entry) => {
    entry.source.dispose();
    if (entries.get(entry.input.url) === entry) entries.delete(entry.input.url);
  };
  const stop = () => {
    if (!active) return;
    active.controller.abort();
    // open() has its own metadata controller; aborting only our signal is insufficient.
    if (active.entry.levels) active.entry.source.pause();
    else remove(active.entry);
  };
  const enqueue = () => {
    if (disposed || paused || active || scheduled !== undefined) return;
    scheduled = setTimeout(() => {
      scheduled = undefined;
      void run();
    }, 0);
  };
  const run = async () => {
    if (disposed || paused || active) return;
    // Round-robin by level: every L5 precedes L4, and every L4 precedes L3.
    // L6 is only a fallback; successful L5 needs no preceding payload request.
    const input = candidates
      .filter(
        (item) =>
          !entries.get(item.url)?.reading && (progress.get(item.url) ?? 5) >= 3
      )
      .reduce<ImagePyramidSource | undefined>(
        (best, item) =>
          !best || (progress.get(item.url) ?? 5) > (progress.get(best.url) ?? 5)
            ? item
            : best,
        undefined
      );
    if (!input) return;
    let budget = allowances.get(input.url);
    if (!budget) {
      budget = { remainingBytes: IMAGE_BYTES };
      allowances.set(input.url, budget);
    }
    let entry = entries.get(input.url);
    if (!entry) {
      if (
        budget.remainingBytes <= 0 ||
        (input.kind === "jpeg" &&
          (!input.nativeSize ||
            (input.jpegLevels &&
              !input.jpegLevels.some((level) => level >= 3 && level <= 6))))
      ) {
        progress.set(input.url, -1);
        enqueue();
        return;
      }
      const source =
        input.kind === "avif"
          ? new AvifTileSource(input.url, {
              maxCompressedBytes: IMAGE_BYTES,
              allowedLevels: [3, 4, 5, 6],
            })
          : new JpegTileSource(
              input.url,
              input.nativeSize!,
              [6, 5, 4, 3].filter(
                (level) => !input.jpegLevels || input.jpegLevels.includes(level)
              )
            );
      source.priority = "low";
      source.prefetchBudget = budget;
      entry = { input, source };
      entries.set(input.url, entry);
      // Payloads total at most 64MB; only two hovered photos get decoded snapshots.
      while (entries.size > MAX_RETAINED_SOURCES) {
        const oldest = [...entries.values()].find((item) => !item.reading)!;
        remove(oldest);
      }
    }
    let settle!: () => void;
    const job = {
      entry,
      controller: new AbortController(),
      settled: new Promise<void>((resolve) => {
        settle = resolve;
      }),
    };
    active = job;
    const levelNumber = progress.get(input.url) ?? 5;
    let triedFallback = false;
    const fetchLevel = async (level: ImageLevel) => {
      await entry.source.fetch(refsOf(level), job.controller.signal, "low");
      job.controller.signal.throwIfAborted();
      if (refsOf(level).every((tile) => entry.source.hasBytes(tile)))
        entry.base = level;
    };
    try {
      entry.levels ??= (await entry.source.open(job.controller.signal)).levels;
      let level = entry.levels.find((item) => item.level === levelNumber);
      if (!level && levelNumber === 5) {
        triedFallback = true;
        level = entry.levels.find((item) => item.level === 6);
      }
      if (level) await fetchLevel(level);
      progress.set(input.url, levelNumber - 1);
    } catch {
      if (!job.controller.signal.aborted) {
        // A rejected L5 may still leave enough allowance for one L6 fallback.
        // Finer failures retain the already completed base without retry loops.
        entry.source.pause();
        const fallback =
          levelNumber === 5 && !triedFallback && budget.remainingBytes > 0
            ? entry.levels?.find((item) => item.level === 6)
            : undefined;
        if (fallback) {
          try {
            await fetchLevel(fallback);
          } catch {
            /* Keep any completed base. */
          }
        }
        if (!job.controller.signal.aborted) {
          progress.set(input.url, -1);
          if (!entry.base) remove(entry);
        }
      }
    } finally {
      if (active === job) active = undefined;
      settle();
      enqueue();
    }
  };
  return {
    update(sources: readonly ImagePyramidSource[], isPaused: boolean) {
      if (disposed) return;
      candidates = [
        ...new Map(sources.map((source) => [source.url, source])).values(),
      ];
      const wanted = new Set(candidates.map((source) => source.url));
      for (const url of progress.keys())
        if (!wanted.has(url)) progress.delete(url);
      paused = isPaused;
      if (
        active &&
        (paused ||
          !candidates.some((source) => source.url === active!.entry.input.url))
      )
        stop();
      enqueue();
    },
    async readBase(input: ImagePyramidSource, signal: AbortSignal) {
      const entry = entries.get(input.url);
      const level = entry?.levels
        ?.filter(
          (item) =>
            item.level >= 3 &&
            item.level <= 6 &&
            item.width * item.height <= 4 * 1024 * 1024 &&
            refsOf(item).every((tile) => entry.source.hasBytes(tile))
        )
        .sort((a, b) => a.level - b.level)[0];
      if (
        !entry ||
        !level ||
        entry.reading ||
        level.width * level.height > 4 * 1024 * 1024 ||
        refsOf(level).some((tile) => !entry.source.hasBytes(tile))
      )
        return;
      // Cached whole levels already include their decode headers. Forbid any
      // unexpected extra network request while decoding a speculative base.
      // An on-demand decode owns this source until completion. Refinement and
      // another readBase may not change its allowance underneath it.
      entry.reading = true;
      if (active?.entry === entry) {
        const finishing = active.settled;
        stop();
        await finishing;
      }
      const previous = entry.source.prefetchBudget;
      entry.source.prefetchBudget = { remainingBytes: 0 };
      let canvas: OffscreenCanvas | undefined;
      try {
        canvas = new OffscreenCanvas(level.width, level.height);
        const context = canvas.getContext("2d");
        if (!context) return;
        for (const tile of refsOf(level)) {
          signal.throwIfAborted();
          const bitmap = await entry.source.decode(tile, signal);
          try {
            signal.throwIfAborted();
            context.drawImage(
              bitmap,
              tile.col * level.tileWidth,
              tile.row * level.tileHeight
            );
          } finally {
            bitmap.close();
          }
        }
        return canvas;
      } catch {
        if (canvas) canvas.width = canvas.height = 1;
        return;
      } finally {
        entry.source.prefetchBudget = previous;
        entry.reading = false;
        enqueue();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(scheduled);
      stop();
      for (const entry of entries.values()) entry.source.dispose();
      entries.clear();
      progress.clear();
    },
  };
};
