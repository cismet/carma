import {
  applyAddonOverrides,
  resolveAddonEntries,
  type AddonEntry,
  type AddonOverridesState,
  type ResolvedAddon,
} from "@carma-mapping/addons";
import type { Layer } from "@carma-mapping/layers";

export const SHADOW_SIMULATION_LAYER_ID = "__shadow_simulation__";

type ShadowSimulationAddon = Extract<
  ResolvedAddon,
  { kind: "shadowSimulation" }
>;

export const resolveShadowSimulationAddon = (
  routeAddons: readonly AddonEntry[] | undefined,
  overrides: AddonOverridesState | undefined
): ShadowSimulationAddon | null =>
  applyAddonOverrides(resolveAddonEntries(routeAddons), overrides).find(
    (entry): entry is ShadowSimulationAddon =>
      entry.kind === "shadowSimulation"
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
