import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { useMapHighlight } from "@carma-mapping/contexts";
import type { ToggledFeature } from "@carma-mapping/contexts";

/** `"<source>::<sourceLayer>"` -> the other source layers of its catalog layer */
type SiblingIndex = Map<string, string[]>;

const siblingKey = (source: string, sourceLayer: string) =>
  `${source}::${sourceLayer}`;

/**
 * Source layers grouped by the catalog layer that draws them, read from
 * `metadata["layer-id"]` (stamped by `styleComposer`). Catalog layers with a
 * single source layer are skipped.
 */
const buildSiblingIndex = (
  map: MaplibreMap,
  excluded: string[]
): SiblingIndex => {
  const groups = new Map<string, { source: string; sourceLayers: Set<string> }>(
    []
  );

  for (const layer of map.getStyle()?.layers ?? []) {
    const metadata = layer.metadata as Record<string, unknown> | undefined;
    const catalogId = metadata?.["layer-id"];
    const source = "source" in layer ? layer.source : undefined;
    const sourceLayer =
      "source-layer" in layer ? layer["source-layer"] : undefined;
    if (
      typeof catalogId !== "string" ||
      typeof source !== "string" ||
      typeof sourceLayer !== "string" ||
      !sourceLayer
    ) {
      continue;
    }
    const lowered = catalogId.toLowerCase();
    if (excluded.some((pattern) => lowered.includes(pattern))) continue;

    const key = `${source}::${catalogId}`;
    let group = groups.get(key);
    if (!group) {
      group = { source, sourceLayers: new Set() };
      groups.set(key, group);
    }
    group.sourceLayers.add(sourceLayer);
  }

  const index: SiblingIndex = new Map();
  for (const { source, sourceLayers } of groups.values()) {
    if (sourceLayers.size < 2) continue;
    for (const sourceLayer of sourceLayers) {
      index.set(
        siblingKey(source, sourceLayer),
        [...sourceLayers].filter((other) => other !== sourceLayer)
      );
    }
  }

  return index;
};

/**
 * Highlights all geometries of one object together.
 *
 * Feature-state is stored per `source + sourceLayer + id`, so highlighting the
 * shape of a feature leaves its icon dimmed. Each change in `toggledFeatures`
 * is mirrored onto the same id in the sibling source layers;
 * `useMapHighlighting` applies the state from there, later tiles included.
 *
 * The delta is mirrored, not the whole set, so removing one geometry removes
 * its siblings instead of being restored by them. Siblings are assumed to share
 * the feature id; `excludeCombinedLayers` covers layers where that fails.
 */
export const useCombinedGeometryHighlight = (
  map: MaplibreMap | null,
  enabled: boolean,
  excluded: string[]
) => {
  const { criteria, ensureToggledFeatures, highlightVersion } =
    useMapHighlight();
  const indexRef = useRef<SiblingIndex>(new Map());
  const seenRef = useRef(new Map<string, ToggledFeature>());

  useEffect(() => {
    if (!map || !enabled) {
      indexRef.current = new Map();
      return;
    }
    const rebuild = () => {
      indexRef.current = buildSiblingIndex(map, excluded);
    };
    rebuild();
    map.on("styledata", rebuild);
    return () => {
      map.off("styledata", rebuild);
    };
  }, [map, enabled, excluded]);

  useEffect(() => {
    if (!enabled) return;
    // the provider mutates this map in place, so the snapshot must be a copy
    const current = criteria.toggledFeatures;
    const seen = seenRef.current;

    const siblingsOf = (feature: ToggledFeature): ToggledFeature[] =>
      (
        indexRef.current.get(siblingKey(feature.source, feature.sourceLayer)) ??
        []
      ).map((sourceLayer) => ({ ...feature, sourceLayer }));
    const added: ToggledFeature[] = [];
    const removed: ToggledFeature[] = [];
    for (const [key, feature] of current) {
      if (!seen.has(key)) added.push(...siblingsOf(feature));
    }
    for (const [key, feature] of seen) {
      if (!current.has(key)) removed.push(...siblingsOf(feature));
    }

    if (added.length > 0) ensureToggledFeatures(added, true);
    if (removed.length > 0) ensureToggledFeatures(removed, false);
    // after the writes: the bump they cause then finds no delta
    seenRef.current = new Map(current);
    // the version is the signal; `criteria` is mutated in place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightVersion, enabled, ensureToggledFeatures]);
};
