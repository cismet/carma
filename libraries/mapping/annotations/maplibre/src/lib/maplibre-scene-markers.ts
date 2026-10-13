import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Mesh,
  Vector3,
  type InstancedBufferGeometry,
  type ShaderMaterial,
} from "three";
import type {
  AnnotationSceneMarkerCollection,
  AnnotationSceneMarkerHandle,
  AnnotationSceneMarkerOptions,
  AnnotationSceneMarkerStyle,
} from "@carma-mapping/annotations/core";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  MARKER_INSTANCE_ATTRIBUTES,
  createMarkerMaterial,
  createMarkerQuadGeometry,
  createMarkerUniforms,
} from "./maplibre-scene-marker-material";
import {
  packSceneMarkerStyle,
  type PackedSceneMarkerStyle,
} from "./maplibre-scene-marker-style";
import { MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS } from "./maplibre-scene-defaults";

/**
 * Screen-constant markers in the shared Three.js scene: one instanced quad
 * per marker, expanded on screen around its node and drawn whole over the
 * scene in the look its style picks (see the marker material). One draw per
 * collection, whatever the number of markers. The instance buffers are
 * rewritten before each frame and uploaded only where a value changed.
 */

type MarkerEntry = {
  id: string;
  positionECEF: Vector3;
  acrossECEF: Vector3 | null;
  packed: PackedSceneMarkerStyle;
  visible: boolean;
};

type AttributeName = keyof typeof MARKER_INSTANCE_ATTRIBUTES;

const MIN_CAPACITY = 16;
/** Scene direction of a bar's edge from a step of this many metres. */
const ACROSS_STEP_METERS = 1;

const centerScratch = new Vector3();
const aheadECEF = new Vector3();
const aheadScene = new Vector3();

export const createMapLibreSceneMarkerCollection = (
  scene: MapLibreAnnotationScene
): AnnotationSceneMarkerCollection => {
  const entries = new Set<MarkerEntry>();
  const uniforms = createMarkerUniforms();
  const geometry: InstancedBufferGeometry = createMarkerQuadGeometry();
  const mesh = new Mesh(geometry, createMarkerMaterial(uniforms));
  mesh.renderOrder = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.markerRenderOrder;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  // the overlay holds the hit areas; the quad is no pick target
  mesh.raycast = () => {};
  scene.root.add(mesh);
  const arrays = {} as Record<AttributeName, Float32Array>;
  let capacity = 0;
  let destroyed = false;

  const allocate = (needed: number) => {
    if (needed <= capacity) return;
    capacity = Math.max(MIN_CAPACITY, needed * 2);
    // Release the old buffers before larger ones replace them.
    geometry.dispose();
    for (const [name, itemSize] of Object.entries(MARKER_INSTANCE_ATTRIBUTES)) {
      const array = new Float32Array(capacity * itemSize);
      arrays[name as AttributeName] = array;
      const attribute = new InstancedBufferAttribute(array, itemSize);
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
    }
  };

  /** Writes the values at `slot`; true when one of them changed. */
  const writeSlot = (
    name: AttributeName,
    slot: number,
    values: ArrayLike<number>
  ) => {
    const array = arrays[name];
    const offset = slot * MARKER_INSTANCE_ATTRIBUTES[name];
    let changed = false;
    for (let index = 0; index < values.length; index += 1) {
      const value = Math.fround(values[index]!);
      if (array[offset + index] !== value) {
        array[offset + index] = value;
        changed = true;
      }
    }
    if (changed) {
      (geometry.getAttribute(name) as InstancedBufferAttribute).needsUpdate =
        true;
    }
    return changed;
  };

  const writePlacement = (entry: MarkerEntry, slot: number): boolean => {
    const center = scene.sceneFromEcef(entry.positionECEF, centerScratch);
    if (!center) return false;
    let across: readonly number[] = [0, 0, 0];
    if (entry.acrossECEF && entry.acrossECEF.lengthSq() > 0) {
      aheadECEF
        .copy(entry.acrossECEF)
        .setLength(ACROSS_STEP_METERS)
        .add(entry.positionECEF);
      const ahead = scene.sceneFromEcef(aheadECEF, aheadScene);
      if (ahead) {
        ahead.sub(center);
        across = [ahead.x, ahead.y, ahead.z];
      }
    }
    writeSlot("markerCenter", slot, [center.x, center.y, center.z]);
    writeSlot("markerAcross", slot, across);
    return true;
  };

  /** Slots of the markers drawn this frame, in insertion order. */
  const slots = new Map<MarkerEntry, number>();

  const layout = () => {
    slots.clear();
    allocate(entries.size);
    let count = 0;
    for (const entry of entries) {
      if (!entry.visible || !writePlacement(entry, count)) continue;
      const { packed } = entry;
      writeSlot("markerShape", count, packed.shape);
      writeSlot("markerFill", count, packed.fill);
      writeSlot("markerOutline", count, packed.outline);
      writeSlot("markerRing", count, packed.ring);
      writeSlot("markerLook", count, packed.look);
      slots.set(entry, count);
      count += 1;
    }
    geometry.instanceCount = count;
    mesh.visible = count > 0;
    const frame = scene.getFrame();
    if (frame) uniforms.markerViewport.value.copy(frame.viewport);
    uniforms.markerPixelRatio.value = scene.getPixelRatio();
  };

  const unsubscribeFrame = scene.subscribeFrameUpdate(layout);

  const relayout = () => {
    if (destroyed) return;
    layout();
    scene.requestRender();
  };

  return {
    addMarker: (
      options: AnnotationSceneMarkerOptions
    ): AnnotationSceneMarkerHandle => {
      const entry: MarkerEntry = {
        id: options.id,
        positionECEF: options.positionECEF.clone(),
        acrossECEF: options.acrossECEF?.clone() ?? null,
        packed: packSceneMarkerStyle(options),
        visible: options.visible ?? true,
      };
      // Laid out with the next frame, so a batch of adds costs one layout.
      entries.add(entry);
      scene.requestRender();
      let removed = false;
      let style: AnnotationSceneMarkerStyle = options;
      return {
        id: options.id,
        setPosition: (positionECEF, acrossECEF) => {
          if (removed || destroyed) return;
          const acrossUnchanged = acrossECEF
            ? entry.acrossECEF?.equals(acrossECEF) === true
            : entry.acrossECEF === null;
          if (entry.positionECEF.equals(positionECEF) && acrossUnchanged) {
            return;
          }
          entry.positionECEF.copy(positionECEF);
          entry.acrossECEF = acrossECEF ? acrossECEF.clone() : null;
          // Placed before the draw (the runtime places in the pre-render
          // hook, after this frame's layout): write the slot directly.
          const slot = slots.get(entry);
          const placed = slot !== undefined && writePlacement(entry, slot);
          if (!placed && entry.visible) layout();
          scene.requestRender();
        },
        setStyle: (nextStyle) => {
          if (removed || destroyed || nextStyle === style) return;
          style = nextStyle;
          entry.packed = packSceneMarkerStyle(nextStyle);
          relayout();
        },
        setVisible: (visible) => {
          if (removed || destroyed || entry.visible === visible) return;
          entry.visible = visible;
          relayout();
        },
        destroy: () => {
          if (removed) return;
          removed = true;
          entries.delete(entry);
          slots.delete(entry);
          scene.requestRender();
        },
      };
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      unsubscribeFrame();
      entries.clear();
      scene.root.remove(mesh);
      (mesh.material as ShaderMaterial).dispose();
      geometry.dispose();
      scene.requestRender();
    },
  };
};
