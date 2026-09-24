import {
  applyAddonOverrides,
  resolveAddonEntries,
  type AddonEntry,
  type AddonOverridesState,
  type ResolvedAddon,
} from "@carma-mapping/addons";
import type { Layer } from "@carma-mapping/layers";

export const SHADOW_SIMULATION_LAYER_ID = "__shadow_simulation__";
export const SHADOW_TEXTURE_LAYER_ID = "__shadow_texture__";

type ShadowSimulationAddon = Extract<
  ResolvedAddon,
  { kind: "shadowSimulation" }
>;
type ShadowTextureAddon = Extract<ResolvedAddon, { kind: "shadowTexture" }>;

export const resolveShadowSimulationAddon = (
  routeAddons: readonly AddonEntry[] | undefined,
  overrides: AddonOverridesState | undefined
): ShadowSimulationAddon | null =>
  applyAddonOverrides(resolveAddonEntries(routeAddons), overrides).find(
    (entry): entry is ShadowSimulationAddon => entry.kind === "shadowSimulation"
  ) ?? null;

export const resolveShadowTextureAddon = (
  routeAddons: readonly AddonEntry[] | undefined,
  overrides: AddonOverridesState | undefined
): ShadowTextureAddon | null =>
  applyAddonOverrides(resolveAddonEntries(routeAddons), overrides).find(
    (entry): entry is ShadowTextureAddon => entry.kind === "shadowTexture"
  ) ?? null;

export const createShadowSimulationLayer = (
  addon: ShadowSimulationAddon | null,
  visible: boolean
): Layer | null =>
  addon
    ? {
        id: SHADOW_SIMULATION_LAYER_ID,
        title: "Schatten",
        description:
          "Sonnenstand und Schattenwurf in der gemeinsamen Three.js-Szene.",
        type: "object",
        icon: "shadow-simulation",
        iconColor: "#d97706",
        visible,
        pinned: "last",
        tools: [addon],
      }
    : null;

export const createShadowTextureLayer = (
  addon: ShadowTextureAddon | null,
  visible: boolean
): Layer | null =>
  addon
    ? {
        id: SHADOW_TEXTURE_LAYER_ID,
        title: "Schatten-Textur",
        description: "Aus GLB-Modellen berechnete Schatten auf der 2D-Karte.",
        type: "object",
        icon: "shadow-simulation",
        iconColor: "#d97706",
        visible,
        pinned: "last",
        tools: [addon],
      }
    : null;
