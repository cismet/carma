import { AvifPyramidPreviewSource } from "./avif-pyramid-preview-source";
import { abortable } from "./avif-tile-source";
import {
  getMissingImageSource,
  isAvifSourceMissing,
  rememberMissingImageSource,
} from "./image-source-availability";
export { isAvifSourceMissing } from "./image-source-availability";

export type FallbackAvifPreviewSource = AvifPyramidPreviewSource &
  Readonly<{ representationSelected: boolean }>;

type Dimensions = Awaited<
  ReturnType<AvifPyramidPreviewSource["getDimensions"]>
>;

/** Select one representation before returning pages; keep the lease identity stable. */
export const createFallbackAvifPreviewSource = (
  url: string,
  budget = 64 * 1024 * 1024,
  priority?: "low" | "high" | "auto",
  options: { format?: "native"; fallbackUrl?: string } = {}
): FallbackAvifPreviewSource => {
  let current = new AvifPyramidPreviewSource(url, budget, priority, options);
  let selected: Dimensions | undefined;
  let opening:
    | { signal: AbortSignal; promise: Promise<Dimensions> }
    | undefined;
  const lifetime = new AbortController();

  const choose = async (signal: AbortSignal): Promise<Dimensions> => {
    const controller = new AbortController();
    const abort = () =>
      controller.abort(signal.aborted ? signal.reason : lifetime.signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    lifetime.signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted || lifetime.signal.aborted) abort();
    try {
      for (;;) {
        controller.signal.throwIfAborted();
        const missing = getMissingImageSource(`avif:${current.url}`);
        try {
          if (missing) throw missing;
          const dimensions = await current.getDimensions(controller.signal);
          controller.signal.throwIfAborted();
          selected = dimensions;
          return dimensions;
        } catch (error) {
          controller.signal.throwIfAborted();
          if (!isAvifSourceMissing(error)) throw error;
          if (!missing)
            rememberMissingImageSource(`avif:${current.url}`, error);
          if (!options.fallbackUrl || current.url === options.fallbackUrl)
            throw error;
          current.close();
          // Each delegate owns its actual URL, range cache and encoded pages.
          current = new AvifPyramidPreviewSource(
            options.fallbackUrl,
            budget,
            priority
          );
        }
      }
    } finally {
      signal.removeEventListener("abort", abort);
      lifetime.signal.removeEventListener("abort", abort);
    }
  };
  const initialize = async (signal: AbortSignal): Promise<Dimensions> => {
    signal.throwIfAborted();
    lifetime.signal.throwIfAborted();
    if (selected) return selected;
    if (opening) {
      const pending = opening;
      try {
        return await abortable(pending.promise, signal);
      } catch (error) {
        signal.throwIfAborted();
        lifetime.signal.throwIfAborted();
        if (!pending.signal.aborted) throw error;
        // A cancelled caller must not poison the next caller's initialization.
        if (opening === pending) opening = undefined;
        return initialize(signal);
      }
    }
    const pending = { signal, promise: choose(signal) };
    opening = pending;
    try {
      return await pending.promise;
    } finally {
      if (opening === pending) opening = undefined;
    }
  };

  return new Proxy(current, {
    get(_target, property) {
      if (property === "url") return url;
      if (property === "representationSelected") return selected !== undefined;
      if (property === "getDimensions") return initialize;
      if (property === "select")
        return async (
          ...args: Parameters<AvifPyramidPreviewSource["select"]>
        ) => {
          await initialize(args[2]);
          args[2].throwIfAborted();
          lifetime.signal.throwIfAborted();
          return current.select(...args);
        };
      if (property === "setActiveCacheBudget")
        return (bytes = 64 * 1024 * 1024) => {
          current.setActiveCacheBudget(bytes);
          budget = bytes;
        };
      if (property === "park")
        return (bytes: number) => {
          current.park(bytes);
          budget = bytes;
        };
      if (property === "close")
        return () => {
          if (lifetime.signal.aborted) return;
          lifetime.abort();
          current.close();
        };
      const value: unknown = Reflect.get(current, property, current);
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) as FallbackAvifPreviewSource;
};
