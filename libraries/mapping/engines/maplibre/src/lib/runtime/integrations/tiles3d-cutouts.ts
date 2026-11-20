import * as THREE from "three";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";

import { acquireSharedThreeScene } from "./shared-three-scene-registry";

/**
 * Polygons cut out of every 3D tileset on a map: whatever a tile draws inside
 * them is discarded, from the ground up, so something else can take its place
 * (a planned scenario in carma plan). The cut is a vertical prism over the
 * polygon, not a clip against a height.
 *
 * The polygons are drawn white on black into one mask texture over their
 * common bounding box in Web Mercator, and the tile shaders
 * (`three-tiles-runtime-projection.ts`) sample it at each fragment's scene x/z.
 * One mask serves every cut on the map, so two cuts far apart share the
 * resolution of their joint box.
 */

/** lng/lat rings of one polygon: the outer ring first, then its holes */
export type Tiles3dCutoutPolygon = readonly (readonly (readonly [
  number,
  number
])[])[];

export type Tiles3dCutoutUniforms = {
  uCutEnabled: { value: number };
  uCutMask: { value: THREE.Texture | null };
  /** scene x/z of the mask's north-west corner */
  uCutMin: { value: THREE.Vector2 };
  /** scene x/z extent of the mask */
  uCutSize: { value: THREE.Vector2 };
};

/** pixels across the mask on the longer side of its box */
const MASK_SIZE = 2048;
/** empty pixels round the polygons, so the edge never samples the border */
const MASK_MARGIN_PX = 2;

const createUniforms = (): Tiles3dCutoutUniforms => ({
  uCutEnabled: { value: 0 },
  uCutMask: { value: null },
  uCutMin: { value: new THREE.Vector2() },
  uCutSize: { value: new THREE.Vector2(1, 1) },
});

/** handed to tile materials compiled before they know their map: never cuts */
const DISABLED_UNIFORMS = createUniforms();

type MercatorBox = { minX: number; minY: number; maxX: number; maxY: number };

type MapCutouts = {
  uniforms: Tiles3dCutoutUniforms;
  sources: Map<string, readonly Tiles3dCutoutPolygon[]>;
  box: MercatorBox | null;
  release: (() => void) | null;
};

const cutoutsByMap = new WeakMap<MaplibreMap, MapCutouts>();

const stateFor = (map: MaplibreMap): MapCutouts => {
  let state = cutoutsByMap.get(map);
  if (!state) {
    state = {
      uniforms: createUniforms(),
      sources: new Map(),
      box: null,
      release: null,
    };
    cutoutsByMap.set(map, state);
  }
  return state;
};

/**
 * The cut-out uniforms of a map, for a tile material's shader. The object is
 * the same for the map's whole life, so a material compiled before the first
 * cut picks it up without being recompiled.
 */
export const getTiles3dCutoutUniforms = (
  map: MaplibreMap | null | undefined
): Tiles3dCutoutUniforms => (map ? stateFor(map).uniforms : DISABLED_UNIFORMS);

/** declarations for the fragment shader; needs `vProjWorld` declared before */
export const TILES3D_CUTOUT_FRAGMENT_PARS = `uniform float uCutEnabled;
uniform sampler2D uCutMask;
uniform vec2 uCutMin;
uniform vec2 uCutSize;`;

/** discards a fragment inside a cut-out; goes at the start of `main` */
export const TILES3D_CUTOUT_FRAGMENT_DISCARD = `if (uCutEnabled > 0.5) {
  vec2 cutUv = (vProjWorld.xz - uCutMin) / uCutSize;
  if (all(greaterThan(cutUv, vec2(0.0))) && all(lessThan(cutUv, vec2(1.0))) && texture2D(uCutMask, cutUv).r > 0.5) discard;
}`;

const toMercator = ([lng, lat]: readonly [number, number]) =>
  MercatorCoordinate.fromLngLat([lng, lat], 0);

const boxOf = (polygons: readonly Tiles3dCutoutPolygon[]): MercatorBox | null => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const point of ring) {
        const { x, y } = toMercator(point);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!(maxX > minX && maxY > minY)) return null;
  return { minX, minY, maxX, maxY };
};

/** the mask over `box` grown by its margin, and that grown box */
const drawMask = (
  polygons: readonly Tiles3dCutoutPolygon[],
  box: MercatorBox
): { texture: THREE.CanvasTexture; box: MercatorBox } => {
  const spanX = box.maxX - box.minX;
  const spanY = box.maxY - box.minY;
  const inner = MASK_SIZE - 2 * MASK_MARGIN_PX;
  const pixelsPerUnit = inner / Math.max(spanX, spanY);
  const margin = MASK_MARGIN_PX / pixelsPerUnit;
  const grown: MercatorBox = {
    minX: box.minX - margin,
    minY: box.minY - margin,
    maxX: box.maxX + margin,
    maxY: box.maxY + margin,
  };
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((grown.maxX - grown.minX) * pixelsPerUnit));
  canvas.height = Math.max(
    1,
    Math.ceil((grown.maxY - grown.minY) * pixelsPerUnit)
  );
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    for (const polygon of polygons) {
      context.beginPath();
      for (const ring of polygon) {
        ring.forEach((point, index) => {
          const { x, y } = toMercator(point);
          const px = (x - grown.minX) * pixelsPerUnit;
          const py = (y - grown.minY) * pixelsPerUnit;
          if (index === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        });
        context.closePath();
      }
      context.fill("evenodd");
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  // row 0 is the box's north edge, which is the scene's smallest z
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return { texture, box: grown };
};

/**
 * Keeps the mask's scene position current. The scene's origin is the map
 * centre at the moment the shared layer was added, and it moves when the
 * layer is added again, so the corners are projected every frame.
 */
const attachPlacement = (map: MaplibreMap, state: MapCutouts) => {
  const lease = acquireSharedThreeScene(map);
  const corner = new THREE.Vector3();
  const runtime = {
    id: "tiles3d-cutouts",
    originLngLat: [map.getCenter().lng, map.getCenter().lat] as [
      number,
      number
    ],
    root: new THREE.Group(),
    update: () => {
      const box = state.box;
      if (!box) return;
      const nw = new MercatorCoordinate(box.minX, box.minY, 0).toLngLat();
      const se = new MercatorCoordinate(box.maxX, box.maxY, 0).toLngLat();
      if (!lease.layer.projectLngLatToScene([nw.lng, nw.lat], 0, corner))
        return;
      const minX = corner.x;
      const minZ = corner.z;
      if (!lease.layer.projectLngLatToScene([se.lng, se.lat], 0, corner))
        return;
      state.uniforms.uCutMin.value.set(minX, minZ);
      state.uniforms.uCutSize.value.set(corner.x - minX, corner.z - minZ);
    },
    dispose: () => undefined,
  };
  runtime.root.name = "tiles3d-cutouts";
  lease.layer.addRuntime(runtime);
  return () => {
    if (lease.layer.hasRuntime(runtime.id)) lease.layer.removeRuntime(runtime.id);
    lease.release();
  };
};

const rebuild = (map: MaplibreMap, state: MapCutouts) => {
  const polygons = [...state.sources.values()].flat();
  const previous = state.uniforms.uCutMask.value;
  const box = polygons.length > 0 ? boxOf(polygons) : null;
  if (!box) {
    state.uniforms.uCutEnabled.value = 0;
    state.uniforms.uCutMask.value = null;
    state.box = null;
    state.release?.();
    state.release = null;
  } else {
    const mask = drawMask(polygons, box);
    state.uniforms.uCutMask.value = mask.texture;
    state.box = mask.box;
    state.uniforms.uCutEnabled.value = 1;
    if (!state.release) state.release = attachPlacement(map, state);
  }
  previous?.dispose();
  map.triggerRepaint();
};

/**
 * Cut `polygons` out of every 3D tileset on `map`, under `id`; calling it
 * again with the same id replaces that set. Returns the function that takes
 * this set out again. Cuts of different ids add up.
 */
export const setTiles3dCutout = (
  map: MaplibreMap,
  id: string,
  polygons: readonly Tiles3dCutoutPolygon[]
): (() => void) => {
  const state = stateFor(map);
  state.sources.set(id, polygons);
  rebuild(map, state);
  return () => {
    if (state.sources.get(id) !== polygons) return;
    state.sources.delete(id);
    rebuild(map, state);
  };
};
