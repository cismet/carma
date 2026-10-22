import type { Map as MaplibreMap, PointLike } from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

import {
  acquireSharedThreeScene,
  registerSharedThreeSceneRuntime,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import { degToRadNumeric } from "@carma-units";

/** the tint a highlighted model glows in, the selection blue of the styles */
const HIGHLIGHT_COLOR = new THREE.Color("#3A7CEB");
const HIGHLIGHT_INTENSITY = 0.6;

const templates = new Map<string, Promise<THREE.Group>>();
let loader: GLTFLoader | null = null;

const getLoader = (): GLTFLoader => {
  loader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(
    new DRACOLoader().setDecoderPath(
      new URL(
        "assets/draco/",
        new URL(import.meta.env.BASE_URL, globalThis.location.origin)
      ).href
    )
  );
  return loader;
};

/** one download per url; a failed one is forgotten so a later mount retries */
const loadTemplate = (url: string): Promise<THREE.Group> => {
  let template = templates.get(url);
  if (!template) {
    template = getLoader()
      .loadAsync(url)
      .then((gltf) => gltf.scene)
      .catch((error: unknown) => {
        templates.delete(url);
        throw error;
      });
    templates.set(url, template);
  }
  return template;
};

export type GlbModelPlacement = {
  /** runtime id in the shared scene, unique per map */
  id: string;
  url: string;
  lngLat: [number, number];
  /** meters above the ellipsoid, as Cesium places it */
  height: number;
  /** degrees clockwise from north, as Cesium reads it */
  heading: number;
  /** asked every frame; true tints the model */
  isHighlighted?: () => boolean;
};

export type GlbModelHandle = {
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
  /** distance to the nearest hit at a screen point, or null for a miss */
  raycast: (point: PointLike) => number | null;
  dispose: () => void;
};

type MaterialWithEmissive = THREE.Material & {
  emissive?: THREE.Color;
  emissiveIntensity?: number;
};

const meshMaterials = (root: THREE.Object3D): MaterialWithEmissive[] => {
  const materials: MaterialWithEmissive[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.push(material);
    }
  });
  return materials;
};

/**
 * A GLB placed in the map's shared three.js scene at a Cesium georeference.
 * The model starts hidden; the template is shared per url, the materials are
 * the instance's own, so opacity and tint stay per model.
 */
export const mountGlbModel = (
  map: MaplibreMap,
  placement: GlbModelPlacement
): GlbModelHandle => {
  const lease = acquireSharedThreeScene(map);
  const root = new THREE.Group();
  root.name = placement.id;
  root.visible = false;

  let opacity = 1;
  let highlighted = false;
  let camera: THREE.Camera | null = null;
  const originalEmissive = new Map<
    MaterialWithEmissive,
    { color: THREE.Color; intensity: number }
  >();

  const applyOpacity = () => {
    for (const material of meshMaterials(root)) {
      material.transparent = opacity < 1;
      material.opacity = opacity;
      material.depthWrite = opacity === 1;
      material.needsUpdate = true;
    }
  };

  const applyHighlight = () => {
    for (const material of meshMaterials(root)) {
      if (!material.emissive) {
        continue;
      }
      if (!originalEmissive.has(material)) {
        originalEmissive.set(material, {
          color: material.emissive.clone(),
          intensity: material.emissiveIntensity ?? 1,
        });
      }
      const original = originalEmissive.get(material)!;
      material.emissive.copy(highlighted ? HIGHLIGHT_COLOR : original.color);
      material.emissiveIntensity = highlighted
        ? HIGHLIGHT_INTENSITY
        : original.intensity;
    }
  };

  const runtime: SharedThreeSceneRuntime = {
    id: placement.id,
    originLngLat: placement.lngLat,
    root,
    update: (frame) => {
      camera = frame.renderCamera;
      const origin = lease.layer.projectLngLatToScene(
        placement.lngLat,
        placement.height
      );
      if (origin) {
        root.position.copy(origin);
      }
      const nextHighlighted = placement.isHighlighted?.() ?? false;
      if (nextHighlighted !== highlighted) {
        highlighted = nextHighlighted;
        applyHighlight();
      }
    },
    dispose: () => {
      for (const material of meshMaterials(root)) {
        material.dispose();
      }
      root.clear();
    },
  };
  lease.layer.addRuntime(runtime);
  const unregister = registerSharedThreeSceneRuntime(map, runtime);
  let disposed = false;

  void loadTemplate(placement.url)
    .then((template) => {
      if (disposed) {
        return;
      }
      const model = template.clone(true);
      // Cesium's heading is measured clockwise from north. A GLB's long axis
      // is local +Z (south here); Three's Y rotation has the opposite sign in
      // this east/up/south scene.
      model.rotation.y = degToRadNumeric(90 - placement.heading);
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.material = Array.isArray(object.material)
            ? object.material.map((material) => material.clone())
            : object.material.clone();
        }
      });
      root.add(model);
      applyOpacity();
      applyHighlight();
      map.triggerRepaint();
    })
    .catch((error: unknown) => {
      if (!disposed) {
        console.error("[TILTED MODELS] GLB", placement.url, error);
      }
    });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  return {
    setVisible: (visible) => {
      if (root.visible === visible) {
        return;
      }
      root.visible = visible;
      map.triggerRepaint();
    },
    setOpacity: (next) => {
      if (opacity === next) {
        return;
      }
      opacity = next;
      applyOpacity();
      map.triggerRepaint();
    },
    raycast: (point) => {
      if (!camera || !root.visible || root.children.length === 0) {
        return null;
      }
      const canvas = map.getCanvas();
      const [x, y] = Array.isArray(point) ? point : [point.x, point.y];
      ndc.set(
        (x / canvas.clientWidth) * 2 - 1,
        -(y / canvas.clientHeight) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      root.updateWorldMatrix(true, true);
      return raycaster.intersectObject(root, true)[0]?.distance ?? null;
    },
    dispose: () => {
      disposed = true;
      unregister();
      if (lease.layer.hasRuntime(runtime.id)) {
        lease.layer.removeRuntime(runtime.id);
      }
      lease.release();
    },
  };
};
