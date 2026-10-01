import * as THREE from "three";

import { clamp } from "@carma-commons/math";
import {
  getGenericThreeLayers,
  type SharedThreeSceneLayer,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";

import { SHADOW_SCENE_USER_DATA } from "../core/shadow-types";
import { configureReceiverPlaneShadow } from "./shadow-receiver-plane-material";

export type ShadowBuildingAppearance = Readonly<{
  fullOpacity: boolean;
  uniformColor: string | null;
  uniformColorMix?: number;
  textureSaturation?: number;
  textureColorCorrection?: boolean;
}>;

export type GenericThreeLayer = ReturnType<
  typeof getGenericThreeLayers
>[number];

export type GenericThreeShadowBridge = {
  runtime: SharedThreeSceneRuntime;
  sync: () => void;
  updateBuildingAppearance: (appearance: ShadowBuildingAppearance) => void;
};

const makeMeshShadeable = (mesh: THREE.Mesh, receiverPlane = false) => {
  if (mesh.userData[SHADOW_SCENE_USER_DATA.OVERLAY]) return;
  mesh.castShadow = mesh.userData.disableShadowCasting !== true;
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  // Geometry-only offscreen GLTF placeholders deliberately write no colour.
  // Do not promote them to receivers: their unlit/depthless materials would
  // block the entire corridor accumulator despite contributing only occlusion.
  mesh.receiveShadow = materials.some(
    (material) => material.visible && material.colorWrite
  );
  // Closed solids default to casting from both faces, so a sun-facing wall
  // shadows the ground under a solid that does not sit flush on the terrain.
  // Tile runtimes can provide a topology-derived side before they join the
  // shared scene; keep that ground truth instead of replacing it here.
  for (const material of materials) {
    if (mesh.userData.isShadowTerrainSurface) {
      configureReceiverPlaneShadow(material, true);
    } else {
      material.shadowSide ??= THREE.DoubleSide;
      configureReceiverPlaneShadow(material, receiverPlane);
    }
  }
};

export const makeSceneMeshesShadeable = (
  scene: THREE.Object3D,
  receiverPlane = false
) => {
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    makeMeshShadeable(mesh, receiverPlane);
  });
};

const materialIsVisible = (material: THREE.Material): boolean =>
  material.visible && material.opacity > 0;

const meshIsVisible = (mesh: THREE.Mesh, scene: THREE.Scene): boolean => {
  let current: THREE.Object3D | null = mesh;
  while (current && current !== scene) {
    if (!current.visible) return false;
    current = current.parent;
  }
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials.some(materialIsVisible);
};

const disposeCopiedMaterials = (root: THREE.Object3D) => {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      material.dispose();
    }
  });
};

const applyBuildingAppearance = (
  root: THREE.Object3D,
  appearance: ShadowBuildingAppearance
) => {
  const useUniformColor =
    appearance.uniformColor !== null &&
    clamp(appearance.uniformColorMix ?? 1, 0, 1) >= 1;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.userData.isBuilding) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (appearance.fullOpacity) {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
      }
      const colorMaterial = material as THREE.Material & {
        color?: THREE.Color;
        vertexColors?: boolean;
      };
      if (useUniformColor && appearance.uniformColor && colorMaterial.color) {
        colorMaterial.color.set(appearance.uniformColor);
        colorMaterial.vertexColors = false;
      }
      material.needsUpdate = true;
    }
  });
};

export const buildGenericThreeShadowBridge = (
  sharedLayer: SharedThreeSceneLayer,
  layer: GenericThreeLayer,
  initialBuildingAppearance: ShadowBuildingAppearance
): GenericThreeShadowBridge | null => {
  const origin = layer._originMerc?.toLngLat();
  if (!origin) return null;

  const root = new THREE.Group();
  root.name = `shadow-simulation-copy-${layer.id}`;
  const originalVisibility = new Map<THREE.Object3D, boolean>();
  let buildingAppearance = initialBuildingAppearance;
  let disposed = false;

  const restoreOriginals = () => {
    for (const [object, visible] of originalVisibility) {
      object.visible = visible;
    }
    originalVisibility.clear();
  };

  const sync = () => {
    if (disposed) return;
    restoreOriginals();
    disposeCopiedMaterials(root);
    root.clear();
    layer.scene.updateMatrixWorld(true);
    const sourceMeshes: THREE.Mesh[] = [];
    layer.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
        return;
      }
      if (!mesh.geometry?.getAttribute("position")?.count) return;
      if (!meshIsVisible(mesh, layer.scene)) return;
      sourceMeshes.push(mesh);
    });
    for (const source of sourceMeshes) {
      const copy = source.clone(false) as THREE.Mesh;
      copy.name = `${source.name || "mesh"}-shadow-simulation-copy`;
      copy.visible = true;
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(source.matrixWorld);
      copy.material = Array.isArray(source.material)
        ? source.material.map((material) => material.clone())
        : source.material.clone();
      makeMeshShadeable(copy);
      originalVisibility.set(source, source.visible);
      source.visible = false;
      root.add(copy);
    }
    root.visible = root.children.length > 0;
    applyBuildingAppearance(root, buildingAppearance);
  };

  const runtime: SharedThreeSceneRuntime = {
    id: `shadow-simulation-generic-${layer.id}`,
    originLngLat: [origin.lng, origin.lat],
    root,
    update: () => undefined,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      restoreOriginals();
      disposeCopiedMaterials(root);
      root.clear();
    },
  };
  sync();
  if (!root.visible) {
    runtime.dispose();
    return null;
  }
  sharedLayer.addRuntime(runtime);
  return {
    runtime,
    sync,
    updateBuildingAppearance(appearance) {
      buildingAppearance = appearance;
      sync();
    },
  };
};
