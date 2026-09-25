import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

import { BRUECKENENTWURF_GLB } from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  registerSharedThreeSceneRuntime,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import { degToRadNumeric } from "@carma-units";

import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import { resolveAddonEntries } from "../../lib/registry";
import { loadDzbPrmCollection } from "./dzb-prm-collection";

let bridgeTemplate: Promise<THREE.Group> | null = null;
const dracoLoader = new DRACOLoader().setDecoderPath(
  new URL(
    "assets/draco/",
    new URL(import.meta.env.BASE_URL, globalThis.location.origin)
  ).href
);
const loader = new GLTFLoader()
  .setMeshoptDecoder(MeshoptDecoder)
  .setDRACOLoader(dracoLoader);

const loadBridgeTemplate = () => {
  bridgeTemplate ??= loader
    .loadAsync(BRUECKENENTWURF_GLB.model.uri)
    .then((gltf) => gltf.scene)
    .catch((error: unknown) => {
      bridgeTemplate = null;
      throw error;
    });
  return bridgeTemplate;
};

/** The catalog layer's Cesium GLB, mounted at the same georeference in MapLibre. */
export const CatalogBridgeModel = ({
  map,
  opacity,
  visible,
}: {
  map: MaplibreMap;
  opacity: number;
  visible: boolean;
}) => {
  const rootRef = useRef<THREE.Group | null>(null);
  const routeAddons = useRouteAddons();
  const [textureState] = useAddonState("shadowTexture");
  const [shadowState] = useAddonState("shadowSimulation");
  const [modelState] = useAddonState("modelCollection");
  const manifestUrl = useMemo(
    () =>
      resolveAddonEntries(routeAddons).find(
        (entry) =>
          entry.kind === "modelCollection" || entry.kind === "shadowTexture"
      )?.config.manifestUrl,
    [routeAddons]
  );
  const [boardBottomHeight, setBoardBottomHeight] = useState<number | null>(
    manifestUrl ? null : 0
  );
  const boardBottomHeightRef = useRef(boardBottomHeight ?? 0);
  boardBottomHeightRef.current = boardBottomHeight ?? 0;
  const hideForShadowOnly = Boolean(
    shadowState?.enabled && textureState?.shadowOnly
  );
  const collectionRendersCatalog = Boolean(
    modelState?.visible && modelState.bridge === "catalog"
  );
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  useEffect(() => {
    if (!manifestUrl) {
      setBoardBottomHeight(0);
      return;
    }
    let cancelled = false;
    setBoardBottomHeight(null);
    void loadDzbPrmCollection(manifestUrl)
      .then((collection) => {
        if (!cancelled)
          setBoardBottomHeight(collection.boardBottomHeightMeters);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[catalogBridge] collection datum", error);
        setBoardBottomHeight(0);
      });
    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);

  useEffect(() => {
    const lease = acquireSharedThreeScene(map);
    const { longitude, latitude, altitude } = BRUECKENENTWURF_GLB.position;
    const root = new THREE.Group();
    root.name = "BUGA-Hängebrücke 3D-Modell";
    rootRef.current = root;
    const runtime: SharedThreeSceneRuntime = {
      id: "geoportal-catalog-bridge",
      originLngLat: [longitude, latitude],
      root,
      update: () => {
        const origin = lease.layer.projectLngLatToScene(
          [longitude, latitude],
          altitude
        );
        if (origin) {
          root.position.copy(origin);
          // The BuGa collection renders above its board-bottom datum; the
          // shadow capture keeps both meshes in their unshifted height frame.
          root.position.y -= boardBottomHeightRef.current;
        }
      },
      dispose: () => {
        root.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            material.dispose();
          }
        });
        root.clear();
      },
    };
    lease.layer.addRuntime(runtime);
    const unregister = registerSharedThreeSceneRuntime(map, runtime);
    let cancelled = false;

    void loadBridgeTemplate()
      .then((template) => {
        if (cancelled) return;
        const model = template.clone(true);
        // Cesium's heading is measured clockwise from north. The GLB's long
        // axis is local +Z (south here); Three's Y rotation has the opposite
        // sign in this east/up/south scene.
        model.rotation.y = degToRadNumeric(
          90 - BRUECKENENTWURF_GLB.orientation.heading
        );
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.material = Array.isArray(object.material)
            ? object.material.map((material) => material.clone())
            : object.material.clone();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            material.transparent = opacityRef.current < 1;
            material.opacity = opacityRef.current;
            material.depthWrite = opacityRef.current === 1;
          }
        });
        root.add(model);
        map.triggerRepaint();
      })
      .catch((error: unknown) => {
        if (!cancelled) console.error("[catalogBridge] GLB", error);
      });

    return () => {
      cancelled = true;
      rootRef.current = null;
      unregister();
      if (lease.layer.hasRuntime(runtime.id)) {
        lease.layer.removeRuntime(runtime.id);
      }
      lease.release();
    };
  }, [map]);

  useEffect(() => {
    if (rootRef.current) {
      rootRef.current.visible =
        boardBottomHeight !== null &&
        visible &&
        !hideForShadowOnly &&
        !collectionRendersCatalog;
    }
    map.triggerRepaint();
  }, [
    boardBottomHeight,
    collectionRendersCatalog,
    hideForShadowOnly,
    map,
    visible,
  ]);

  useEffect(() => {
    rootRef.current?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        material.transparent = opacity < 1;
        material.opacity = opacity;
        material.depthWrite = opacity === 1;
        material.needsUpdate = true;
      }
    });
    map.triggerRepaint();
  }, [map, opacity]);

  return null;
};
