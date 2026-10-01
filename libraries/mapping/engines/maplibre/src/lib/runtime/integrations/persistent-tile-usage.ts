/** Aggregate actual tile contributions; callers flush only during idle work.
 * Prefetch/cache reads do not count as display. No buffers or per-frame writes.
 */
export const createPersistentTileUsageQueue = <T>(options: {
  key: (value: T) => string;
  write: (values: readonly T[]) => Promise<unknown>;
  minimumIntervalMs?: number;
}) => {
  const pending = new Map<string, T>();
  let closed = false;
  let writing = false;
  let nextWriteAt = 0;
  return {
    note(values: readonly T[]) {
      if (closed) return;
      for (const value of values) pending.set(options.key(value), value);
      // Usage is optional, never retain an unbounded historical camera path.
      while (pending.size > 4096) pending.delete(pending.keys().next().value!);
    },
    async flush() {
      if (closed || writing || !pending.size || performance.now() < nextWriteAt)
        return;
      const values = [...pending.values()];
      pending.clear();
      writing = true;
      nextWriteAt = performance.now() + (options.minimumIntervalMs ?? 5000);
      try {
        await options.write(values);
      } catch {
        // Optional metadata must not retry in a hot loop or affect live tiles.
      } finally {
        writing = false;
      }
    },
    close() {
      closed = true;
      pending.clear();
    },
  };
};
