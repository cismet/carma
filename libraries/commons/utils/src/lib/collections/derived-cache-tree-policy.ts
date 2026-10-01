import type {
  DerivedCacheMetadata,
  DerivedCacheRecord,
  DerivedCacheTree,
} from "./derived-cache-policy";

export type DerivedCacheTreeRead = Readonly<{ identity: string; node: string }>;
export type DerivedCacheReadOptions = Readonly<{
  touch?: boolean;
  tree?: DerivedCacheTreeRead;
}>;
export type DerivedCacheTreeProtectionOptions = Readonly<{
  replace?: boolean;
  manifest?: Readonly<{ key: string; value: unknown; bytes: number }>;
}>;

export const isDerivedCacheTreeValid = (tree: DerivedCacheTree) =>
  tree !== null &&
  typeof tree === "object" &&
  [tree.identity, tree.node].every(
    (value) => typeof value === "string" && value.length > 0
  ) &&
  (tree.parent === null ||
    (typeof tree.parent === "string" &&
      tree.parent.length > 0 &&
      tree.parent !== tree.node)) &&
  Number.isSafeInteger(tree.level) &&
  tree.level >= 0 &&
  (tree.protected === undefined || typeof tree.protected === "boolean");

const sameTree = (a: DerivedCacheRecord, b: DerivedCacheRecord) =>
  a.namespace === b.namespace &&
  a.version === b.version &&
  a.tree !== undefined &&
  b.tree !== undefined &&
  a.tree.identity === b.tree.identity;

/** A root may begin at any source level. All ancestors must be present in the
 * exact namespace, version and source/configuration identity, with no cycles.
 */
export const getDerivedCacheAncestors = (
  entries: readonly DerivedCacheMetadata[],
  record: DerivedCacheRecord
): readonly DerivedCacheMetadata[] | null => {
  if (!record.tree || !isDerivedCacheTreeValid(record.tree)) return null;
  const nodes = new Map<string, DerivedCacheMetadata>();
  for (const entry of entries.filter((entry) => sameTree(entry, record))) {
    if (
      !entry.tree ||
      !isDerivedCacheTreeValid(entry.tree) ||
      nodes.has(entry.tree.node)
    )
      return null;
    nodes.set(entry.tree.node, entry);
  }
  const ancestors: DerivedCacheMetadata[] = [];
  const visited = new Set([record.tree.node]);
  let current: DerivedCacheRecord = record;
  while (current.tree?.parent !== null) {
    const parentNode = current.tree?.parent;
    if (!parentNode || visited.has(parentNode)) return null;
    const parent = nodes.get(parentNode);
    if (!parent?.tree || parent.tree.level >= current.tree!.level) return null;
    visited.add(parentNode);
    ancestors.push(parent);
    current = parent;
  }
  return ancestors;
};

export const canAdmitDerivedCacheTree = (
  entries: readonly DerivedCacheMetadata[],
  candidate: DerivedCacheRecord
) => {
  const previous = entries.find(
    (entry) =>
      entry.namespace === candidate.namespace && entry.key === candidate.key
  );
  if (previous?.tree) {
    if (
      !candidate.tree ||
      !sameTree(previous, candidate) ||
      previous.tree.node !== candidate.tree.node ||
      previous.tree.parent !== candidate.tree.parent ||
      previous.tree.level !== candidate.tree.level
    )
      return false;
  }
  if (!candidate.tree) return true;
  if (
    entries.some(
      (entry) =>
        sameTree(entry, candidate) &&
        entry.tree?.node === candidate.tree!.node &&
        entry.key !== candidate.key
    )
  )
    return false;
  return getDerivedCacheAncestors(entries, candidate) !== null;
};

/** Deleting a parent, including for a newly learned unfavorable restore cost,
 * would orphan resident descendants. Explicit namespace invalidation is separate.
 */
export const canDeleteDerivedCacheRecord = (
  entries: readonly DerivedCacheMetadata[],
  record: DerivedCacheMetadata,
  candidate?: DerivedCacheRecord
) =>
  !record.tree ||
  (!record.tree.protected &&
    !entries.some(
      (entry) =>
        sameTree(entry, record) && entry.tree?.parent === record.tree!.node
    ) &&
    !(
      candidate &&
      sameTree(candidate, record) &&
      candidate.tree?.parent === record.tree.node
    ));

const workPerByte = (record: DerivedCacheMetadata) =>
  record.recomputeMs === undefined || record.restoreMs === undefined
    ? 0
    : Math.max(0, record.recomputeMs - record.restoreMs) / record.bytes;

/** Recompute eligible leaves after every removal. Deeper cached data gives way
 * first; actual display use breaks ties before measured saved work per byte.
 * Flat caches preserve their existing measured-work comparison.
 */
export const selectDerivedCacheVictim = (
  entries: readonly DerivedCacheMetadata[],
  compareFlat: (a: DerivedCacheMetadata, b: DerivedCacheMetadata) => number,
  candidate?: DerivedCacheRecord
) =>
  entries
    .filter((entry) => canDeleteDerivedCacheRecord(entries, entry, candidate))
    .sort((a, b) => {
      if (!a.tree && !b.tree) return compareFlat(a, b);
      if (!a.tree || !b.tree)
        return Number(b.tree !== undefined) - Number(a.tree !== undefined);
      return (
        b.tree.level - a.tree.level ||
        (a.hits ?? 0) - (b.hits ?? 0) ||
        a.lastAccess - b.lastAccess ||
        workPerByte(a) - workPerByte(b) ||
        a.key.localeCompare(b.key)
      );
    })[0] ?? null;

export const matchesDerivedCacheTreeRead = (
  entries: readonly DerivedCacheMetadata[],
  record: DerivedCacheMetadata,
  expected?: DerivedCacheTreeRead
) =>
  (!expected ||
    (record.tree?.identity === expected.identity &&
      record.tree.node === expected.node)) &&
  (!record.tree || getDerivedCacheAncestors(entries, record) !== null);

/** Resolve the entire protection update before mutating metadata, so partial
 * caches never replace a previously confirmed baseline.
 */
export const planDerivedCacheTreeProtection = (
  entries: readonly DerivedCacheMetadata[],
  namespace: string,
  version: string,
  identity: string,
  nodes: readonly string[],
  replace: boolean
): readonly DerivedCacheMetadata[] | null => {
  if (!identity || nodes.length === 0 || nodes.some((node) => !node))
    return null;
  const group = entries.filter(
    (entry) =>
      entry.namespace === namespace &&
      entry.version === version &&
      entry.tree?.identity === identity
  );
  const protectedNodes = new Set<string>();
  for (const node of nodes) {
    const record = group.find((entry) => entry.tree?.node === node);
    if (!record) return null;
    const ancestors = getDerivedCacheAncestors(group, record);
    if (!ancestors) return null;
    protectedNodes.add(node);
    for (const ancestor of ancestors) protectedNodes.add(ancestor.tree!.node);
  }
  return group.map((entry) => ({
    ...entry,
    tree: {
      ...entry.tree!,
      protected:
        protectedNodes.has(entry.tree!.node) ||
        (!replace && entry.tree!.protected === true),
    },
  }));
};
