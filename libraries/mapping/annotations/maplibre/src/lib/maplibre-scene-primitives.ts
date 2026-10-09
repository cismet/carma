import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  GreaterDepth,
  LinearFilter,
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
import { getFromWGS84ToUTM32 } from "@carma-geo/proj";
import {
  createPlaneBasis,
  geographicCoordinateFromEcef,
  getLocalUpDirectionAtAnchor,
  getNormalizedTriangleNormal,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT,
  type AnnotationSceneDiscOptions,
  type AnnotationScenePolygonFill,
  type AnnotationScenePolygonFillsHandle,
  type AnnotationScenePolygonFillsOptions,
  type AnnotationScenePrimitiveHandle,
  type AnnotationSceneRingOptions,
} from "@carma-mapping/annotations/runtime";

import { parseCssColor } from "./css-color";
import {
  MAPLIBRE_AREA_FILL_STYLE_DEFAULTS,
  resolveAreaFillGridPitchMeters,
  type ResolvedMapLibreAreaFillStyle,
} from "./maplibre-area-fill-style";
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
  /** Pattern tiles are drawn at this size and stretched to the grid pitch. */
  fillGridTextureSize: 64,
  /** The geometry's uv unit in metres; the texture repeat maps it to the pitch. */
  fillGridUvUnitMeters: 1,
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

/**
 * A ground area lies in the local tangent plane through its lowest corner:
 * the fill is flat on the courtyard even where a corner caught a kerb or a
 * roof edge, as the ground measurement itself is a planar figure.
 */
const projectOntoGroundPlane = (
  positionsECEF: readonly Vector3[]
): Vector3[] => {
  if (positionsECEF.length === 0) return [];
  let anchor = positionsECEF[0]!;
  for (const position of positionsECEF) {
    if (position.lengthSq() < anchor.lengthSq()) anchor = position;
  }
  const up = getLocalUpDirectionAtAnchor(anchor);
  return positionsECEF.map((position) => {
    const offset = position.clone().sub(anchor);
    return anchor.clone().add(offset.addScaledVector(up, -offset.dot(up)));
  });
};

/** An edge counts as level while its rise stays within this share of its length, or 0.3 m. */
const LEVEL_EDGE_MAX_RISE_RATIO = 0.1;
const LEVEL_EDGE_MAX_RISE_METERS = 0.3;

/**
 * The grid of a roof or wall starts at its lowest level edge: the eaves of
 * a roof, the base of a wall. The x axis runs along that edge from its
 * first corner, the y axis lies in the plane and points upward where the
 * plane has an upward direction.
 */
const resolveLowestEdgeFrame = (
  local: readonly Vector3[],
  normal: Vector3,
  anchorECEF: Vector3
): { xAxis: Vector3; yAxis: Vector3; origin: Vector3 } => {
  const up = getLocalUpDirectionAtAnchor(anchorECEF);
  const heights = local.map((position) => position.dot(up));
  let best: { index: number; mean: number; level: boolean } | null = null;
  for (let index = 0; index < local.length; index += 1) {
    const next = (index + 1) % local.length;
    const length = local[index]!.distanceTo(local[next]!);
    if (!(length > 0)) continue;
    const rise = Math.abs(heights[next]! - heights[index]!);
    const level =
      rise <= Math.max(LEVEL_EDGE_MAX_RISE_METERS, length * LEVEL_EDGE_MAX_RISE_RATIO);
    const mean = (heights[index]! + heights[next]!) / 2;
    if (
      !best ||
      (level && !best.level) ||
      (level === best.level && mean < best.mean)
    ) {
      best = { index, mean, level };
    }
  }
  const index = best?.index ?? 0;
  const next = (index + 1) % local.length;
  const xAxis = local[next]!.clone().sub(local[index]!);
  xAxis.addScaledVector(normal, -xAxis.dot(normal));
  if (!(xAxis.lengthSq() > 0)) {
    const basis = createPlaneBasis(normal);
    return { xAxis: basis.xAxis, yAxis: basis.yAxis, origin: local[index]!.clone() };
  }
  xAxis.normalize();
  const yAxis = new Vector3().crossVectors(normal, xAxis).normalize();
  if (yAxis.dot(up) < -1e-3) {
    xAxis.negate();
    yAxis.negate();
    return { xAxis, yAxis, origin: local[next]!.clone() };
  }
  return { xAxis, yAxis, origin: local[index]!.clone() };
};

/**
 * Texture coordinates of a ground area in UTM zone 32 metres, so its grid
 * lines fall on the UTM grid, relative to the kilometre corner below the
 * anchor to keep the float32 attribute exact.
 */
const resolveGroundUv = (
  positionsECEF: readonly Vector3[],
  anchorECEF: Vector3
): Vector2[] => {
  const toUtm = (position: Vector3) => {
    const geographic = geographicCoordinateFromEcef(position);
    const [easting, northing] = getFromWGS84ToUTM32([
      geographic.longitude,
      geographic.latitude,
    ] as Parameters<typeof getFromWGS84ToUTM32>[0]);
    return new Vector2(easting, northing);
  };
  const anchor = toUtm(anchorECEF);
  const kilometre = new Vector2(
    Math.floor(anchor.x / 1000) * 1000,
    Math.floor(anchor.y / 1000) * 1000
  );
  return positionsECEF.map((position) => toUtm(position).sub(kilometre));
};

const buildPolygonGeometry = (
  positionsECEF: readonly Vector3[],
  anchorECEF: Vector3,
  ground: boolean
): BufferGeometry | null => {
  const local = positionsECEF.map((position) =>
    position.clone().sub(anchorECEF)
  );
  const normal = resolvePolygonNormal(local);
  if (!normal) return null;
  const frame = resolveLowestEdgeFrame(local, normal, anchorECEF);
  const points2d = local.map(
    (position) =>
      new Vector2(
        position.clone().sub(frame.origin).dot(frame.xAxis),
        position.clone().sub(frame.origin).dot(frame.yAxis)
      )
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
  // Grid metres as texture coordinates: the pattern sits on the surface and
  // foreshortens with it, the texture repeat maps metres to the pitch of
  // the frame. Roofs and walls count from their lowest level edge, ground
  // areas from the UTM grid.
  const unit = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.fillGridUvUnitMeters;
  const gridPoints = ground ? resolveGroundUv(positionsECEF, anchorECEF) : points2d;
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute(
      gridPoints.flatMap((point) => [point.x / unit, point.y / unit]),
      2
    )
  );
  geometry.setIndex(triangles.flat());
  return geometry;
};

/**
 * Pattern tiles, one per style and screen scale, shared by every fill that
 * uses them; a material clones its texture because repeat and offset live
 * on the texture. Null without a 2D canvas (tests).
 */
const fillTextureCache = new Map<string, Texture | null>();

const createPatternTexture = (
  key: string,
  draw: (context: CanvasRenderingContext2D, size: number) => void,
  options: { mipmaps?: boolean } = {}
): Texture | null => {
  const cached = fillTextureCache.get(key);
  if (cached !== undefined) return cached;
  const size = MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.fillGridTextureSize;
  const canvas =
    typeof document === "undefined" ? null : document.createElement("canvas");
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas?.getContext("2d") ?? null;
  } catch {
    context = null;
  }
  if (!canvas || !context) {
    fillTextureCache.set(key, null);
    return null;
  }
  canvas.width = size;
  canvas.height = size;
  context.clearRect(0, 0, size, size);
  draw(context, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  if (options.mipmaps === false) {
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
  }
  fillTextureCache.set(key, texture);
  return texture;
};

/** Two by two cells per tile, the diagonal pair at full alpha, the others darker. */
const resolveCheckerTexture = (style: ResolvedMapLibreAreaFillStyle) =>
  createPatternTexture(`checker:${style.checkerDarkShare}`, (context, size) => {
    const half = size / 2;
    context.fillStyle = `rgba(255, 255, 255, ${style.checkerDarkShare})`;
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, half, half);
    context.fillRect(half, half, half, half);
  });

/**
 * One crosshair per tile, centred, with arms and line width that come out
 * at the configured CSS pixels for a cell of `cellCssPx` on screen. The
 * tile is placed so its centre sits on a grid corner.
 */
const resolveCrosshairTexture = (
  style: ResolvedMapLibreAreaFillStyle,
  cellCssPx: number
) => {
  const cell = Math.max(1, Math.round(cellCssPx));
  return createPatternTexture(
    `crosshair:${style.crosshairArmCssPx}:${style.crosshairWidthCssPx}:${cell}`,
    (context, size) => {
      const arm = Math.min(size / 2, (style.crosshairArmCssPx / cell) * size);
      const width = Math.max(1, (style.crosshairWidthCssPx / cell) * size);
      const centre = size / 2;
      context.fillStyle = "#ffffff";
      context.fillRect(centre - arm, centre - width / 2, arm * 2, width);
      context.fillRect(centre - width / 2, centre - arm, width, arm * 2);
    },
    // The tile is redrawn per screen cell size, so it is viewed near its own
    // scale; mipmaps would only average the hairlines away on foreshortened walls.
    { mipmaps: false }
  );
};

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
    opacity: Math.min(1, opacity * style.visibleOpacityFactor),
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  if (occluded) {
    // Hairlines blend; an alpha test would drop them wherever filtering
    // thins a one pixel arm below the threshold.
    material.depthFunc = GreaterDepth;
    material.opacity = style.crosshairOpacity;
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
  _options: AnnotationScenePolygonFillsOptions = {},
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
          polygonFill.placement === ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.GROUND;
        const positionsECEF = ground
          ? projectOntoGroundPlane(polygonFill.positionsECEF)
          : polygonFill.positionsECEF;
        const anchorECEF = positionsECEF[0];
        if (!anchorECEF || positionsECEF.length < 3) continue;
        const geometry = buildPolygonGeometry(positionsECEF, anchorECEF, ground);
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
