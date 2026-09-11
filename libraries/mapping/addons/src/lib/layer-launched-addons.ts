import {
  getAddonKind,
  resolveAddonEntries,
  type AddonEntry,
  type ResolvedAddon,
} from "./registry";
import { VEHICLE_ANIMATION_LAYER_ID } from "../addons/VehicleAnimation/vehicle-layer-row";

/** the part of a layer stack entry this reads */
type LaunchingLayer = { id: string; visible?: boolean; tools?: unknown };

type VehicleAnimationEntry = Extract<
  ResolvedAddon,
  { kind: "vehicleAnimation" }
>;

const isVehicleAnimationEntry = (
  entry: ResolvedAddon
): entry is VehicleAnimationEntry => entry.kind === "vehicleAnimation";

/** An engine a layer in the stack launches, and the layer that launches it. */
export type LayerLaunchedAddon = {
  layerId: string;
  /** the layer's own eye; a hidden layer keeps its engine, which hides with it */
  visible: boolean;
  entry: AddonEntry;
};

/**
 * The engines the layer stack launches. A layer whose tools carry a complete
 * `vehicleAnimation` config, typically a style that declares it in its
 * `metadata.carmaConf.tools`, puts that service on the map for as long as the
 * layer is in the stack, on any route, without the route knowing about it.
 *
 * The engine holds one animation at a time, so the topmost such layer wins.
 * The engine's own row is skipped: it carries the running service in its tools
 * to survive a reload, and reading it back here would make it its own launcher.
 *
 * `permanent`: the layer is the face of the service. A host shows the engine's
 * controls on the layer's own button rather than in a row of their own, so no
 * second ✕ can switch the fleet off under a layer that stays on the map, and
 * the engine claims the channel back when a workflow card borrowed it.
 */
export const getLayerLaunchedAddons = (
  layers: readonly LaunchingLayer[]
): LayerLaunchedAddon[] => {
  let vehicle: LayerLaunchedAddon | undefined;
  for (const layer of layers) {
    if (
      layer.id === VEHICLE_ANIMATION_LAYER_ID ||
      !Array.isArray(layer.tools)
    ) {
      continue;
    }
    const tool = resolveAddonEntries(layer.tools as AddonEntry[]).find(
      isVehicleAnimationEntry
    );
    if (!tool?.config?.trackUrl) {
      continue;
    }
    vehicle = {
      layerId: layer.id,
      visible: layer.visible !== false,
      entry: {
        addon: "vehicleAnimation",
        config: { ...tool.config, startEnabled: true, permanent: true },
      },
    };
  }
  return vehicle ? [vehicle] : [];
};

/**
 * The route's addon list with the layer-launched engines in it. A launched
 * engine replaces the route's entry of the same kind, the precedence a route
 * already has over the app's defaults: the layer is the more specific
 * declaration. The engine then starts from its config at mount and its
 * teardown takes the service off again once the layer leaves the stack.
 */
export const withLayerLaunchedAddons = (
  addons: AddonEntry[] | undefined,
  launched: readonly AddonEntry[]
): AddonEntry[] | undefined => {
  if (!launched.length) {
    return addons;
  }
  const kinds = new Set(launched.map(getAddonKind));
  return [
    ...(addons ?? []).filter((addon) => !kinds.has(getAddonKind(addon))),
    ...launched,
  ];
};
