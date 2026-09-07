import { useEffect } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { Control, type Positions } from "@carma-mapping/map-controls-layout";
import {
  WUPPERTAL_TERRAIN_SOURCE_ID,
  useCameraRestriction,
} from "@carma-mapping/engines/maplibre";
import { LibreTerrainControl } from "@carma-mapping/components";

import type { AddonComponentProps } from "../lib/registry";
import { use3dLayers } from "../lib/use3dLayers";

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 80;
const DEFAULT_EXAGGERATION = 1;

export type LibreTerrainConfig = {
  appKey?: string;
  source?: string;
  exaggeration?: number;
  controlPosition?: Positions;
  controlOrder?: number;
  /**
   * How terrain is decided. "button" offers a toggle and leaves the choice to
   * the user; "whileCameraFree" decides itself: terrain is on for as long as
   * the map's camera restriction is lifted and off while it holds, with no
   * button at all. A flat, north-up map has no use for relief, and a free
   * camera is tilted because there is something three dimensional to look at,
   * which needs the ground under it. Default: "button".
   */
  mode?: "button" | "whileCameraFree";
  /**
   * Only for mode "button": when the toggle is offered. "always" is the
   * long-standing behaviour; "while3dLayersActive" shows it only while the
   * map draws something three dimensional, which is the only time relief is
   * visible at all. Default: "always".
   */
  show?: "always" | "while3dLayersActive";
};

const setTerrainEnabled = (
  map: MaplibreMap,
  enabled: boolean,
  source: string,
  exaggeration: number
) => {
  if (!enabled) {
    if (map.getTerrain()) {
      map.setTerrain(null);
    }
    return;
  }
  if (map.getTerrain() || !map.getSource(source)) {
    return;
  }
  map.setTerrain({ source, exaggeration });
};

/**
 * Terrain as a consequence of the camera: on while the restriction is lifted,
 * off while it holds. The source arrives with the style, so a style still
 * loading is asked again on `styledata`; a restriction coming back takes the
 * terrain away with it, and so does the addon leaving the route.
 */
const useTerrainWhileCameraFree = (
  map: MaplibreMap | null,
  enabled: boolean,
  source: string,
  exaggeration: number
) => {
  // no entry yet means the engine has not written its base, which it does
  // with the app's own value at construction; until then nothing is free
  const restricted = useCameraRestriction(map)?.restricted ?? true;

  useEffect(() => {
    if (!map || !enabled) {
      return;
    }
    const apply = () => {
      setTerrainEnabled(map, !restricted, source, exaggeration);
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
      setTerrainEnabled(map, false, source, exaggeration);
    };
  }, [map, enabled, restricted, source, exaggeration]);
};

export const LibreTerrain = ({
  config,
  libreMap,
}: AddonComponentProps<"libreTerrain">) => {
  const {
    appKey = "carma",
    source = WUPPERTAL_TERRAIN_SOURCE_ID,
    exaggeration = DEFAULT_EXAGGERATION,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
    mode = "button",
    show = "always",
  } = config ?? {};

  const automatic = mode === "whileCameraFree";

  // Ahead of the early returns: hooks may not be skipped.
  useTerrainWhileCameraFree(libreMap, automatic, source, exaggeration);
  const threeDActive = use3dLayers(
    libreMap,
    !automatic && show === "while3dLayersActive"
  );
  const hidden = automatic || (show === "while3dLayersActive" && !threeDActive);

  // Taking the button away while terrain is on would leave it on with nothing
  // left to switch it off, so the button going away switches it off. Terrain
  // has nothing to show on a flat map anyway.
  useEffect(() => {
    if (!libreMap || automatic || !hidden) return;
    if (libreMap.getTerrain()) {
      libreMap.setTerrain(null);
    }
  }, [libreMap, automatic, hidden]);

  if (!libreMap) {
    return null;
  }

  if (hidden) {
    return null;
  }

  return (
    <Control position={controlPosition} order={controlOrder}>
      <LibreTerrainControl
        map={libreMap}
        appKey={appKey}
        source={source}
        exaggeration={exaggeration}
      />
    </Control>
  );
};
