import type { Map as MaplibreMap } from "maplibre-gl";

import type { ToolEntry } from "@carma-mapping/layers";

/**
 * Switches a layer on the way a city lights up: a wavefront runs through the
 * features in a firing order, striking each one as it passes.
 *
 * Declared on the layer as a tool ("switchOn"), not on the route, and there is
 * nothing to mount and no button to press: the host runs it when the layer's
 * style layers appear on the map. Projection mapping has no UI to click, so an
 * addon that needs a trigger would never run there.
 *
 * The animation is one `setPaintProperty` per target per frame. No data is
 * uploaded while it runs, and it ends by writing the resting value back as a
 * plain number, so a finished run leaves the layer as it found it.
 */
export type SwitchOnTarget = {
  /**
   * The style layer to animate, named as the style names it. The host prefixes
   * style layer ids with the stack entry they came from, so the name is
   * matched against the tail of the ids on the map.
   */
  layer: string;
  /** the paint property carrying the fade, e.g. "fill-opacity" */
  property: string;
  /** what the property returns to once the wavefront has passed */
  resting: number;
  /** ms after the run starts before this target begins; see `stagger` */
  delay?: number;
  /** ms this target takes; defaults to the config's `duration` */
  duration?: number;
};

export type SwitchOnFlicker = {
  /**
   * How often a feature blinks while it strikes. The blinks are not evenly
   * bright: the share of time the feature is lit grows from nothing to full
   * across its window, which is what makes it read as a lamp warming up rather
   * than as a stutter.
   */
  blinks?: number;
  /** what the feature drops to between blinks, as a share of `resting` */
  floor?: number;
};

export type SwitchOnConfig = {
  /**
   * Feature property holding the firing order as a number between 0 and 1.
   * Baked into the tiles, so the same lamp's rings share one value and light
   * together. Ignored when `hashProperty` is set.
   */
  orderProperty?: string;
  /**
   * Feature property to derive the order from when the tiles carry no order
   * column. Any numeric-ish property will do: its value is hashed into a stable
   * slot between 0 and 1, so every feature sharing the value fires together and
   * the groups themselves come up in a scattered order. Pointed at a street key
   * this switches the city on street by street.
   */
  hashProperty?: string;
  /**
   * Quantise the order into this many blocks, so features switch on in groups
   * instead of one after another. 0 (the default) leaves the order untouched.
   */
  groups?: number;
  /** how long a target takes, in ms */
  duration?: number;
  /**
   * Width of the wavefront in order units: how much of the range is striking at
   * any moment, and therefore how long one feature takes to come up.
   */
  fade?: number;
  /**
   * Whether the targets run at the same time ("together", the default: a lamp's
   * core and its glow come up as one light) or one after another ("sequential",
   * each target waiting out the one before it).
   */
  stagger?: "together" | "sequential";
  /** flicker while a feature strikes; `false` for a clean fade */
  flicker?: SwitchOnFlicker | false;
  /**
   * How often a second the paint is rewritten. Every write makes MapLibre
   * re-evaluate the expression for every feature of the layer and re-upload its
   * paint buffer, so writing on every frame buries the map in work it cannot
   * finish and the animation falls behind its own clock. The wavefront is
   * driven by the wall clock either way, so a lower rate makes it coarser, not
   * slower.
   */
  fps?: number;
  targets: SwitchOnTarget[];
};

export const SWITCH_ON_KIND = "switchOn";

const DEFAULT_ORDER_PROPERTY = "zuendfolge";
const DEFAULT_DURATION = 8000;
const DEFAULT_FADE = 0.06;
const DEFAULT_BLINKS = 4;
const DEFAULT_FPS = 20;
const DEFAULT_FLICKER_FLOOR = 0;

/**
 * Golden ratio, the multiplier of the classic multiplicative hash: successive
 * inputs land far apart in the unit interval instead of clustering, so streets
 * that follow each other in the data do not come up next to each other.
 */
const GOLDEN_RATIO = 0.618033988749895;

/** what an entry carries its tools in; a layer, a group, a catalog item */
type ToolCarrier = { tools?: ToolEntry[] };

const toolKind = (tool: ToolEntry): string =>
  typeof tool === "string" ? tool : "kind" in tool ? tool.kind : tool.addon;

/** the config of the entry's `switchOn` tool, or undefined when it has none */
export const switchOnConfig = (
  entry: ToolCarrier | null | undefined
): SwitchOnConfig | undefined => {
  const tool = entry?.tools?.find((entry) => toolKind(entry) === SWITCH_ON_KIND);
  if (!tool || typeof tool === "string") {
    return undefined;
  }
  const config = tool.config as SwitchOnConfig | undefined;
  return config?.targets?.length ? config : undefined;
};

/**
 * The ids on the map for a style layer name. `styleBuilder` renames every layer
 * of an additional style to `<stack entry>-<style layer>`, so the configured
 * name is the tail of the id rather than the id itself. An exact hit is kept as
 * well, for a layer that reached the map unprefixed.
 */
export const resolveStyleLayerIds = (
  map: MaplibreMap,
  name: string
): string[] =>
  (map.getStyle()?.layers ?? [])
    .map((layer) => layer.id)
    .filter((id) => id === name || id.endsWith(`-${name}`));

/**
 * Where a feature sits in the firing order, as an expression.
 *
 * From the order column when there is one. From a hash of another property when
 * there is not: `["get", "schl"] * φ mod 1` spreads street keys over the unit
 * interval, every lamp of a street landing on the same slot. The `to-number`
 * fallback keeps a feature without the property from making the whole
 * expression an error, which would take the layer's paint down with it.
 */
const orderExpression = (config: SwitchOnConfig): unknown => {
  const base = config.hashProperty
    ? [
        "%",
        ["*", ["to-number", ["get", config.hashProperty], 0], GOLDEN_RATIO],
        1,
      ]
    : [
        "number",
        ["get", config.orderProperty ?? DEFAULT_ORDER_PROPERTY],
        1,
      ];
  const groups = config.groups ?? 0;
  return groups > 0 ? ["/", ["floor", ["*", base, groups]], groups] : base;
};

/**
 * The paint value at wavefront position `t`.
 *
 * `u` is how far this feature is through its own strike: 0 before the front
 * reaches it, 1 once it has passed. Without flicker that is the brightness
 * outright. With it, the feature blinks while `u` climbs and the share of each
 * blink it spends lit is `u` itself, so it starts as a flash in the dark and
 * ends steady. The blink phase is offset by the feature's own place in the
 * order, so neighbours do not blink in lockstep; features quantised into the
 * same group share the offset and strike as one.
 */
const paintExpression = (
  t: number,
  target: SwitchOnTarget,
  config: SwitchOnConfig
): unknown => {
  const fade = config.fade ?? DEFAULT_FADE;
  const flicker = config.flicker === false ? undefined : config.flicker ?? {};
  const blinks = flicker?.blinks ?? DEFAULT_BLINKS;
  const floor = flicker?.floor ?? DEFAULT_FLICKER_FLOOR;

  const ramp: unknown = ["var", "u"];
  const striking: unknown = flicker
    ? [
        "case",
        [
          "<",
          [
            "%",
            ["+", ["*", ["var", "u"], blinks], ["*", ["var", "z"], 7.3]],
            1,
          ],
          ["var", "u"],
        ],
        1,
        floor,
      ]
    : ramp;

  return [
    "let",
    "z",
    orderExpression(config),
    [
      "let",
      "u",
      ["max", 0, ["min", 1, ["/", ["-", t, ["var", "z"]], fade]]],
      [
        "*",
        target.resting,
        [
          "case",
          [">=", ["var", "u"], 1],
          1,
          ["<=", ["var", "u"], 0],
          0,
          striking,
        ],
      ],
    ],
  ];
};

/** what one target needs while the run is on */
type PlannedTarget = {
  target: SwitchOnTarget;
  ids: string[];
  delay: number;
  duration: number;
};

/**
 * Whether the features carry the property the order is read from. Sampled from
 * what the source has loaded, and only to say so in the console: a tileset
 * without the column animates as one block, which looks like a broken addon
 * rather than like missing data.
 */
const reportMissingOrder = (
  map: MaplibreMap,
  layerId: string,
  property: string
): void => {
  const layer = map.getLayer(layerId) as
    | { source?: string; sourceLayer?: string }
    | undefined;
  if (!layer?.source) {
    return;
  }
  const features = map.querySourceFeatures(
    layer.source,
    layer.sourceLayer ? { sourceLayer: layer.sourceLayer } : {}
  );
  if (features.length === 0) {
    return;
  }
  if (features.some((feature) => feature.properties?.[property] != null)) {
    return;
  }
  console.warn(
    `[switchOn] "${property}" is not in the tiles of ${layerId}; every feature ` +
      `shares one place in the order and the layer will come up as one block. ` +
      `Bake the column, or set "hashProperty" to a property the tiles do carry.`
  );
};

/**
 * Run the switch-on once over the map's current style. Returns a cancel
 * function; calling it stops the animation and leaves every target at its
 * resting value, which is also where the run ends on its own.
 *
 * The resting value goes back as a plain number rather than as an expression
 * that happens to evaluate to it: a data-driven paint property keeps per-feature
 * paint buffers and is re-evaluated on every tile load, where a constant is a
 * single uniform. Parking the animation should cost nothing.
 */
export const runSwitchOn = (
  map: MaplibreMap,
  config: SwitchOnConfig,
  /** called once the run has settled, whether it finished or was cancelled */
  onEnd?: () => void
): (() => void) => {
  const duration = config.duration ?? DEFAULT_DURATION;
  const sequential = config.stagger === "sequential";

  const plan: PlannedTarget[] = config.targets
    .map((target, index) => ({
      target,
      ids: resolveStyleLayerIds(map, target.layer),
      delay: target.delay ?? (sequential ? index * duration : 0),
      duration: target.duration ?? duration,
    }))
    .filter(({ ids }) => ids.length > 0);

  if (plan.length === 0) {
    onEnd?.();
    return () => undefined;
  }

  if (!config.hashProperty) {
    reportMissingOrder(
      map,
      plan[0].ids[0],
      config.orderProperty ?? DEFAULT_ORDER_PROPERTY
    );
  }

  const total = Math.max(...plan.map(({ delay, duration }) => delay + duration));
  const fade = config.fade ?? DEFAULT_FADE;

  let frame: number | null = null;
  let startedAt: number | null = null;
  let stopped = false;
  let lastPaintedAt = -Infinity;
  const minFrameMs = 1000 / Math.max(config.fps ?? DEFAULT_FPS, 1);

  const write = (ids: string[], property: string, value: unknown): void => {
    for (const id of ids) {
      if (map.getLayer(id)) {
        map.setPaintProperty(id, property, value as never);
      }
    }
  };

  const paint = (elapsed: number): void => {
    for (const entry of plan) {
      const progress = Math.min(
        Math.max((elapsed - entry.delay) / entry.duration, 0),
        1
      );
      // the front travels one fade width past the end, so the last feature
      // also gets its full strike instead of being cut off
      write(
        entry.ids,
        entry.target.property,
        paintExpression(progress * (1 + fade), entry.target, config)
      );
    }
  };

  const settle = (): void => {
    for (const entry of plan) {
      write(entry.ids, entry.target.property, entry.target.resting);
    }
  };

  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    settle();
    onEnd?.();
  };

  const tick = (timestamp: number): void => {
    frame = null;
    if (stopped) {
      return;
    }
    startedAt ??= timestamp;
    const elapsed = timestamp - startedAt;
    if (elapsed >= total) {
      stop();
      return;
    }
    if (elapsed - lastPaintedAt >= minFrameMs) {
      lastPaintedAt = elapsed;
      paint(elapsed);
    }
    frame = requestAnimationFrame(tick);
  };

  if (total <= 0) {
    settle();
    stopped = true;
    onEnd?.();
    return () => undefined;
  }

  // dark before the first frame, otherwise the layer shows at full brightness
  // for the one frame between attaching and the first tick
  paint(0);
  frame = requestAnimationFrame(tick);

  return stop;
};
