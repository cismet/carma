import { useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  buildVectorStyleItem,
  loadVectorStyle,
  styleUrlTitle,
  type Layer,
} from "@carma-mapping/layers";
import { parseToMapLayer } from "@carma-mapping/utils";

import {
  DEFAULT_LAYERS,
  defaultLayerId,
  defaultLayers,
  type DefaultLayer,
} from "../constants/default-layers";
import { layerCatalogConfig } from "../constants/discover";
import {
  appendLayer,
  changeVisibility,
  getHiddenPermanentLayers,
  getLayerStack,
} from "../store/slices/mapping";
import type { AppDispatch } from "../store";

/**
 * Puts the default layers in the stack, once per boot.
 *
 * The style is fetched for its `metadata.carmaConf` and then run through the
 * same two steps a drop onto the map uses, so a configured default and a
 * dropped style end up as the same row, under the same id.
 *
 * `permanent` is what makes the row the app's: the layer bar gives it no
 * button, no path removes it, `setLayers` keeps it when a shared configuration
 * or the map api replaces the stack, and the persisted stack drops it so every
 * boot builds it from this config rather than from an older reading of it.
 */
export const useDefaultLayers = (
  routePath?: string,
  routeLayers?: DefaultLayer[]
) => {
  const dispatch = useDispatch<AppDispatch>();
  const layers = useSelector(getLayerStack);
  const hidden = useSelector(getHiddenPermanentLayers);

  const entries = useMemo(
    () =>
      defaultLayers(routeLayers ?? (routePath === "/" ? DEFAULT_LAYERS : [])),
    [routePath, routeLayers]
  );

  /** the ids already being built, so a re-render cannot start a second fetch */
  const seededRef = useRef(new Set<string>());
  // read through refs: the seed is a one-off, and a stack that changes while a
  // style is still loading must not restart it
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  useEffect(() => {
    let cancelled = false;

    const seed = async (entry: DefaultLayer) => {
      const id = defaultLayerId(entry);
      if (seededRef.current.has(id)) {
        return;
      }
      seededRef.current.add(id);
      try {
        const style = await loadVectorStyle(
          entry.styleUrl,
          layerCatalogConfig.vectorTileServerUrl
        );
        const { item } = buildVectorStyleItem({
          styleRef: entry.styleUrl,
          style,
          id,
          fallbackTitle: styleUrlTitle(entry.styleUrl),
          type: entry.type,
          tools: entry.tools,
        });
        // `buildVectorStyleItem` spreads the style's `layerInfo` over the
        // item, so a label of our own has to go on afterwards; the layer takes
        // its title from the item (`resolveLayerTitle`)
        const layer = await parseToMapLayer(
          entry.title ? { ...item, title: entry.title } : item,
          false,
          !hiddenRef.current.includes(id)
        );
        if (cancelled || !layer) {
          return;
        }
        // a visitor who dropped the same style in this session already has it
        if (layersRef.current.some((stacked) => stacked.id === id)) {
          return;
        }
        dispatch(
          appendLayer({
            ...(layer as Layer),
            permanent: true,
            // Not something anyone put on top: it is the app's own furniture
            // and sits directly on the background, so every layer added later
            // draws over it. Same placement the permanent addon rows take.
            pinned: "first",
          })
        );
      } catch (error) {
        // let a later render try again rather than leaving the map short a
        // layer for a request that happened to fail
        seededRef.current.delete(id);
        console.warn(
          `[DEFAULT LAYERS] "${entry.styleUrl}" could not be put on the map:`,
          error
        );
      }
    };

    entries.forEach((entry) => void seed(entry));

    return () => {
      cancelled = true;
    };
  }, [dispatch, entries]);

  /**
   * The eye of a permanent row writes to `hiddenPermanentLayers` instead of to
   * the row, since an addon-owned row is handed over again on every change and
   * would overwrite it. Nothing reads that back for a plain layer, so the
   * choice is mirrored onto the stack entry here.
   */
  useEffect(() => {
    for (const entry of entries) {
      const id = defaultLayerId(entry);
      const stacked = layers.find((candidate) => candidate.id === id);
      if (!stacked) {
        continue;
      }
      const visible = !hidden.includes(id);
      if (stacked.visible !== visible) {
        dispatch(changeVisibility({ id, visible }));
      }
    }
  }, [dispatch, entries, hidden, layers]);
};

export default useDefaultLayers;
