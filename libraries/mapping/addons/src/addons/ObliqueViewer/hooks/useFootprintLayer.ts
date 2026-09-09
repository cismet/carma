import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";

import type { AnimationConfig, ObliqueFootprintsStyle } from "../types";
import {
  findMatchingFeature,
  type FootprintCollection,
  type FootprintProperties,
} from "../utils/footprints";

/**
 * The outline of the selected image's footprint on the ground: one GeoJSON
 * source and one line layer, draped over the terrain by MapLibre itself.
 *
 * Locking the footprint (while the preview is up, or on the way out) fades
 * the line rather than removing it, through the layer's own opacity
 * transition, so the fade costs no animation loop.
 */

export const OBLIQUE_FOOTPRINT_SOURCE_ID = "carma-oblique-footprint";
export const OBLIQUE_FOOTPRINT_LAYER_ID = "carma-oblique-footprint-outline";

const EMPTY: FeatureCollection<Polygon, FootprintProperties> = {
  type: "FeatureCollection",
  features: [],
};

const DEFAULT_STYLE: Required<ObliqueFootprintsStyle> = {
  outlineColor: "#ffffff",
  outlineWidth: 5,
  outlineOpacity: 1,
};

type UseFootprintLayerOptions = {
  map: MaplibreMap | null;
  enabled: boolean;
  footprintData: FootprintCollection | null;
  selectedImageId: string | null;
  /** fade the outline out and keep it out until unlocked */
  locked: boolean;
  style?: ObliqueFootprintsStyle;
  fadeOut?: AnimationConfig;
};

const ensureLayer = (
  map: MaplibreMap,
  style: Required<ObliqueFootprintsStyle>,
  fadeOut: AnimationConfig | undefined
) => {
  if (!map.getSource(OBLIQUE_FOOTPRINT_SOURCE_ID)) {
    map.addSource(OBLIQUE_FOOTPRINT_SOURCE_ID, { type: "geojson", data: EMPTY });
  }
  if (!map.getLayer(OBLIQUE_FOOTPRINT_LAYER_ID)) {
    map.addLayer({
      id: OBLIQUE_FOOTPRINT_LAYER_ID,
      type: "line",
      source: OBLIQUE_FOOTPRINT_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": style.outlineColor,
        "line-width": style.outlineWidth,
        "line-opacity": style.outlineOpacity,
        "line-opacity-transition": {
          duration: fadeOut?.duration ?? 300,
          delay: fadeOut?.delay ?? 0,
        },
      },
    });
  }
};

const removeLayer = (map: MaplibreMap) => {
  try {
    if (map.getLayer(OBLIQUE_FOOTPRINT_LAYER_ID)) {
      map.removeLayer(OBLIQUE_FOOTPRINT_LAYER_ID);
    }
    if (map.getSource(OBLIQUE_FOOTPRINT_SOURCE_ID)) {
      map.removeSource(OBLIQUE_FOOTPRINT_SOURCE_ID);
    }
  } catch {
    // the style may already be gone
  }
};

export const useFootprintLayer = ({
  map,
  enabled,
  footprintData,
  selectedImageId,
  locked,
  style,
  fadeOut,
}: UseFootprintLayerOptions): void => {
  const mergedStyle = { ...DEFAULT_STYLE, ...(style ?? {}) };
  const { outlineColor, outlineWidth, outlineOpacity } = mergedStyle;
  const styleRef = useRef(mergedStyle);
  styleRef.current = mergedStyle;
  const fadeOutRef = useRef(fadeOut);
  fadeOutRef.current = fadeOut;

  // the layer exists while the viewer is on, and comes back after a style swap
  useEffect(() => {
    if (!map || !enabled) return undefined;
    const apply = () => {
      if (!map.isStyleLoaded()) return;
      ensureLayer(map, styleRef.current, fadeOutRef.current);
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
      removeLayer(map);
    };
  }, [map, enabled]);

  // the feature under the outline
  useEffect(() => {
    if (!map || !enabled) return undefined;
    const apply = () => {
      const source = map.getSource(OBLIQUE_FOOTPRINT_SOURCE_ID) as
        | GeoJSONSource
        | undefined;
      if (!source) return;
      const feature =
        footprintData && selectedImageId
          ? findMatchingFeature(footprintData.features, selectedImageId)
          : undefined;
      source.setData(
        feature ? { type: "FeatureCollection", features: [feature] } : EMPTY
      );
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, enabled, footprintData, selectedImageId]);

  // the look, and the fade on lock
  useEffect(() => {
    if (!map || !enabled) return undefined;
    const apply = () => {
      if (!map.getLayer(OBLIQUE_FOOTPRINT_LAYER_ID)) return;
      map.setPaintProperty(OBLIQUE_FOOTPRINT_LAYER_ID, "line-color", outlineColor);
      map.setPaintProperty(OBLIQUE_FOOTPRINT_LAYER_ID, "line-width", outlineWidth);
      map.setPaintProperty(
        OBLIQUE_FOOTPRINT_LAYER_ID,
        "line-opacity",
        locked ? 0 : outlineOpacity
      );
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, enabled, locked, outlineColor, outlineWidth, outlineOpacity]);
};
