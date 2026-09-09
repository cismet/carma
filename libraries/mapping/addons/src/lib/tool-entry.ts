/**
 * The addon a tool entry names. `ToolEntry` (carma-layers.d.ts) accepts three
 * spellings, a bare kind and an object naming its addon with either `kind` or
 * `addon`, and configs are written in all of them. `getAddonKind` resolves the
 * same three for the registry's own entries; this one takes an `unknown`,
 * because a layer's `tools` reach us from persisted state and from vector
 * styles, where nothing has checked the shape yet.
 *
 * Dependency-free on purpose: the addon rows import it, and the registry
 * imports the rows.
 */
export const getToolEntryKind = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { kind, addon } = value as { kind?: unknown; addon?: unknown };
  if (typeof kind === "string") {
    return kind;
  }
  return typeof addon === "string" ? addon : undefined;
};
