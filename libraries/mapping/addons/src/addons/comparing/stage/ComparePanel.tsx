import { useCallback } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { LibreContextProvider } from "@carma-mapping/contexts";
import {
  LibreMap,
  type LibreLayer,
  type ThreeRuntimeParams,
} from "@carma-mapping/engines/maplibre";

type ComparePanelProps = {
  layers: LibreLayer[];
  onMapReady: (map: MaplibreMap) => void;
  overrideGlyphs?: string;
  /**
   * The app map's own three.js switch, carried over so a layer that declares
   * itself 3D is built as geometry here too. Undefined means the app map draws
   * no 3D either, and the panel mounts nothing.
   */
  threeRuntimeParams?: ThreeRuntimeParams;
};

/**
 * One compare panel: a map of its own showing the layers its role was given.
 *
 * Built on `LibreMap` rather than `CarmaMap` because a panel wants none of what
 * `CarmaMap` adds. That component brings its own `HashStateProvider` and
 * `ControlLayout`, and several of those nested inside the geoportal would mean
 * several things writing the url while all their controls have to be switched
 * off again anyway.
 *
 * The `LibreContextProvider` is not optional. `LibreMap` publishes its instance
 * into the surrounding libre context on construction, so a panel without its
 * own provider would overwrite the app's map handle with the panel's, and
 * everything in the app reading `useLibreContext()` would quietly start talking
 * to a comparison panel.
 */
export const ComparePanel = ({
  layers,
  onMapReady,
  overrideGlyphs,
  threeRuntimeParams,
}: ComparePanelProps) => {
  const handleMapReady = useCallback(
    (map: MaplibreMap) => {
      onMapReady(map);
    },
    [onMapReady]
  );

  return (
    <div className="carma-comparing-panel">
      <LibreContextProvider>
        <LibreMap
          backgroundLayers={null}
          layers={layers}
          setLibreMap={handleMapReady}
          overrideGlyphs={overrideGlyphs}
          threeRuntimeParams={threeRuntimeParams}
          selectionEnabled={false}
          hashWriteEnabled={false}
        />
      </LibreContextProvider>
    </div>
  );
};
