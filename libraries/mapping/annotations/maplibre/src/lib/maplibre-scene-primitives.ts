import { clamp } from "@carma-commons/math";
import {
  BufferGeometry,
  DoubleSide,
  GreaterDepth,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from "three";
import {
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
  type AnnotationSceneDiscOptions,
  type AnnotationScenePolygonFill,
  type AnnotationScenePolygonFillsHandle,
  type AnnotationScenePrimitiveHandle,
  type AnnotationSceneRingOptions,
} from "@carma-mapping/annotations/core";

import { parseCssColor } from "./css-color";
import {
  MAPLIBRE_AREA_FILL_STYLE_DEFAULTS,
  resolveAreaFillGridPitchMeters,
  type ResolvedMapLibreAreaFillStyle,
} from "./maplibre-area-fill-style";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene";
import {
  resolveCheckerTexture,
  resolveCrosshairTexture,
} from "./maplibre-fill-textures";
import {
  buildPolygonGeometry,
  projectOntoGroundPlane,
} from "./maplibre-polygon-fill-geometry";
import { MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS } from "./maplibre-scene-primitive-defaults";

/**
 * Discs, rings and polygon fills in the shared Three.js scene. The runtime
 * hands over ECEF model matrices and ECEF positions; each primitive carries
 * its geometry relative to an ECEF anchor and is placed every frame by the
 * local affine from ECEF to shared-scene units at that anchor (the three
 * axis derivatives of the shared layer's projection). Across the metres a
 * primitive spans, the Mercator scale is constant to well below a pixel.
 */

const axisScratch = new Vector3();
const anchorScratch = new Vector3();
const basisX = new Vector3();
const basisY = new Vector3();
const basisZ = new Vector3();
const translationScratch = new Vector3();

/** Affine from ECEF to shared-scene units around `anchorECEF`, or null while unprojectable. */
export const resolveSceneFromEcefAffine = (
  scene: MapLibreAnnotationScene,
  anchorECEF: Vector3,
  out: Matrix4 = new Matrix4()
): Matrix4 | null => {
  const anchorScene = scene.sceneFromEcef(anchorECEF, anchorScratch);
  if (!anchorScene) return null;
  const anchorSceneCopy = anchorScene.clone();
  const axis = (x: number, y: number, z: number, target: Vector3) => {
    axisScratch.set(anchorECEF.x + x, anchorECEF.y + y, anchorECEF.z + z);
    const projected = scene.sceneFromEcef(axisScratch, target);
    return projected ? projected.sub(anchorSceneCopy) : null;
  };
  if (
    !axis(1, 0, 0, basisX) ||
    !axis(0, 1, 0, basisY) ||
    !axis(0, 0, 1, basisZ)
  ) {
    return null;
  }
  out.makeBasis(basisX, basisY, basisZ);
  // scene = J · (ecef - anchor) + anchorScene
  translationScratch.copy(anchorECEF).applyMatrix4(out);
  return out.setPosition(anchorSceneCopy.sub(translationScratch));
};

type RingMeshOptions = {
  id: string;
  innerRadiusRatio: number;
  color: string;
  opacity?: number;
  segments?: number;
  modelMatrix: Matrix4;
};

const createRingHandle = (
  scene: MapLibreAnnotationScene,
  options: RingMeshOptions
): AnnotationScenePrimitiveHandle => {
  const { color, opacity } = parseCssColor(options.color);
  const geometry = new RingGeometry(
    clamp(options.innerRadiusRatio, 0, 0.999),
    1,
    options.segments ?? MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.ringSegments
  );
  const material = new MeshBasicMaterial({
    color,
    opacity: opacity * (options.opacity ?? 1),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.ringRenderOrder;
  mesh.userData.annotationPickId = options.id;
  mesh.visible = false;
  scene.root.add(mesh);
  const modelMatrix = options.modelMatrix.clone();
  const anchor = new Vector3();
  const affine = new Matrix4();
  let visible = true;
  let destroyed = false;
  const place = () => {
    anchor.setFromMatrixPosition(modelMatrix);
    const sceneAffine = resolveSceneFromEcefAffine(scene, anchor, affine);
    if (!sceneAffine) {
      mesh.visible = false;
      return;
    }
    mesh.matrix.multiplyMatrices(sceneAffine, modelMatrix);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.visible = visible;
  };
  const unsubscribeFrame = scene.subscribeFrameUpdate(place);
  place();
  scene.requestRender();
  return {
    setModelMatrix: (nextModelMatrix) => {
      if (destroyed || modelMatrix.equals(nextModelMatrix)) return;
      modelMatrix.copy(nextModelMatrix);
      place();
      scene.requestRender();
    },
    setVisible: (nextVisible) => {
      if (destroyed || visible === nextVisible) return;
      visible = nextVisible;
      place();
      scene.requestRender();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      unsubscribeFrame();
      scene.root.remove(mesh);
      geometry.dispose();
      material.dispose();
      scene.requestRender();
    },
  };
};

export const createMapLibreSceneRing = (
  scene: MapLibreAnnotationScene,
  options: AnnotationSceneRingOptions
): AnnotationScenePrimitiveHandle =>
  createRingHandle(scene, {
    id: options.id,
    innerRadiusRatio:
      options.radius > 0 ? (options.innerRadius ?? 0) / options.radius : 0,
    color: options.color,
    opacity: options.opacity,
    segments: options.segments,
    modelMatrix: options.modelMatrix,
  });

export const createMapLibreSceneDisc = (
  scene: MapLibreAnnotationScene,
  options: AnnotationSceneDiscOptions
): AnnotationScenePrimitiveHandle =>
  createRingHandle(scene, {
    id: options.id,
    innerRadiusRatio: 0,
    color: options.color,
    opacity: options.opacity,
    segments: options.segments,
    modelMatrix: options.modelMatrix,
  });

type PolygonFillMesh = {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** The same polygon where the scene is nearer: the fill behind a wall or roof. */
  occludedMesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  anchorECEF: Vector3;
  /** The geometry is relative to the anchor; this puts it back into ECEF before the affine. */
  anchorTranslation: Matrix4;
  /** The screen cell size the crosshair tile was drawn for. */
  crosshairCellCssPx: number;
};

const releaseMap = (material: MeshBasicMaterial) => {
  // The image is shared through the cache, but each clone uploaded its own
  // GPU texture; dispose it or every zoom step leaks one.
  material.map?.dispose();
  material.map = null;
};

/**
 * The visible pass: the checkerboard in the fill colour. The pass behind
 * the surface: hairline crosshairs on the same grid, in the colour of the
 * lighter cells.
 */
const createFillMaterial = (
  color: MeshBasicMaterial["color"],
  opacity: number,
  occluded: boolean,
  style: ResolvedMapLibreAreaFillStyle
) => {
  const material = new MeshBasicMaterial({
    color,
    opacity: occluded
      ? style.crosshairOpacity
      : Math.min(1, opacity * style.visibleOpacityFactor),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  if (occluded) {
    // Hairlines blend; an alpha test would drop them wherever filtering
    // thins a one pixel arm below the threshold.
    material.depthFunc = GreaterDepth;
  } else {
    const checker = resolveCheckerTexture(style);
    if (checker) material.map = checker.clone();
    material.polygonOffset = true;
    material.polygonOffsetFactor =
      MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.polygonOffsetFactor;
    material.polygonOffsetUnits =
      MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.polygonOffsetUnits;
  }
  return material;
};

export const createMapLibreScenePolygonFills = (
  scene: MapLibreAnnotationScene,
  style: ResolvedMapLibreAreaFillStyle = MAPLIBRE_AREA_FILL_STYLE_DEFAULTS
): AnnotationScenePolygonFillsHandle => {
  const meshes: PolygonFillMesh[] = [];
  const affine = new Matrix4();
  let destroyed = false;
  const sceneScratch = new Vector3();
  /** Pitch of the grid for this frame from the style's series; the origin sits in the uv. */
  const placeGrid = (entry: PolygonFillMesh) => {
    const anchorScene = scene.sceneFromEcef(entry.anchorECEF, sceneScratch);
    if (!anchorScene) return;
    const pixelsPerMeter = scene.getPixelsPerMeterAtScene(anchorScene);
    const pitch = resolveAreaFillGridPitchMeters(pixelsPerMeter, style);
    const unit = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.fillGridUvUnitMeters;
    // The checker tile holds two cells per axis, the crosshair tile one;
    // both anchor a cell boundary at the uv origin (the crosshair sits at
    // the tile centre, hence the half-tile shift).
    const checker = entry.mesh.material.map;
    if (checker) {
      const repeat = unit / (2 * pitch);
      checker.repeat.set(repeat, repeat);
      checker.offset.set(0, 0);
    }
    const cellCssPx = Math.max(1, Math.round(pitch * pixelsPerMeter));
    if (cellCssPx !== entry.crosshairCellCssPx) {
      entry.crosshairCellCssPx = cellCssPx;
      releaseMap(entry.occludedMesh.material);
      const crosshair = resolveCrosshairTexture(style, cellCssPx);
      entry.occludedMesh.material.map = crosshair ? crosshair.clone() : null;
      entry.occludedMesh.material.needsUpdate = true;
    }
    const crosshair = entry.occludedMesh.material.map;
    if (crosshair) {
      const repeat = unit / pitch;
      crosshair.repeat.set(repeat, repeat);
      crosshair.offset.set(0.5, 0.5);
    }
  };
  const place = () => {
    for (const entry of meshes) {
      const { mesh, occludedMesh, anchorECEF, anchorTranslation } = entry;
      const sceneAffine = resolveSceneFromEcefAffine(scene, anchorECEF, affine);
      if (!sceneAffine) {
        mesh.visible = false;
        occludedMesh.visible = false;
        continue;
      }
      for (const target of [mesh, occludedMesh]) {
        target.matrix.multiplyMatrices(sceneAffine, anchorTranslation);
        target.matrixWorldNeedsUpdate = true;
        target.visible = true;
      }
      placeGrid(entry);
    }
  };
  const unsubscribeFrame = scene.subscribeFrameUpdate(place);
  const clearMeshes = () => {
    for (const { mesh, occludedMesh } of meshes) {
      scene.root.remove(mesh);
      scene.root.remove(occludedMesh);
      mesh.geometry.dispose();
      releaseMap(mesh.material);
      mesh.material.dispose();
      releaseMap(occludedMesh.material);
      occludedMesh.material.dispose();
    }
    meshes.length = 0;
  };
  return {
    setPolygonFills: (polygonFills: readonly AnnotationScenePolygonFill[]) => {
      if (destroyed) return;
      clearMeshes();
      for (const polygonFill of polygonFills) {
        const ground =
          polygonFill.placement ===
          ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.GROUND;
        const positionsECEF = ground
          ? projectOntoGroundPlane(polygonFill.positionsECEF)
          : polygonFill.positionsECEF;
        const anchorECEF = positionsECEF[0];
        if (!anchorECEF || positionsECEF.length < 3) continue;
        const geometry = buildPolygonGeometry(
          positionsECEF,
          anchorECEF,
          ground
        );
        if (!geometry) continue;
        const { color, opacity } = parseCssColor(polygonFill.fill);
        const mesh = new Mesh(
          geometry,
          createFillMaterial(color, opacity, false, style)
        );
        const occludedMesh = new Mesh(
          geometry,
          createFillMaterial(color, opacity, true, style)
        );
        mesh.renderOrder = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.fillRenderOrder;
        occludedMesh.renderOrder =
          MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.occludedFillRenderOrder;
        for (const target of [mesh, occludedMesh]) {
          target.matrixAutoUpdate = false;
          target.frustumCulled = false;
          target.userData.annotationPickId = polygonFill.id;
          scene.root.add(target);
        }
        meshes.push({
          mesh,
          occludedMesh,
          anchorECEF: anchorECEF.clone(),
          anchorTranslation: new Matrix4().makeTranslation(
            anchorECEF.x,
            anchorECEF.y,
            anchorECEF.z
          ),
          crosshairCellCssPx: 0,
        });
      }
      place();
      scene.requestRender();
    },
    clear: () => {
      if (destroyed) return;
      clearMeshes();
      scene.requestRender();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      unsubscribeFrame();
      clearMeshes();
      scene.requestRender();
    },
  };
};
