import {
  getAddonKind,
  resolveAddonEntries,
  type AddonEntry,
  type ResolvedAddon,
} from "./registry";
import { VEHICLE_ANIMATION_LAYER_ID } from "../addons/VehicleAnimation/vehicle-layer-row";
import {
  FLOW_FIELD_LAYER_ID,
  getFlowFieldRowSeed,
} from "../addons/FlowField/flowfield-layer-row";

/** where a flow field launched from a handed-over row keeps its state */
const LAUNCHED_FLOW_FIELD_STORAGE_KEY = "carma::flowFieldState::launched";

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
 * `includeEngineRow` reads it anyway, for a host that never writes the row, e.g.
 * a display that only renders the stacks a remote hands it: there the row is
 * the only thing that says the service is on. Such a host also launches the
 * flow field from its row (`__flowField__`), which carries its scenario the
 * same way; nothing else launches a flow field.
 *
 * `permanent`: the layer is the face of the service. A host shows the engine's
 * controls on the layer's own button rather than in a row of their own, so no
 * second ✕ can switch the fleet off under a layer that stays on the map, and
 * the engine claims the channel back when a workflow card borrowed it.
 */
export const getLayerLaunchedAddons = (
  layers: readonly LaunchingLayer[],
  { includeEngineRow = false }: { includeEngineRow?: boolean } = {}
): LayerLaunchedAddon[] => {
  let vehicle: LayerLaunchedAddon | undefined;
  let flowField: LayerLaunchedAddon | undefined;
  for (const layer of layers) {
    if (layer.id === FLOW_FIELD_LAYER_ID) {
      const seed = includeEngineRow ? getFlowFieldRowSeed(layer) : undefined;
      if (seed) {
        flowField = {
          layerId: layer.id,
          visible: layer.visible !== false,
          entry: {
            addon: "flowField",
            config: {
              ...seed,
              startEnabled: true,
              // the stack is what brings it back, so the visitor's own launch
              // on another route of this origin must not be overwritten
              storageKey: LAUNCHED_FLOW_FIELD_STORAGE_KEY,
            },
          },
        };
      }
      continue;
    }
    if (
      (layer.id === VEHICLE_ANIMATION_LAYER_ID && !includeEngineRow) ||
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
  return [vehicle, flowField].filter(
    (launched): launched is LayerLaunchedAddon => launched !== undefined
  );
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
