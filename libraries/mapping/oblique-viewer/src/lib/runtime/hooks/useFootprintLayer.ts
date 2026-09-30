import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import type {
  AnimationConfig,
  ObliqueFootprintsStyle,
  ObliqueImageRecord,
} from "../../core/types";
import {
  createFootprintOutlineLayer,
  type FootprintOutlineLayer,
} from "../footprint-outline-layer";
import {
  findMatchingFeature,
  type FootprintCollection,
} from "../utils/footprints";

/**
 * The outline of the selected image's footprint on the ground, as a custom
 * layer that stays visible over the 3D layers (see footprint-outline-layer).
 *
 * Locking the footprint (while the preview is up, or on the way out) fades
 * the line rather than removing it.
 */

export const OBLIQUE_FOOTPRINT_LAYER_ID = "carma-oblique-footprint-outline";

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
  selectedRecord: ObliqueImageRecord | null;
  seriesLabel?: string;
  /** fade the outline out and keep it out until unlocked */
  locked: boolean;
  style?: ObliqueFootprintsStyle;
  fadeOut?: AnimationConfig;
};

export const useFootprintLayer = ({
  map,
  enabled,
  footprintData,
  selectedImageId,
  selectedRecord,
  seriesLabel,
  locked,
  style,
  fadeOut,
}: UseFootprintLayerOptions): void => {
  const { outlineColor, outlineWidth, outlineOpacity } = {
    ...DEFAULT_STYLE,
    ...(style ?? {}),
  };
  const layerRef = useRef<FootprintOutlineLayer | null>(null);
  const fadeOutRef = useRef(fadeOut);
  fadeOutRef.current = fadeOut;

  // the layer exists while the viewer is on; the effects below run after
  // this one and feed it
  useEffect(() => {
    if (!map || !enabled) return undefined;
    const layer = createFootprintOutlineLayer(map, OBLIQUE_FOOTPRINT_LAYER_ID, {
      color: outlineColor,
      width: outlineWidth,
      opacity: outlineOpacity,
    });
    layerRef.current = layer;
    return () => {
      layerRef.current = null;
      layer.destroy();
    };
    // the look is applied by its own effect; a new colour is no reason to rebuild
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled]);

  // the ring under the outline
  useEffect(() => {
    const feature =
      footprintData && selectedImageId
        ? findMatchingFeature(footprintData.features, selectedImageId)
        : undefined;
    layerRef.current?.setRing(feature?.geometry.coordinates[0] ?? null, {
      pose: selectedRecord?.pose ?? null,
      seriesLabel,
    });
  }, [
    map,
    enabled,
    footprintData,
    selectedImageId,
    selectedRecord,
    seriesLabel,
  ]);

  // the look
  useEffect(() => {
    layerRef.current?.setStyle({
      color: outlineColor,
      width: outlineWidth,
      opacity: outlineOpacity,
    });
  }, [map, enabled, outlineColor, outlineWidth, outlineOpacity]);

  // the fade on lock
  useEffect(() => {
    layerRef.current?.setLocked(locked, fadeOutRef.current);
  }, [map, enabled, locked]);
};
