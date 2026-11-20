import { useEffect } from "react";

import type maplibregl from "maplibre-gl";

import {
  isSharedThreeSurfaceLoading,
  pickSharedThreeSurfaceAltitude,
  projectLngLatAtAltitude,
} from "../lib/runtime/integrations/shared-three-surface-height";

/** Shows the marker even if tiles keep streaming, so it never stays hidden. */
const REVEAL_TIMEOUT_MS = 4000;

/**
 * Keeps a marker created hidden out of sight until the ground under it is
 * known (MapLibre's DEM and the drawn 3D surfaces have loaded), then shows it
 * once, on the highest 3D surface there (a roof) or else on the terrain.
 * Marker only follows MapLibre terrain, so the lift is an extra screen offset,
 * recomputed on every move.
 */
export const useMarkerOnSurface = (
  map: maplibregl.Map | null,
  marker: maplibregl.Marker | undefined
) => {
  useEffect(() => {
    if (!(map && marker)) {
      return;
    }
    const baseOffset = marker.getOffset().clone();
    let surfaceAltitude: number | null = null;

    const placeOnSurface = () => {
      if (surfaceAltitude === null) {
        marker.setOffset(baseOffset);
        return;
      }
      const lngLat = marker.getLngLat();
      const onSurface = projectLngLatAtAltitude(map, lngLat, surfaceAltitude);
      marker.setOffset(baseOffset.add(onSurface.sub(map.project(lngLat))));
    };

    const pick = () => {
      const { lng, lat } = marker.getLngLat();
      surfaceAltitude = pickSharedThreeSurfaceAltitude(map, [lng, lat]);
      placeOnSurface();
    };

    const isGroundLoaded = () => {
      const terrainSource = map.getTerrain()?.source;
      const demLoading =
        terrainSource &&
        map.getSource(terrainSource) &&
        !map.isSourceLoaded(terrainSource);
      return !demLoading && !isSharedThreeSurfaceLoading(map);
    };

    const reveal = () => {
      map.off("render", revealWhenGroundLoaded);
      window.clearTimeout(revealTimeout);
      pick();
      marker.getElement().style.visibility = "";
    };
    // checked on render, so the tiles a camera jump needs are already requested
    const revealWhenGroundLoaded = () => {
      if (isGroundLoaded()) {
        reveal();
      }
    };
    const revealTimeout = window.setTimeout(reveal, REVEAL_TIMEOUT_MS);

    map.on("render", revealWhenGroundLoaded);
    // a hit already in view moves nothing, so force the frame that reveals it
    map.triggerRepaint();
    map.on("move", placeOnSurface);
    map.on("idle", pick);
    return () => {
      window.clearTimeout(revealTimeout);
      map.off("render", revealWhenGroundLoaded);
      map.off("move", placeOnSurface);
      map.off("idle", pick);
    };
  }, [map, marker]);
};
