import type { LayerStackEntry } from "@carma-mapping/layers";

import {
  resolveAddonEntries,
  resolveAddonTrigger,
  type AddonEntry,
  type AddonKind,
  type ResolvedAddon,
} from "./registry";

/**
 * Id of an addon's trigger, used as the app's `activeInteractionButtonID`. The
 * prefix keeps it distinct from an app's own interaction button ids.
 */
export const toAddonButtonId = (kind: AddonKind): string => `addon_${kind}`;

/** The entries of `target` that have an applicable trigger. */
export const getTargetAddonsWithTrigger = (
  target?: LayerStackEntry | null
): ResolvedAddon[] =>
  resolveAddonEntries(
    (target as { tools?: AddonEntry[] } | null | undefined)?.tools
  ).filter((entry) => Boolean(resolveAddonTrigger(entry, target ?? null)));

export const hasTargetAddonsWithTrigger = (
  target?: LayerStackEntry | null
): boolean => getTargetAddonsWithTrigger(target).length > 0;

/** The addon of `target` whose trigger is currently active, if any. */
export const resolveActiveTargetAddon = (
  target?: LayerStackEntry | null,
  activeButtonId?: string | null
): ResolvedAddon | undefined =>
  activeButtonId
    ? getTargetAddonsWithTrigger(target).find(
        (entry) => toAddonButtonId(entry.kind) === activeButtonId
      )
    : undefined;
