import { useEffect, useRef } from "react";

import { buildTiles3dLayer } from "@carma-mapping/engines/threejs";
import type { Tiles3dCustomLayer } from "@carma-mapping/engines/threejs";

import { useLibreContext } from "../contexts/LibreContext";

// ─────────────────────────────────────────────────────────────
//  Tiles3dLayerManager: mounts a 3D Tiles tileset named by a style.
//
//  The counterpart to ThreeLayerManager for tilesets rather than vector
//  sources. A style that only carries a tileset URL has no source and no
//  layers of its own, so there is nothing to query, nothing to sync and
//  nothing to rebuild: the layer goes on when the config arrives and comes off
//  when it goes away.
// ─────────────────────────────────────────────────────────────

/** What a style has to say for a tileset to be drawn. */
export interface Tiles3dConfig {
  renderMode: "tiles3d";
  /** The tileset.json. */
  tilesetUrl: string;
  /** Pixels of allowed error; lower asks for more detail. */
  errorTarget?: number;
  /** 0 to 1. */
  opacity?: number;
  /**
   * Draw the edges the tileset marks with `CESIUM_primitive_outline`. Defaults
   * to on, matching what Cesium does with the same tileset.
   */
  outline?: boolean;
  /** Colour of those edges, any CSS colour. */
  outlineColor?: string;
  /** 0 to 1 for the edges alone. */
  outlineOpacity?: number;
}

export interface Tiles3dLayerManagerProps {
  config: Tiles3dConfig;
  /** The opacity the layer bar asked of this layer, 0 to 1. */
  layerOpacity?: number;
}

/** Whether the map can still be asked about its layers, see ThreeLayerManager. */
function mapIsUsable(map: unknown): boolean {
  const candidate = map as { _removed?: boolean; style?: unknown } | null;
  return !!candidate && !candidate._removed && !!candidate.style;
}

export function Tiles3dLayerManager({
  config,
  layerOpacity,
}: Tiles3dLayerManagerProps) {
  const { map } = useLibreContext();
  const layerRef = useRef<Tiles3dCustomLayer | null>(null);
  // Read while building a layer, which happens outside the effect that follows
  // the slider, so the first frame after a rebuild is already at the right
  // opacity instead of flashing opaque.
  const layerOpacityRef = useRef<number | undefined>(layerOpacity);
  layerOpacityRef.current = layerOpacity;

  // The origin is fixed when the layer is built, so it is deliberately not a
  // dependency: re-anchoring it on every pan would tear the tileset down and
  // load it again. A local metre frame is good enough across a city.
  useEffect(() => {
    if (!map || !config.tilesetUrl) return;

    const layerId = `3d-tiles-${config.tilesetUrl}`;
    const center = map.getCenter();
    const origin: [number, number] = [center.lng, center.lat];

    // Adding the layer is a repeated affair, not a one-off. MapLibre cannot
    // diff a style while a custom layer is attached, so every change to the
    // layer list rebuilds the style from scratch and takes this layer off
    // again. The style can also still be loading when the config first
    // arrives, and `addLayer` refuses outright while it is. Both are answered
    // by trying again on the events that mark the style usable; the layer
    // object survives in between, so a re-attach costs no downloads.
    const attach = () => {
      if (!mapIsUsable(map) || !map.isStyleLoaded()) return;
      if (map.getLayer(layerId)) return;

      const layer =
        layerRef.current ??
        buildTiles3dLayer(layerId, config.tilesetUrl, origin, {
          errorTarget: config.errorTarget,
          opacity: (config.opacity ?? 1) * (layerOpacityRef.current ?? 1),
          outline: config.outline,
          outlineColor: config.outlineColor,
          outlineOpacity: config.outlineOpacity,
        });
      layerRef.current = layer;

      try {
        map.addLayer(layer);
      } catch (err) {
        // The layer is kept: the next styledata or idle tries again.
        console.warn("[3D-TILES] addLayer failed:", err);
      }
    };

    attach();
    map.on("styledata", attach);
    map.on("idle", attach);

    return () => {
      map.off("styledata", attach);
      map.off("idle", attach);
      const layer = layerRef.current;
      layerRef.current = null;
      if (!layer) return;
      // A panel that goes away destroys its map before this runs, and it took
      // its layers with it.
      if (mapIsUsable(map) && map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      layer.dispose();
    };
  }, [
    map,
    config.tilesetUrl,
    config.errorTarget,
    config.opacity,
    config.outline,
    config.outlineColor,
    config.outlineOpacity,
  ]);

  useEffect(() => {
    layerRef.current?.setOutlineVisible(config.outline ?? true);
  }, [config.outline]);

  // The layer bar's slider reaches a 2D layer as paint properties, which a
  // custom layer has none of, so it is multiplied in here the way the three.js
  // building layers do it.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.setOpacity((config.opacity ?? 1) * (layerOpacity ?? 1));
  }, [config.opacity, layerOpacity]);

  return null;
}

export default Tiles3dLayerManager;
