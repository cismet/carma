/** Tracks resident record costs at their mutation boundaries. */
export const createTerrainRetainedByteLedger = <Record>(
  measure: (record: Record) => number
) => {
  const entries = new Map<string, { record: Record; bytes: number }>();
  let total = 0;
  const remove = (key: string) => {
    const previous = entries.get(key);
    if (!previous) return;
    total -= previous.bytes;
    entries.delete(key);
  };
  const set = (key: string, record: Record) => {
    remove(key);
    const bytes = measure(record);
    entries.set(key, { record, bytes });
    total += bytes;
    return bytes;
  };
  return {
    set,
    remove,
    refresh: (key: string) => {
      const entry = entries.get(key);
      return entry === undefined ? 0 : set(key, entry.record);
    },
    bytes: (key: string) => entries.get(key)?.bytes ?? null,
    total: () => total,
    clear: () => {
      entries.clear();
      total = 0;
    },
  };
};
