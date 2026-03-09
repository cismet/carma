export const buildOrderById = <TEntry extends { id: string }>(
  entries: readonly TEntry[]
): Record<string, number> =>
  entries.reduce<Record<string, number>>((orderById, entry, index) => {
    orderById[entry.id] = index + 1;
    return orderById;
  }, {});
