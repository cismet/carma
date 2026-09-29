/** Certify a complete cached cut. An available parent covers unfinished child
 * records; unknown branches without such a fallback never count as coverage.
 * This only certifies persistence and does not change the live selection. */
export const collectCachedMeshBase = <T>(
  root: T,
  stored: (tile: T) => boolean,
  children: (tile: T) => readonly T[] | null,
  empty: (tile: T) => boolean
): T[] | null => {
  const visit = (tile: T): T[] | null => {
    const descendants = children(tile);
    if (descendants?.length) {
      const cuts = descendants.map(visit);
      if (cuts.every((cut): cut is T[] => cut !== null)) return cuts.flat();
    } else if (descendants && empty(tile)) return [];
    return stored(tile) ? [tile] : null;
  };
  return visit(root);
};
