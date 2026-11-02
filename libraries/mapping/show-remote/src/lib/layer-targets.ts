import type { MappingConfig, MappingConfigLayer } from "@carma-api";

import { SHARED_TARGET, isTargetTag, type KnownTarget } from "./relay-document";
import { isMappingConfig, type LayerTargets } from "./show";
import { mergeLayerOrder } from "./transition";

/**
 * Which displays a layer goes to. pm-show marks a layer of a scene, or a base
 * layer of a story, with the target tags of the displays it goes to; a layer
 * without a mark goes to every display. pm-remote resolves the marks when it
 * writes (`withTargetSections`), so displays never see them.
 */

/** how pm-show names each known target */
export const TARGET_LABELS: Record<KnownTarget, string> = {
  outlet: "Projektion",
  geoportal: "Geoportal",
};

type Section = Record<string, unknown>;

const isSection = (value: unknown): value is Section =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The marks that mean something: lists of valid tags. A list without one is
 * no mark, so the layer goes to every display.
 */
export const layerTargetsOf = (value: unknown): LayerTargets => {
  if (!isSection(value)) {
    return {};
  }
  const marks: LayerTargets = {};
  for (const [layerId, tags] of Object.entries(value)) {
    const valid = Array.isArray(tags)
      ? [...new Set(tags.filter(isTargetTag))]
      : [];
    if (valid.length > 0) {
      marks[layerId] = valid;
    }
  }
  return marks;
};

/**
 * `marks` with the layer going to `targets`; `null` takes the mark away.
 * `undefined` when no mark is left, so a scene without any goes without the
 * field.
 */
export const withLayerTarget = (
  marks: LayerTargets | undefined,
  layerId: string,
  targets: readonly string[] | null
): LayerTargets | undefined => {
  const next = layerTargetsOf({
    ...marks,
    [layerId]: targets ?? [],
  });
  return Object.keys(next).length > 0 ? next : undefined;
};

/** the marks of the layers among `layers`, `undefined` when none is left */
export const layerTargetsFor = (
  marks: LayerTargets | undefined,
  layers: readonly MappingConfigLayer[]
): LayerTargets | undefined => {
  const ids = new Set(layers.map(({ id }) => id));
  const kept = Object.entries(layerTargetsOf(marks)).filter(([id]) =>
    ids.has(id)
  );
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
};

/** the one target a layer goes to, `null` while it goes to every display */
export const layerTargetChoice = (
  marks: LayerTargets | undefined,
  layerId: string
): string | null => layerTargetsOf(marks)[layerId]?.[0] ?? null;

/** the layers a display with `tag` gets; `null` is every display: only the unmarked ones */
const configFor = (
  config: MappingConfig,
  marks: LayerTargets,
  tag: string | null
): MappingConfig => ({
  ...config,
  layers: config.layers.filter(({ id }) => {
    const targets = marks[id];
    return !targets || (tag !== null && targets.includes(tag));
  }),
});

/**
 * The presenter's document for `state`: `"*"` with the layers every display
 * gets, and for each tag a mark names, a section whose `config` is all that
 * display gets (a target's config replaces the shared one, see
 * `resolveTargets`). Without a config, or without marks on its layers, just
 * `"*"`.
 */
export const withTargetSections = (
  state: Section,
  marks: LayerTargets
): Section => {
  const config = state["config"];
  if (!isMappingConfig(config)) {
    return { [SHARED_TARGET]: state };
  }
  const known = layerTargetsOf(marks);
  const present = new Set(config.layers.map(({ id }) => id));
  const tags = [
    ...new Set(
      Object.entries(known)
        .filter(([id]) => present.has(id))
        .flatMap(([, targets]) => targets)
    ),
  ];
  if (tags.length === 0) {
    return { [SHARED_TARGET]: state };
  }
  const doc: Section = {
    [SHARED_TARGET]: { ...state, config: configFor(config, known, null) },
  };
  for (const tag of tags) {
    doc[tag] = { config: configFor(config, known, tag) };
  }
  return doc;
};

/**
 * Every layer a presenter sent, from all sections of its document together,
 * so a phone that watches or takes over knows them all. Each display's own
 * order is kept; where two displays' layers never meet, their order is a
 * guess. `null` without any configuration.
 */
export const presenterConfigOf = (doc: unknown): MappingConfig | null => {
  if (!isSection(doc)) {
    return null;
  }
  if (!Object.hasOwn(doc, SHARED_TARGET)) {
    const config = doc["config"];
    return isMappingConfig(config) ? config : null;
  }
  const configs = [
    doc[SHARED_TARGET],
    ...Object.entries(doc)
      .filter(([key]) => isTargetTag(key))
      .map(([, section]) => section),
  ]
    .map((section) => (isSection(section) ? section["config"] : undefined))
    .filter(isMappingConfig);
  const [first, ...rest] = configs;
  if (!first) {
    return null;
  }
  let layers = first.layers;
  for (const more of rest) {
    const byId = new Map(
      [...more.layers, ...layers].map((layer) => [layer.id, layer])
    );
    layers = mergeLayerOrder(more.layers, layers).flatMap((id) => {
      const layer = byId.get(id);
      return layer ? [layer] : [];
    });
  }
  return { ...first, layers };
};

/**
 * The marks a presenter's document was written with (`withTargetSections`):
 * a layer only in the sections of some displays goes to those. A phone taking
 * the show over writes on with them, whatever scene it matches.
 */
export const presenterLayerTargetsOf = (doc: unknown): LayerTargets => {
  if (!isSection(doc) || !Object.hasOwn(doc, SHARED_TARGET)) {
    return {};
  }
  const layerIdsOf = (section: unknown): string[] => {
    const config = isSection(section) ? section["config"] : undefined;
    return isMappingConfig(config) ? config.layers.map(({ id }) => id) : [];
  };
  const shared = new Set(layerIdsOf(doc[SHARED_TARGET]));
  const marks: LayerTargets = {};
  for (const [tag, section] of Object.entries(doc)) {
    if (!isTargetTag(tag)) {
      continue;
    }
    for (const id of layerIdsOf(section)) {
      if (!shared.has(id)) {
        marks[id] = [...(marks[id] ?? []), tag];
      }
    }
  }
  return marks;
};
