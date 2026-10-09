import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  GreaterDepth,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  RingGeometry,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
} from "three";
import {
  createPlaneBasis,
  getLocalUpDirectionAtAnchor,
  getNormalizedTriangleNormal,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationSceneDiscOptions,
  AnnotationScenePolygonFill,
  AnnotationScenePolygonFillsHandle,
  AnnotationScenePolygonFillsOptions,
  AnnotationScenePrimitiveHandle,
  AnnotationSceneRingOptions,
} from "@carma-mapping/annotations/runtime";

import { parseCssColor } from "./css-color";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene";

/**
 * Discs, rings and polygon fills in the shared Three.js scene. The runtime
 * hands over ECEF model matrices and ECEF positions; each primitive carries
 * its geometry relative to an ECEF anchor and is placed every frame by the
 * local affine from ECEF to shared-scene units at that anchor (the three
 * axis derivatives of the shared layer's projection). Across the metres a
 * primitive spans, the Mercator scale is constant to well below a pixel.
 */

export const MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS = Object.freeze({
  ringRenderOrder: 10_000,
  fillRenderOrder: 900,
  occludedFillRenderOrder: 901,
  /**
   * The runtime palette is tuned for Cesium's translucent appearance on
   * flat LOD2 walls; on the textured mesh the same alpha reads too faint.
   */
  visibleFillOpacityFactor: 1.8,
  /** The part of a fill behind the surface: a dot screen in the fill colour. */
  occludedFillOpacityFactor: 2.4,
  /** Dot pitch of that screen in metres of the polygon plane, so it foreshortens with the surface. */
  occludedFillDotPitchMeters: 0.5,
  occludedFillDotRadiusRatio: 0.22,
  occludedFillTextureSize: 64,
  ringSegments: 64,
  /** Fills sit on the surface they measure; pull them a hair toward the camera. */
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

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
    Math.min(Math.max(options.innerRadiusRatio, 0), 0.999),
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
      if (destroyed) return;
      modelMatrix.copy(nextModelMatrix);
      place();
      scene.requestRender();
    },
    setVisible: (nextVisible) => {
      if (destroyed) return;
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

/** Newell's method: the polygon normal without picking three vertices. */
const resolvePolygonNormal = (
  positions: readonly Vector3[]
): Vector3 | null => {
  const normal = new Vector3();
  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index]!;
    const next = positions[(index + 1) % positions.length]!;
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  if (normal.lengthSq() > 0) return normal.normalize();
  return positions.length >= 3
    ? getNormalizedTriangleNormal(positions[0]!, positions[1]!, positions[2]!)
    : null;
};

/** A vertical plane keeps its grid upright: columns plumb, rows level. */
const UPRIGHT_BASIS_MIN_LENGTH = 0.05;

/**
 * Plane axes for the fill: on walls the y axis is the plumb line within the
 * plane so the dot screen reads as rows and columns, on near-horizontal
 * planes the generic basis of the normal.
 */
const resolveFillPlaneBasis = (normal: Vector3, anchorECEF: Vector3) => {
  const up = getLocalUpDirectionAtAnchor(anchorECEF);
  const yAxis = up.clone().addScaledVector(normal, -up.dot(normal));
  if (yAxis.length() < UPRIGHT_BASIS_MIN_LENGTH) {
    return createPlaneBasis(normal);
  }
  yAxis.normalize();
  const xAxis = new Vector3().crossVectors(yAxis, normal).normalize();
  return { xAxis, yAxis };
};

const buildPolygonGeometry = (
  positionsECEF: readonly Vector3[],
  anchorECEF: Vector3
): BufferGeometry | null => {
  const local = positionsECEF.map((position) =>
    position.clone().sub(anchorECEF)
  );
  const normal = resolvePolygonNormal(local);
  if (!normal) return null;
  const { xAxis, yAxis } = resolveFillPlaneBasis(normal, anchorECEF);
  const points2d = local.map(
    (position) => new Vector2(position.dot(xAxis), position.dot(yAxis))
  );
  const triangles = ShapeUtils.triangulateShape(points2d, []);
  if (triangles.length === 0) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      local.flatMap((position) => [position.x, position.y, position.z]),
      3
    )
  );
  // Plane coordinates in metres as texture coordinates: the dot screen of
  // the occluded pass then sits on the surface and foreshortens with it.
  const pitch = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.occludedFillDotPitchMeters;
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(
      points2d.flatMap((point) => [point.x / pitch, point.y / pitch]),
      2
    )
  );
  geometry.setIndex(triangles.flat());
  return geometry;
};

let occludedFillTexture: Texture | null | undefined;

/** One white dot per tile, repeated across the polygon plane; null without a 2D canvas. */
const resolveOccludedFillTexture = (): Texture | null => {
  if (occludedFillTexture !== undefined) return occludedFillTexture;
  const size = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.occludedFillTextureSize;
  const canvas =
    typeof document === "undefined" ? null : document.createElement("canvas");
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas?.getContext("2d") ?? null;
  } catch {
    context = null;
  }
  if (!canvas || !context) {
    occludedFillTexture = null;
    return null;
  }
  canvas.width = size;
  canvas.height = size;
  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(
    size / 2,
    size / 2,
    size * MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.occludedFillDotRadiusRatio,
    0,
    Math.PI * 2
  );
  context.fill();
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  occludedFillTexture = texture;
  return texture;
};

type PolygonFillMesh = {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** The same polygon where the scene is nearer: the fill behind a wall or roof. */
  occludedMesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  anchorECEF: Vector3;
  /** The geometry is relative to the anchor; this puts it back into ECEF before the affine. */
  anchorTranslation: Matrix4;
};

const createFillMaterial = (
  color: MeshBasicMaterial["color"],
  opacity: number,
  occluded: boolean
) => {
  const material = new MeshBasicMaterial({
    color,
    opacity: Math.min(
      1,
      opacity *
        (occluded
          ? MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.occludedFillOpacityFactor
          : MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.visibleFillOpacityFactor)
    ),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  if (occluded) {
    material.depthFunc = GreaterDepth;
    material.map = resolveOccludedFillTexture();
    material.alphaTest = 0.5;
  } else {
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
  _options: AnnotationScenePolygonFillsOptions = {}
): AnnotationScenePolygonFillsHandle => {
  const meshes: PolygonFillMesh[] = [];
  const affine = new Matrix4();
  let destroyed = false;
  const place = () => {
    for (const {
      mesh,
      occludedMesh,
      anchorECEF,
      anchorTranslation,
    } of meshes) {
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
    }
  };
  const unsubscribeFrame = scene.subscribeFrameUpdate(place);
  const clearMeshes = () => {
    for (const { mesh, occludedMesh } of meshes) {
      scene.root.remove(mesh);
      scene.root.remove(occludedMesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      occludedMesh.material.dispose();
    }
    meshes.length = 0;
  };
  return {
    setPolygonFills: (polygonFills: readonly AnnotationScenePolygonFill[]) => {
      if (destroyed) return;
      clearMeshes();
      for (const polygonFill of polygonFills) {
        const anchorECEF = polygonFill.positionsECEF[0];
        if (!anchorECEF || polygonFill.positionsECEF.length < 3) continue;
        const geometry = buildPolygonGeometry(
          polygonFill.positionsECEF,
          anchorECEF
        );
        if (!geometry) continue;
        const { color, opacity } = parseCssColor(polygonFill.fill);
        const mesh = new Mesh(geometry, createFillMaterial(color, opacity, false));
        const occludedMesh = new Mesh(
          geometry,
          createFillMaterial(color, opacity, true)
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
