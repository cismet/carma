import { useEffect, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  buildThreeTilesRuntime,
  notifySharedThreeSceneContentChanged,
  notifySharedThreeSceneRequestStateChanged,
  registerSharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { createWuppertalStoryStyle } from "../maplibre/maplibre-story-style";
import meshParityStyle from "../maplibre/data/mesh2024-cesium-parity.style.json";

/** The Rathaus Barmen courtyard on the Mesh 2024, mounted as in the geoportal. */

export const MEASUREMENT_STORY_VIEW = {
  center: [7.2000445, 51.2720981] as [number, number],
  zoom: 19.8,
  bearing: 150.68,
  pitch: 60,
};

/** DGM1 height at the scene centre (terrarium, level 14): the mesh anchor. */
const SCENE_GROUND_REFERENCE_METERS = 154.9;
const MESH_RUNTIME_ID = "stories-mesh-2024";

export const MESH_STATUS = {
  WAITING: "waiting for map",
  LOADING: "loading mesh",
  RECEIVED: "mesh content received",
} as const;

export type MeasurementStorySurface = "stadtplan" | "luftbild";

export const useMeasurementStoryMap = (
  surfaceTiles: MeasurementStorySurface
) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  useEffect(() => {
    if (!container) return;
    const nextMap = new maplibregl.Map({
      container,
      style: createWuppertalStoryStyle(surfaceTiles),
      ...MEASUREMENT_STORY_VIEW,
      maxPitch: 85,
      attributionControl: false,
    });
    setMap(nextMap);
    return () => {
      setMap(null);
      nextMap.remove();
    };
  }, [container, surfaceTiles]);
  return { map, setContainer };
};

export const useMeasurementStoryMesh = (map: MapLibreMap | null) => {
  const [status, setStatus] = useState<string>(MESH_STATUS.WAITING);
  useEffect(() => {
    if (!map) return;
    const lease = acquireSharedThreeScene(map);
    let disposed = false;
    const runtime = buildThreeTilesRuntime(
      MESH_RUNTIME_ID,
      WUPP_MESH_2024.url,
      MEASUREMENT_STORY_VIEW.center,
      {
        cameraLocalMount: true,
        groundReferenceMeters: SCENE_GROUND_REFERENCE_METERS,
        providesTerrain: true,
        mapStyleDrape: "none",
        outline: false,
        colorCorrection: WUPP_MESH_2024.colorCorrection,
        entry: meshParityStyle.metadata.carmaConf["3d"].entry,
        diagnostics: false,
        tileTelemetry: false,
        onContentChanged: (bounds, roots) => {
          if (disposed) return;
          if (roots && roots.length > 0) setStatus(MESH_STATUS.RECEIVED);
          notifySharedThreeSceneContentChanged(map, { bounds, roots });
        },
        onRequestStateChange: () => {
          if (!disposed) notifySharedThreeSceneRequestStateChanged(map);
        },
      }
    );
    runtime.loading.setErrorTarget(2);
    runtime.appearance.setOpacity(1);
    lease.layer.addRuntime(runtime.scene);
    const unregister = registerSharedThreeSceneRuntime(map, runtime.scene);
    setStatus(MESH_STATUS.LOADING);
    map.triggerRepaint();
    return () => {
      disposed = true;
      unregister();
      lease.layer.removeRuntime(MESH_RUNTIME_ID);
      lease.release();
    };
  }, [map]);
  return status;
};
