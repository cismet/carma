import { useCallback, useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMountainCity } from "@fortawesome/free-solid-svg-icons";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

const TERRAIN_STORAGE_BASE_KEY = "carma-map-terrain";
const DEFAULT_EXAGGERATION = 1;
const DEFAULT_TERRAIN_SOURCE = "terrainSource";

const persistTerrainState = (storageKey: string, enabled: boolean) => {
  try {
    localStorage.setItem(storageKey, String(enabled));
  } catch {
    // storage unavailable (private mode etc.) - the toggle still works
  }
};

export interface LibreTerrainControlProps {
  map: MapLibreMap | null | undefined;
  /** Scopes the localStorage persistence per app (same scoping as CarmaMap's
   * appKey). Without it the setting is shared across apps on the origin. */
  appKey?: string;
  /** Terrain source id in the map style (e.g. WUPPERTAL_TERRAIN_SOURCE_ID from
   * the maplibre engine). Defaults to "terrainSource". */
  source?: string;
  exaggeration?: number;
}

/** Terrain toggle button for maplibre maps. Persists the setting and restores
 * terrain once the style is loaded, so hosts only need to place it in their
 * control layout. */
export const LibreTerrainControl = ({
  map,
  appKey,
  source,
  exaggeration = DEFAULT_EXAGGERATION,
}: LibreTerrainControlProps) => {
  const storageKey = appKey
    ? `${appKey}:${TERRAIN_STORAGE_BASE_KEY}`
    : TERRAIN_STORAGE_BASE_KEY;
  const terrainSource = source ?? DEFAULT_TERRAIN_SOURCE;

  const [showTerrain, setShowTerrain] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });

  // Restore terrain if it was persisted as enabled
  useEffect(() => {
    if (!map || !showTerrain || map.terrain) return;
    const apply = () => {
      if (map.getSource(terrainSource)) {
        map.setTerrain({ source: terrainSource, exaggeration });
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("styledata", apply);
    }
    return () => {
      map.off("styledata", apply);
    };
  }, [map, showTerrain, terrainSource, exaggeration]);

  // The map is the truth about terrain, not this button. A layer can ask for
  // terrain of its own accord (`terrainMandatory` on a 3D tileset), and the
  // button has to say so rather than stay dark over a map that has it.
  //
  // Deliberately without an initial read: on mount the persisted setting is
  // still waiting to be applied by the effect above, and reading the map at
  // that point would report false and take the restore with it.
  useEffect(() => {
    if (!map) return;
    const syncFromMap = () => {
      setShowTerrain(!!map.terrain);
    };
    map.on("terrain", syncFromMap);
    return () => {
      map.off("terrain", syncFromMap);
    };
  }, [map]);

  const toggleTerrain = useCallback(() => {
    if (!map) return;
    if (map.terrain) {
      map.setTerrain(null);
      setShowTerrain(false);
      persistTerrainState(storageKey, false);
    } else {
      if (!map.getSource(terrainSource)) {
        console.warn(
          `[LibreTerrainControl] terrain source "${terrainSource}" is missing from the map style; cannot enable terrain`
        );
        return;
      }
      map.setTerrain({ source: terrainSource, exaggeration });
      setShowTerrain(true);
      persistTerrainState(storageKey, true);
    }
  }, [map, terrainSource, exaggeration, storageKey]);

  return (
    <Tooltip title={"Terrain"} placement="right">
      <ControlButtonStyler onClick={toggleTerrain} className="font-semibold">
        <FontAwesomeIcon
          icon={faMountainCity}
          className={showTerrain ? "text-[#1677ff]" : ""}
        />
      </ControlButtonStyler>
    </Tooltip>
  );
};
