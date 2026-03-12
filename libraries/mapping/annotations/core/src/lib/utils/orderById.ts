type OrderedEntry = {
  id: string;
  index?: number | null;
  timestamp?: number | null;
};

const toSortableIndex = (index?: number | null): number =>
  Number.isFinite(index) ? Number(index) : Number.POSITIVE_INFINITY;

const toSortableTimestamp = (timestamp?: number | null): number =>
  Number.isFinite(timestamp) ? Number(timestamp) : Number.POSITIVE_INFINITY;

export const compareOrderedEntries = <TEntry extends OrderedEntry>(
  left: TEntry,
  right: TEntry
): number => {
  const indexDelta = toSortableIndex(left.index) - toSortableIndex(right.index);
  if (indexDelta !== 0) return indexDelta;

  const timeDelta =
    toSortableTimestamp(left.timestamp) - toSortableTimestamp(right.timestamp);
  if (timeDelta !== 0) return timeDelta;

  return left.id.localeCompare(right.id);
};

export const sortEntriesByOrder = <TEntry extends OrderedEntry>(
  entries: readonly TEntry[]
): TEntry[] => [...entries].sort(compareOrderedEntries);

export const buildOrderById = <TEntry extends { id: string }>(
  entries: readonly TEntry[]
): Record<string, number> =>
  entries.reduce<Record<string, number>>((orderById, entry, index) => {
    orderById[entry.id] = index + 1;
    return orderById;
  }, {});

export const buildOrderByIdFromEntryOrder = <TEntry extends OrderedEntry>(
  entries: readonly TEntry[]
): Record<string, number> => buildOrderById(sortEntriesByOrder(entries));
