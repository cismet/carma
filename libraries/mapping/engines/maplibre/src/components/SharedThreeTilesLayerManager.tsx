import { useEffect } from "react";

import {
  buildThreeTilesRuntime,
  THREE_TILES_DEFAULT_REQUEST_CONCURRENCY,
} from "../lib/runtime/integrations/three-tiles-runtime";
import {
  notifySharedThreeSceneContentChanged,
  registerSharedThreeSceneRuntime,
} from "../lib/runtime/integrations/shared-three-scene-content-registry";
import { acquireSharedThreeScene } from "../lib/runtime/integrations/shared-three-scene-registry";
import type { ThreeTilesLayer } from "../lib/runtime/integrations/three-tiles-layer";
import { useLibreContext } from "../contexts/LibreContext";

const runtimeId = (name: string) =>
  `three-tiles-${name.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;

export const SharedThreeTilesLayerManager = ({
  layers,
}: {
  layers: readonly ThreeTilesLayer[];
}) => {
  const { map } = useLibreContext();
  const layerKey = JSON.stringify(layers);

  useEffect(() => {
    if (!map || layers.length === 0) return;

    const lease = acquireSharedThreeScene(map);
    const runtimeRegistrations = layers.map((layer) => {
      const center = map.getCenter();
      const origin = layer.origin ?? [center.lng, center.lat];
      const runtime = buildThreeTilesRuntime(
        runtimeId(layer.carmaLayerId ?? layer.name),
        layer.url,
        origin,
        {
          requestConcurrency:
            layer.requestConcurrency ?? THREE_TILES_DEFAULT_REQUEST_CONCURRENCY,
          onContentChanged: () => notifySharedThreeSceneContentChanged(map),
        }
      );
      runtime.setClayMaterial({
        color: layer.shader.color,
        roughness: layer.shader.roughness,
        metalness: layer.shader.metalness,
      });
      runtime.setWhiteShading(true);
      runtime.setOpacity(layer.opacity ?? 1);
      runtime.setErrorTarget(layer.errorTarget ?? 8);
      lease.layer.addRuntime(runtime);
      return {
        runtime,
        unregister: registerSharedThreeSceneRuntime(map, runtime),
      };
    });

    return () => {
      for (const { runtime, unregister } of runtimeRegistrations) {
        unregister();
        lease.layer.removeRuntime(runtime.id);
      }
      lease.release();
    };
    // layerKey is the serializable lifecycle contract; depending on the array
    // identity would reload tiles after unrelated host rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerKey, map]);

  return null;
};
