import type { MappingConfig, MappingConfigLayer } from "@carma-api";

/**
 * Planning a scene change as a sequence of whole configurations, for a display
 * that only ever applies what it is sent (the outlet).
 *
 * A layer fades only if it exists when its opacity changes: one that is added
 * appears at once at whatever opacity it comes with. So a crossfade is three
 * writes. First every layer of both scenes is on the display, the new ones
 * transparent; then all of them move to their target opacity together, the
 * old ones to zero; then the display gets the new scene exactly and drops the
 * old layers, which by then are invisible.
 *
 * The first hold has to cover the display picking the write up and building
 * the new layers, which for a style url includes fetching the style. If it is
 * too short the new layers pop in instead of fading; nothing else goes wrong.
 */

export type TransitionStep = {
  config: MappingConfig;
  /** how long to wait after writing this step before writing the next */
  holdMs: number;
};

export type SceneChangeOptions = {
  /** how long the opacities take to move; 0 cuts */
  fadeMs: number;
  /** how long the display gets to build layers before they start fading in */
  prepareMs: number;
};

export const DEFAULT_PREPARE_MS = 1200;

const withTransition = (
  layer: MappingConfigLayer,
  transitionMs: number
): MappingConfigLayer => ({ ...layer, opacityTransition: transitionMs });

/**
 * The layer order while both scenes are on the display: the new scene's order,
 * with each old layer placed right above the layer it was above before. The
 * last write then only removes layers and never reorders visible ones.
 */
export const mergeLayerOrder = (
  from: readonly MappingConfigLayer[],
  to: readonly MappingConfigLayer[]
): string[] => {
  const order = to.map((layer) => layer.id);
  const placed = new Set(order);
  let anchor: string | undefined;
  for (const layer of from) {
    if (!placed.has(layer.id)) {
      const at = anchor === undefined ? 0 : order.indexOf(anchor) + 1;
      order.splice(at, 0, layer.id);
      placed.add(layer.id);
    }
    anchor = layer.id;
  }
  return order;
};

export const planSceneChange = (
  from: MappingConfig | null,
  to: MappingConfig,
  { fadeMs, prepareMs }: SceneChangeOptions
): TransitionStep[] => {
  if (!from || fadeMs <= 0) {
    return [
      {
        config: {
          ...to,
          layers: to.layers.map((layer) => withTransition(layer, 0)),
        },
        holdMs: 0,
      },
    ];
  }

  const fromById = new Map(from.layers.map((layer) => [layer.id, layer]));
  const toById = new Map(to.layers.map((layer) => [layer.id, layer]));
  const union = mergeLayerOrder(from.layers, to.layers);

  const prepared: MappingConfigLayer[] = [];
  const fading: MappingConfigLayer[] = [];
  for (const id of union) {
    const current = fromById.get(id);
    const target = toById.get(id);
    if (current) {
      prepared.push(withTransition(current, 0));
    } else if (target) {
      prepared.push({ ...withTransition(target, 0), opacity: 0 });
    }
    if (target) {
      fading.push(withTransition(target, fadeMs));
    } else if (current) {
      fading.push({ ...withTransition(current, fadeMs), opacity: 0 });
    }
  }

  const steps: TransitionStep[] = [];
  const isEntering = to.layers.some((layer) => !fromById.has(layer.id));
  if (isEntering) {
    // the base map stays until the fade starts
    steps.push({ config: { ...from, layers: prepared }, holdMs: prepareMs });
  }
  steps.push({ config: { ...to, layers: fading }, holdMs: fadeMs });
  steps.push({
    config: {
      ...to,
      layers: to.layers.map((layer) => withTransition(layer, fadeMs)),
    },
    holdMs: 0,
  });
  return steps;
};
