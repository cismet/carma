import { useEffect, useRef } from "react";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import {
  EARTH_CIRCUMFERENCE,
  getFromWebMercatorToWGS84,
} from "@carma-geo/proj";
import {
  acquireSharedThreeScene,
  registerSharedThreeSceneRuntime,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";

import {
  disposeDzbPrmGlbRoot,
  loadDzbPrmGlbPartsIntoRoot,
  setDzbPrmGlbVisibility,
  type DzbPrmGlbVisibility,
} from "../ShadowTexture/shadow-texture-assets";
import type { ModelCollectionState } from ".";
import { useAddonState } from "../../lib/AddonStateContext";
import type { DzbPrmModelCollection } from "./dzb-prm-collection";

const partVisibility = (state: ModelCollectionState): DzbPrmGlbVisibility => ({
  environment: state.visible,
  zoo: state.visible,
  station: state.visible,
  bridge: state.visible && state.bridge === "planning",
  bridgeExisting: state.visible && state.bridge === "existing",
  catalogBridge: state.visible && state.bridge === "catalog",
});

const applyOpacity = (root: THREE.Group, opacity: number) => {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!object.userData.modelCollectionMaterial) {
      const source = object.material;
      object.material = Array.isArray(source)
        ? source.map((material) => material.clone())
        : source.clone();
      object.userData.modelCollectionMaterial = true;
    }
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity === 1;
      material.needsUpdate = true;
    }
  });
};

const clearModels = (root: THREE.Group) => {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!object.userData.modelCollectionMaterial) return;
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      material.dispose();
    }
  });
  root.clear();
};

export const ModelCollectionRuntime = ({
  map,
  collection,
  assetBaseUrl,
  state,
}: {
  map: MaplibreMap;
  collection: DzbPrmModelCollection;
  assetBaseUrl: string;
  state: ModelCollectionState;
}) => {
  const rootRef = useRef<THREE.Group | null>(null);
  const [textureState] = useAddonState("shadowTexture");
  const [shadowState] = useAddonState("shadowSimulation");
  const hideForShadowOnly = Boolean(
    shadowState?.enabled && textureState?.shadowOnly
  );
  const opacityRef = useRef(state.opacity);
  opacityRef.current = state.opacity;

  useEffect(() => {
    const lease = acquireSharedThreeScene(map);
    const [anchorX, anchorY] = collection.anchor3857;
    const anchorLngLat = getFromWebMercatorToWGS84([anchorX, anchorY]);
    const anchorMercator = MercatorCoordinate.fromLngLat([
      anchorLngLat[0],
      anchorLngLat[1],
    ]);
    const projectedToSceneScale =
      1 /
      (EARTH_CIRCUMFERENCE * anchorMercator.meterInMercatorCoordinateUnits());
    const root = new THREE.Group();
    root.name = "BuGa DZ_B_PRM model collection";
    rootRef.current = root;
    const runtime: SharedThreeSceneRuntime = {
      id: "dzb-prm-model-collection",
      originLngLat: [anchorLngLat[0], anchorLngLat[1]],
      root,
      update: () => {
        const origin = lease.layer.projectLngLatToScene([
          anchorLngLat[0],
          anchorLngLat[1],
        ]);
        if (!origin) return;
        root.position.set(
          origin.x,
          origin.y - collection.boardBottomHeightMeters,
          origin.z
        );
        root.scale.set(projectedToSceneScale, 1, projectedToSceneScale);
      },
      dispose: () => {
        clearModels(root);
        disposeDzbPrmGlbRoot(root);
      },
    };
    lease.layer.addRuntime(runtime);
    const unregister = registerSharedThreeSceneRuntime(map, runtime);
    return () => {
      rootRef.current = null;
      unregister();
      if (lease.layer.hasRuntime(runtime.id))
        lease.layer.removeRuntime(runtime.id);
      lease.release();
    };
  }, [collection, map]);

  useEffect(() => {
    if (rootRef.current) rootRef.current.visible = !hideForShadowOnly;
    map.triggerRepaint();
  }, [hideForShadowOnly, map]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    clearModels(root);
    if (!state.visible) {
      map.triggerRepaint();
      return;
    }
    const visibility = partVisibility(state);
    void loadDzbPrmGlbPartsIntoRoot({
      root,
      assetBaseUrl: `${assetBaseUrl.replace(/\/$/, "")}/${state.quality}`,
      visibility,
      isCancelled: () => cancelled,
    })
      .then(() => {
        if (cancelled) return;
        setDzbPrmGlbVisibility(root, visibility);
        applyOpacity(root, opacityRef.current);
        map.triggerRepaint();
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error("[modelCollection] GLB", error);
      });
    return () => {
      cancelled = true;
    };
  }, [
    assetBaseUrl,
    collection,
    map,
    state.bridge,
    state.quality,
    state.visible,
  ]);

  useEffect(() => {
    if (rootRef.current) applyOpacity(rootRef.current, state.opacity);
    map.triggerRepaint();
  }, [map, state.opacity]);

  return null;
};
