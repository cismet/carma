import {
  JpegTileSource,
  drawImageLevels,
  type ImageLevelStack,
  type ImageLevelStackPoolDemand,
  type ImageLevel,
  type ImagePyramidSource,
  type ImageTileRef,
  type ImageTileSource,
} from "@carma-commons/image-pyramid";

import type { DevicePixels, Ratio } from "@carma-units";
import { nativePixelPool } from "./native-preview-pool";

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
  source?: ImageTileSource;
  lease?: ImageLevelStackPoolDemand;
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
    if (entry.input.kind === "avif") entry.lease?.release();
    else entry.source?.dispose();
    if (entries.get(entry.input.url) === entry) entries.delete(entry.input.url);
  };
  const stop = () => {
    if (!active) return;
    active.controller.abort();
    // open() has its own metadata controller; aborting only our signal is insufficient.
    if (active.entry.input.kind === "avif") active.entry.lease?.release();
    else if (active.entry.levels) active.entry.source?.pause();
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
          !entries.get(item.url)?.reading &&
          (progress.get(item.url) ?? 5) >= 3 &&
          !(item.kind === "avif" && nativePixelPool.hasForeground(item))
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
    if (input.kind === "avif") {
      await runShared(input, budget);
      return;
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
      const source = new JpegTileSource(
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
    const source = entry.source!;
    const levelNumber = progress.get(input.url) ?? 5;
    let triedFallback = false;
    const fetchLevel = async (level: ImageLevel) => {
      await source.fetch(refsOf(level), job.controller.signal, "low");
      job.controller.signal.throwIfAborted();
      if (refsOf(level).every((tile) => entry.source?.hasBytes(tile)))
        entry.base = level;
    };
    try {
      entry.levels ??= (await source.open(job.controller.signal)).levels;
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
        source.pause();
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
  const waitDemand = (
    stack: ImageLevelStack,
    lease: ImageLevelStackPoolDemand,
    signal: AbortSignal,
    budgeted = false
  ) =>
    new Promise<boolean>((resolve, reject) => {
      let unsubscribe: () => void = () => undefined;
      const stopped = () =>
        finish(
          undefined,
          signal.reason ?? new DOMException("Aborted", "AbortError")
        );
      const finish = (value?: boolean, error?: unknown) => {
        unsubscribe();
        signal.removeEventListener("abort", stopped);
        if (error) reject(error);
        else resolve(value ?? false);
      };
      const check = () => {
        if (signal.aborted) return stopped();
        if (stack.error) return finish(undefined, Error(stack.error));
        if (lease.visibleReady) return finish(true);
        if (budgeted && lease.prefetchExhausted) finish(false);
      };
      unsubscribe = stack.subscribe(check);
      signal.addEventListener("abort", stopped, { once: true });
      check();
    });
  const runShared = async (
    input: ImagePyramidSource,
    budget: { remainingBytes: number }
  ) => {
    if (budget.remainingBytes <= 0) {
      progress.set(input.url, -1);
      enqueue();
      return;
    }
    const entry: Entry = entries.get(input.url) ?? { input };
    entries.set(input.url, entry);
    let lease = nativePixelPool.acquireDemand(input, {
      priority: "low",
      decode: false,
      prefetchBudget: budget,
    });
    entry.lease = lease;
    let settle!: () => void;
    const job = {
      entry,
      controller: new AbortController(),
      settled: new Promise<void>((resolve) => {
        settle = resolve;
      }),
    };
    active = job;
    try {
      const stack = await lease.ready;
      job.controller.signal.throwIfAborted();
      entry.source = stack.source;
      const pyramid = stack.pyramid!;
      entry.levels = pyramid.levels;
      const number = progress.get(input.url) ?? 5;
      const level =
        pyramid.levels.find((item) => item.level === number) ??
        (number === 5
          ? pyramid.levels.find((item) => item.level === 6) ??
            [...pyramid.levels]
              .filter((item) => item.level >= 3 && item.level <= 6)
              .sort((a, b) => b.level - a.level)[0]
          : undefined);
      if (!level) {
        progress.set(input.url, number - 1);
        return;
      }
      if (nativePixelPool.hasForeground(input)) return;
      const initial = lease;
      lease = nativePixelPool.acquireDemand(input, {
        priority: "low",
        decode: false,
        level: level.level,
        prefetchBudget: budget,
      });
      entry.lease = lease;
      initial.release();
      await lease.ready;
      job.controller.signal.throwIfAborted();
      lease.setView(
        {
          visible: {
            x: 0 as DevicePixels,
            y: 0 as DevicePixels,
            ...pyramid.native,
          },
          density: (level.width / pyramid.native.width) as Ratio,
        },
        level.width * level.height
      );
      const complete = await waitDemand(
        stack,
        lease,
        job.controller.signal,
        true
      );
      if (complete) {
        entry.base = level;
        progress.set(input.url, Math.min(number, level.level) - 1);
      } else progress.set(input.url, -1);
    } catch {
      if (!job.controller.signal.aborted) progress.set(input.url, -1);
    } finally {
      lease.release();
      if (entry.lease === lease) entry.lease = undefined;
      if (active === job) active = undefined;
      while (entries.size > MAX_RETAINED_SOURCES) {
        const oldest = [...entries.values()].find(
          (item) => !item.reading && item !== active?.entry
        );
        if (!oldest) break;
        remove(oldest);
      }
      settle();
      enqueue();
    }
  };
  const unsubscribePool = nativePixelPool.subscribe(enqueue);
  const readSharedBase = async (
    input: ImagePyramidSource,
    signal: AbortSignal
  ) => {
    const cached = nativePixelPool.peek(input);
    const pyramid = cached?.pyramid;
    if (!cached || !pyramid) return;
    const level = [...pyramid.levels]
      .filter(
        (item) =>
          item.level >= 3 &&
          item.level <= 6 &&
          item.width * item.height <= 4 * 1024 * 1024 &&
          refsOf(item).every((tile) => cached.source.hasBytes(tile))
      )
      .sort((a, b) => a.level - b.level)[0];
    if (!level) return;
    const lease = nativePixelPool.acquireDemand(input, {
      priority: "low",
      level: level.level,
    });
    const abort = () => lease.release();
    signal.addEventListener("abort", abort, { once: true });
    let canvas: OffscreenCanvas | undefined;
    try {
      signal.throwIfAborted();
      const stack = await lease.ready;
      signal.throwIfAborted();
      lease.setView(
        {
          visible: {
            x: 0 as DevicePixels,
            y: 0 as DevicePixels,
            ...pyramid.native,
          },
          density: (level.width / pyramid.native.width) as Ratio,
        },
        level.width * level.height
      );
      if (!(await waitDemand(stack, lease, signal))) return;
      canvas = new OffscreenCanvas(level.width, level.height);
      const context = canvas.getContext("2d");
      if (!context) return;
      drawImageLevels(
        context,
        stack,
        { originX: 0, originY: 0, scale: level.width / pyramid.native.width },
        canvas,
        { plan: lease.plan }
      );
      return canvas;
    } catch {
      if (canvas) canvas.width = canvas.height = 1;
      return;
    } finally {
      signal.removeEventListener("abort", abort);
      lease.release();
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
      if (input.kind === "avif") return readSharedBase(input, signal);
      const entry = entries.get(input.url);
      const level = entry?.levels
        ?.filter(
          (item) =>
            item.level >= 3 &&
            item.level <= 6 &&
            item.width * item.height <= 4 * 1024 * 1024 &&
            refsOf(item).every((tile) => entry.source?.hasBytes(tile))
        )
        .sort((a, b) => a.level - b.level)[0];
      if (
        !entry ||
        !level ||
        entry.reading ||
        level.width * level.height > 4 * 1024 * 1024 ||
        refsOf(level).some((tile) => !entry.source?.hasBytes(tile))
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
      const source = entry.source!;
      const previous = source.prefetchBudget;
      source.prefetchBudget = { remainingBytes: 0 };
      let canvas: OffscreenCanvas | undefined;
      try {
        canvas = new OffscreenCanvas(level.width, level.height);
        const context = canvas.getContext("2d");
        if (!context) return;
        for (const tile of refsOf(level)) {
          signal.throwIfAborted();
          const bitmap = await source.decode(tile, signal);
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
        source.prefetchBudget = previous;
        entry.reading = false;
        enqueue();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribePool();
      clearTimeout(scheduled);
      stop();
      for (const entry of [...entries.values()]) remove(entry);
      entries.clear();
      progress.clear();
    },
  };
};
