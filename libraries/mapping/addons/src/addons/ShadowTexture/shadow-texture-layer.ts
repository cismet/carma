import type { Layer } from "@carma-mapping/layers";

import {
  applyAddonOverrides,
  type AddonOverridesState,
} from "../../lib/addon-overrides";
import {
  resolveAddonEntries,
  type AddonEntry,
  type ResolvedAddon,
} from "../../lib/registry";

export const SHADOW_TEXTURE_LAYER_ID = "__shadow_texture__";

type ShadowTextureAddon = Extract<ResolvedAddon, { kind: "shadowTexture" }>;

export const resolveShadowTextureAddon = (
  routeAddons: readonly AddonEntry[] | undefined,
  overrides: AddonOverridesState | undefined
): ShadowTextureAddon | null =>
  applyAddonOverrides(resolveAddonEntries(routeAddons), overrides).find(
    (entry): entry is ShadowTextureAddon => entry.kind === "shadowTexture"
  ) ?? null;

export const createShadowTextureLayer = (
  addon: ShadowTextureAddon | null,
  visible: boolean
): Layer | null =>
  addon
    ? {
        id: SHADOW_TEXTURE_LAYER_ID,
        title: "Schatten",
        description: "Aus GLB-Modellen berechnete Schatten auf der 2D-Karte.",
        type: "object",
        icon: "shadow-simulation",
        iconColor: "#d97706",
        visible,
        pinned: "last",
        tools: [addon],
      }
    : null;
