import { ConeGeometry, Mesh } from "three";
import type {
  AnnotationSceneConeOptions,
  AnnotationScenePrimitiveHandle,
} from "@carma-mapping/annotations/core";
import { PI_OVER_TWO } from "@carma-units";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  CONE_PASS,
  createConeMaterial,
  createConeOutlineUniforms,
  setConeOutlinePixelRatio,
} from "./maplibre-scene-cone-material";
import { MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS } from "./maplibre-scene-defaults";
import { createModelMatrixPrimitiveHandle } from "./maplibre-scene-primitives";

const DEFAULT_OUTLINE_WIDTH_CSS_PX = 1.5;

/** The unit cone of the contract: base radius 1 in the xy plane, apex at z = 1. */
export const createUnitConeGeometry = (segments: number) =>
  new ConeGeometry(1, 1, segments, 1, false)
    .rotateX(PI_OVER_TWO)
    .translate(0, 0, 0.5);

/**
 * A solid cone in the shared scene, in the framebuffer and depth of the
 * scene lines: one draw depth-tested and shaded, one where the scene is
 * nearer that only draws the outline, dotted (see the cone material).
 */
export const createMapLibreSceneCone = (
  scene: MapLibreAnnotationScene,
  options: AnnotationSceneConeOptions
): AnnotationScenePrimitiveHandle => {
  const geometry = createUnitConeGeometry(
    options.segments ?? MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.coneSegments
  );
  const uniforms = createConeOutlineUniforms(options.outlineColor);
  const outlineWidth = options.outlineWidth ?? DEFAULT_OUTLINE_WIDTH_CSS_PX;
  const fillOpacity = options.opacity ?? 1;
  const visibleMesh = new Mesh(
    geometry,
    createConeMaterial(options.color, fillOpacity, uniforms, CONE_PASS.VISIBLE)
  );
  const occludedMesh = new Mesh(
    geometry,
    createConeMaterial(options.color, fillOpacity, uniforms, CONE_PASS.OCCLUDED)
  );
  visibleMesh.renderOrder = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.coneRenderOrder;
  occludedMesh.renderOrder =
    MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.occludedConeRenderOrder;
  visibleMesh.userData.annotationPickId = options.id;
  occludedMesh.userData.annotationPickId = options.id;
  const syncPixelRatio = () =>
    setConeOutlinePixelRatio(uniforms, outlineWidth, scene.getPixelRatio());
  syncPixelRatio();
  const unsubscribePixelRatio = scene.subscribeFrameUpdate(syncPixelRatio);
  return createModelMatrixPrimitiveHandle(
    scene,
    [visibleMesh, occludedMesh],
    options.modelMatrix,
    () => {
      unsubscribePixelRatio();
      geometry.dispose();
      visibleMesh.material.dispose();
      occludedMesh.material.dispose();
    }
  );
};
