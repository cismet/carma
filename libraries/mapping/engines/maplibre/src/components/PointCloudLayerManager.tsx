import type { Latitude, Longitude } from "@carma-geo/data-structures";
import { getFromUTM32ToWGS84, getGcg2016HeightAnomaly } from "@carma-geo/proj";
import { useEffect, useRef } from "react";

import { useLibreContext } from "../contexts/LibreContext";
import { MAPLIBRE_EVENT } from "../constants/mapEvents";
import { add3dPresence, remove3dPresence } from "../utils/threeDPresence";
import { registerSharedThreeSceneRuntime } from "../lib/runtime/integrations/shared-three-scene-content-registry";
import { acquireSharedThreeScene } from "../lib/runtime/integrations/shared-three-scene-registry";
import {
  createPointTilesetRuntime,
  type PointTilesetRuntime,
} from "../lib/runtime/integrations/point-tileset-runtime";
import {
  isPointCloudZoomInRange,
  type PointCloudLayerConfig,
} from "../lib/core/pointcloud-style-config";

// ─────────────────────────────────────────────────────────────
//  PointCloudLayerManager: mounts a point cloud named by a style.
//
//  The point counterpart to Tiles3dLayerManager. The cloud is a 3D Tiles
//  tileset of glTF POINTS, drawn in the shared three.js scene and gated by
//  the zoom range of the layer that carries it, so a style that switches its
//  content by zoom switches the cloud along with it.
// ─────────────────────────────────────────────────────────────

const DEFAULT_POINT_SIZE_PX = 2;
const DEFAULT_ERROR_TARGET_PX = 8;

export interface PointCloudLayerManagerProps {
  config: PointCloudLayerConfig;
}

/** Whether the map can still be asked about its layers, see ThreeLayerManager. */
function mapIsUsable(map: unknown): boolean {
  const candidate = map as { _removed?: boolean; style?: unknown } | null;
  return !!candidate && !candidate._removed && !!candidate.style;
}

/**
 * The scene origin: the centre of the declared bounds when they are in
 * UTM32, else the map centre. The tileset is ECEF, so the origin only decides
 * float precision near the cloud, not where it lands.
 */
const resolveOrigin = (
  config: PointCloudLayerConfig,
  mapCenter: [number, number]
): [number, number] => {
  const bounds = config.pointcloud.bounds;
  if (bounds?.crs !== "EPSG:25832") {
    return mapCenter;
  }
  const [longitude, latitude] = getFromUTM32ToWGS84([
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
  ]) as [number, number];
  return [longitude, latitude];
};

export function PointCloudLayerManager({ config }: PointCloudLayerManagerProps) {
  const { map } = useLibreContext();
  const runtimeRef = useRef<PointTilesetRuntime | null>(null);
  // Read while building, which happens after an async anchor lookup, so the
  // first frame already has the settings the style asks for by then.
  const configRef = useRef(config);
  configRef.current = config;
  const url = config.pointcloud.url;

  useEffect(() => {
    if (!map || !mapIsUsable(map)) {
      return;
    }

    const runtimeId = `pointcloud-${url.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
    const center = map.getCenter();
    const origin = resolveOrigin(configRef.current, [center.lng, center.lat]);
    const lease = acquireSharedThreeScene(map);
    let disposed = false;
    let teardown: (() => void) | null = null;

    const applyZoomGate = () => {
      const runtime = runtimeRef.current;
      if (!runtime || !mapIsUsable(map)) {
        return;
      }
      runtime.setActive(isPointCloudZoomInRange(configRef.current, map.getZoom()));
    };

    const build = (anchorHeightEllipsoidal: number) => {
      if (disposed || !mapIsUsable(map)) {
        return;
      }
      const initial = configRef.current;
      const runtime = createPointTilesetRuntime({
        id: runtimeId,
        tilesetUrl: url,
        originLngLat: origin,
        anchorHeightEllipsoidal,
        pointSize: initial.pointSize ?? DEFAULT_POINT_SIZE_PX,
        errorTarget: initial.errorTarget ?? DEFAULT_ERROR_TARGET_PX,
        opacity: initial.layerOpacity,
        requestRender: () => map.triggerRepaint(),
      });
      runtimeRef.current = runtime;
      applyZoomGate();
      lease.layer.addRuntime(runtime);
      const unregisterRuntime = registerSharedThreeSceneRuntime(map, runtime);
      // Lets the camera restriction know the map has become three
      // dimensional; with the camera free, terrain follows, which is what
      // puts the cloud's DHHN heights on the ground.
      add3dPresence(map, runtimeId);
      map.on(MAPLIBRE_EVENT.MOVE, applyZoomGate);

      teardown = () => {
        map.off(MAPLIBRE_EVENT.MOVE, applyZoomGate);
        runtimeRef.current = null;
        remove3dPresence(map, runtimeId);
        unregisterRuntime();
        // Removing the runtime from the scene disposes it, tile cache included.
        if (lease.layer.hasRuntime(runtime.id)) {
          lease.layer.removeRuntime(runtime.id);
        } else {
          runtime.dispose();
        }
      };
    };

    // The scene's vertical frame is DHHN2016 (Mesh 2024 and the terrain both
    // carry DHHN heights). The tileset carries ellipsoidal heights, so
    // anchoring it at the ellipsoidal height of DHHN zero, the GCG2016 height
    // anomaly at the origin, makes its local y come out as the DHHN height.
    getGcg2016HeightAnomaly(
      origin[0] as Longitude.deg,
      origin[1] as Latitude.deg
    ).then(build, (error: unknown) => {
      // Anchoring at zero would sink the cloud by the anomaly (~46 m in
      // Wuppertal); not drawing it is the honest answer.
      console.warn("[POINTCLOUD] no GCG2016 height anomaly, cloud skipped", {
        url,
        origin,
        error,
      });
    });

    return () => {
      disposed = true;
      teardown?.();
      lease.release();
    };
  }, [map, url]);

  // A changed carrier layer zoom range re-gates without waiting for a move.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!map || !runtime || !mapIsUsable(map)) {
      return;
    }
    runtime.setActive(
      isPointCloudZoomInRange(
        { minzoom: config.minzoom, maxzoom: config.maxzoom },
        map.getZoom()
      )
    );
  }, [map, config.minzoom, config.maxzoom]);

  useEffect(() => {
    runtimeRef.current?.setPointSize(config.pointSize ?? DEFAULT_POINT_SIZE_PX);
  }, [config.pointSize]);

  useEffect(() => {
    runtimeRef.current?.setErrorTarget(
      config.errorTarget ?? DEFAULT_ERROR_TARGET_PX
    );
  }, [config.errorTarget]);

  // The layer bar's slider reaches a 2D layer as paint properties, which a
  // custom layer has none of, so it is applied to the point material here.
  useEffect(() => {
    runtimeRef.current?.setOpacity(config.layerOpacity);
  }, [config.layerOpacity]);

  return null;
}

export default PointCloudLayerManager;
