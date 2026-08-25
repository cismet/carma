import type { Map as MaplibreMap } from "maplibre-gl";
import type * as THREE from "three";

import type { GenericCustomLayer } from "@carma-mapping/engines/threejs";

import { add3dPresence, remove3dPresence } from "../../../utils/threeDPresence";

const layersByMap = new WeakMap<MaplibreMap, GenericCustomLayer[]>();
const listenersByMap = new WeakMap<MaplibreMap, Set<() => void>>();

const emitGenericThreeLayerChange = (map: MaplibreMap) => {
  for (const listener of listenersByMap.get(map) ?? []) listener();
};

const materialIsVisible = (material: THREE.Material): boolean =>
  material.visible && material.opacity > 0;

const objectHasRenderableGeometry = (object: THREE.Object3D): boolean => {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
    return false;
  }
  if (!mesh.geometry?.getAttribute("position")?.count) return false;
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials.some(materialIsVisible);
};

export const genericThreeLayerHasShadeableContent = (
  layer: GenericCustomLayer
): boolean => {
  if (!layer.scene) return false;
  let hasContent = false;
  layer.scene.traverseVisible((object) => {
    if (!hasContent && objectHasRenderableGeometry(object)) hasContent = true;
  });
  return hasContent;
};

export const getGenericThreeLayers = (map: MaplibreMap): GenericCustomLayer[] =>
  layersByMap.get(map) ?? [];

export const registerGenericThreeLayer = (
  map: MaplibreMap,
  layer: GenericCustomLayer
): void => {
  const layers = layersByMap.get(map) ?? [];
  if (layers.includes(layer)) return;
  layersByMap.set(map, [...layers, layer]);
  // What lets the camera restriction and terrain button know the map has
  // become three dimensional, see utils/threeDPresence.
  add3dPresence(map, layer.id);
  emitGenericThreeLayerChange(map);
};

export const unregisterGenericThreeLayer = (
  map: MaplibreMap,
  layer: GenericCustomLayer
): void => {
  const layers = layersByMap.get(map) ?? [];
  const nextLayers = layers.filter((candidate) => candidate !== layer);
  if (nextLayers.length === layers.length) return;
  remove3dPresence(map, layer.id);
  if (nextLayers.length > 0) layersByMap.set(map, nextLayers);
  else layersByMap.delete(map);
  emitGenericThreeLayerChange(map);
};

export const notifyGenericThreeLayerContentChanged = (map: MaplibreMap): void =>
  emitGenericThreeLayerChange(map);

export const subscribeGenericThreeLayers = (
  map: MaplibreMap,
  listener: () => void
): (() => void) => {
  const listeners = listenersByMap.get(map) ?? new Set<() => void>();
  listeners.add(listener);
  listenersByMap.set(map, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByMap.delete(map);
  };
};
