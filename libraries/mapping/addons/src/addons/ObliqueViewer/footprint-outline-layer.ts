import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from "maplibre-gl";
import type { Position } from "geojson";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

import { get3dLayerIds } from "@carma-mapping/engines/maplibre";

import type { AnimationConfig } from "./types";

/**
 * The outline of the selected image's footprint, drawn over everything 3D.
 *
 * A MapLibre line layer is draped onto the terrain, and a city mesh brings its
 * own ground a little above that, so the mesh hides such a line wherever it is
 * on. The Cesium viewer does not have the problem because its ground polyline
 * drapes over terrain and tiles alike. Here the ring is a custom layer
 * instead: it follows the terrain height, skips the depth test and keeps
 * itself above every 3D layer on the map. A building standing in front of the
 * ring does not hide it either.
 *
 * Locking fades the outline out rather than removing it, and unlocking fades
 * it back in, the way the line layer's opacity transition did.
 */

export type FootprintOutlineStyle = {
  /** any CSS colour */
  color: string;
  /** CSS pixels */
  width: number;
  /** 0 to 1 */
  opacity: number;
};

export type FootprintOutlineLayer = {
  /** the footprint's outer ring in lon/lat, or null for none */
  setRing: (ring: Position[] | null) => void;
  setStyle: (style: FootprintOutlineStyle) => void;
  /** fade out and stay out while locked; the first call sets the state without a fade */
  setLocked: (locked: boolean, fade?: AnimationConfig) => void;
  destroy: () => void;
};

/** ring edges are cut into pieces this long, so the line can follow the terrain */
const SEGMENT_METERS = 10;
/** terrain heights that moved less than this leave the line as it is */
const HEIGHT_TOLERANCE_METERS = 0.05;
const DEFAULT_FADE_MS = 300;

/** the ring with every edge cut into pieces of at most SEGMENT_METERS */
const densify = (ring: Position[]): [number, number][] => {
  const points: [number, number][] = [];
  for (let index = 0; index + 1 < ring.length; index++) {
    const [lng1, lat1] = ring[index];
    const [lng2, lat2] = ring[index + 1];
    const a = MercatorCoordinate.fromLngLat({ lng: lng1, lat: lat1 });
    const b = MercatorCoordinate.fromLngLat({ lng: lng2, lat: lat2 });
    const meters =
      Math.hypot(b.x - a.x, b.y - a.y) / a.meterInMercatorCoordinateUnits();
    const steps = Math.max(1, Math.ceil(meters / SEGMENT_METERS));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      points.push([lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t]);
    }
  }
  const last = ring[ring.length - 1];
  points.push([last[0], last[1]]);
  return points;
};

export const createFootprintOutlineLayer = (
  map: MaplibreMap,
  id: string,
  initialStyle: FootprintOutlineStyle
): FootprintOutlineLayer => {
  let destroyed = false;
  let style = initialStyle;

  /** the densified ring in lon/lat, and the terrain height under each point */
  let points: [number, number][] = [];
  let heights: number[] = [];
  /** the same points in the local frame, as drawn */
  let localPoints: THREE.Vector3[] = [];
  /** the local frame: metres around the ring's first corner, up is up */
  let origin = new MercatorCoordinate(0, 0, 0);
  let meterScale = 1;
  const model = new THREE.Matrix4();

  const material = new LineMaterial({
    color: style.color,
    linewidth: style.width,
    transparent: true,
    opacity: style.opacity,
    depthTest: false,
    depthWrite: false,
  });
  const line = new Line2(new LineGeometry(), material);
  line.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(line);
  const camera = new THREE.Camera();
  let renderer: THREE.WebGLRenderer | null = null;

  /* ---------------------------------------------------------------- *
   *  Fade: from one visibility to the other, 0 to 1
   * ---------------------------------------------------------------- */

  let fadeFrom = 1;
  let fadeTo = 1;
  let fadeStart = 0;
  let fadeDelay = 0;
  let fadeDuration = 0;
  let lockSet = false;

  const visibilityAt = (now: number): number => {
    const elapsed = now - fadeStart - fadeDelay;
    if (elapsed <= 0) return fadeFrom;
    if (fadeDuration <= 0 || elapsed >= fadeDuration) return fadeTo;
    return fadeFrom + ((fadeTo - fadeFrom) * elapsed) / fadeDuration;
  };

  /* ---------------------------------------------------------------- *
   *  Geometry
   * ---------------------------------------------------------------- */

  const toLocal = (lng: number, lat: number, height: number): THREE.Vector3 => {
    const point = MercatorCoordinate.fromLngLat({ lng, lat });
    return new THREE.Vector3(
      (point.x - origin.x) / meterScale,
      (point.y - origin.y) / meterScale,
      height
    );
  };

  /**
   * Reads the terrain under every point and rebuilds the line when a height
   * has moved. Without terrain the map is flat at zero. Returns whether the
   * line changed.
   */
  const updateHeights = (): boolean => {
    if (points.length < 2) return false;
    const next = points.map(
      ([lng, lat]) => map.queryTerrainElevation([lng, lat]) ?? 0
    );
    const unchanged =
      next.length === heights.length &&
      next.every(
        (height, index) =>
          Math.abs(height - heights[index]) <= HEIGHT_TOLERANCE_METERS
      );
    if (unchanged) return false;
    heights = next;

    localPoints = points.map(([lng, lat], index) =>
      toLocal(lng, lat, heights[index])
    );
    const positions = localPoints.flatMap((point) => [point.x, point.y, point.z]);
    const previous = line.geometry;
    line.geometry = new LineGeometry().setPositions(positions);
    previous.dispose();
    return true;
  };

  /* ---------------------------------------------------------------- *
   *  The MapLibre layer
   * ---------------------------------------------------------------- */

  const clip = new THREE.Vector4();
  /**
   * False when a point lies behind the camera. The wide line trims such
   * segments only for a camera of its own, not for MapLibre's combined
   * matrix, and would smear them across the screen.
   */
  const inFrontOfCamera = (matrix: THREE.Matrix4): boolean =>
    localPoints.every(
      (point) => clip.set(point.x, point.y, point.z, 1).applyMatrix4(matrix).w > 0
    );

  const layer: CustomLayerInterface = {
    id,
    type: "custom",
    renderingMode: "3d",
    onAdd(_map, gl) {
      renderer?.dispose();
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },
    onRemove() {
      renderer?.dispose();
      renderer = null;
    },
    render(
      gl: WebGLRenderingContext | WebGL2RenderingContext,
      args: CustomRenderMethodInput
    ) {
      if (destroyed || !renderer || points.length < 2) return;

      const now = performance.now();
      if (now < fadeStart + fadeDelay + fadeDuration) map.triggerRepaint();
      const opacity = style.opacity * visibilityAt(now);
      if (opacity <= 0) return;

      const matrix = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix as unknown as number[])
        .multiply(model);
      if (!inFrontOfCamera(matrix)) return;
      camera.projectionMatrix.copy(matrix);
      camera.projectionMatrixInverse.copy(matrix).invert();

      const canvas = map.getCanvas();
      material.resolution.set(canvas.clientWidth, canvas.clientHeight);
      material.opacity = opacity;

      // MapLibre's depth range must survive three's state reset, or the
      // layers after this one test against the wrong depth space
      const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      renderer.render(scene, camera);
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
    },
  };

  /**
   * Above every 3D layer, and no higher than it has to be: another overlay
   * that keeps itself on top (the flood water does) would otherwise trade
   * places with this one forever, each move firing the other's styledata.
   */
  const keepAbove3dLayers = (): void => {
    const order = map.getLayersOrder();
    const at = order.indexOf(id);
    const highest3d = Math.max(
      -1,
      ...get3dLayerIds(map).map((other) => order.indexOf(other))
    );
    if (highest3d > at) map.moveLayer(id);
  };

  /** idempotent, and safe from `styledata`: a style change can drop custom layers */
  const attach = (): void => {
    if (destroyed) return;
    try {
      if (!map.getLayer(id)) map.addLayer(layer);
      keepAbove3dLayers();
    } catch {
      // the style is still loading; the next styledata or idle comes back here
    }
  };

  /** terrain arrives in tiles, and each tile refines the heights */
  const onIdle = (): void => {
    attach();
    if (updateHeights()) map.triggerRepaint();
  };
  const onTerrain = (): void => {
    if (updateHeights()) map.triggerRepaint();
  };

  map.on("styledata", attach);
  map.on("idle", onIdle);
  map.on("terrain", onTerrain);
  attach();

  return {
    setRing: (ring) => {
      if (!ring || ring.length < 2) {
        points = [];
        heights = [];
        localPoints = [];
        map.triggerRepaint();
        return;
      }
      origin = MercatorCoordinate.fromLngLat({ lng: ring[0][0], lat: ring[0][1] });
      meterScale = origin.meterInMercatorCoordinateUnits();
      model
        .makeTranslation(origin.x, origin.y, 0)
        .scale(new THREE.Vector3(meterScale, meterScale, meterScale));
      points = densify(ring);
      heights = [];
      updateHeights();
      map.triggerRepaint();
    },
    setStyle: (next) => {
      style = next;
      material.color.set(next.color);
      material.linewidth = next.width;
      map.triggerRepaint();
    },
    setLocked: (locked, fade) => {
      const target = locked ? 0 : 1;
      const now = performance.now();
      if (!lockSet) {
        lockSet = true;
        fadeFrom = target;
        fadeTo = target;
        fadeDuration = 0;
        fadeDelay = 0;
        fadeStart = now;
        map.triggerRepaint();
        return;
      }
      if (target === fadeTo) return;
      fadeFrom = visibilityAt(now);
      fadeTo = target;
      fadeStart = now;
      fadeDelay = fade?.delay ?? 0;
      fadeDuration = fade?.duration ?? DEFAULT_FADE_MS;
      map.triggerRepaint();
    },
    destroy: () => {
      destroyed = true;
      map.off("styledata", attach);
      map.off("idle", onIdle);
      map.off("terrain", onTerrain);
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch {
        // the style may already be gone
      }
      line.geometry.dispose();
      material.dispose();
      renderer?.dispose();
      renderer = null;
    },
  };
};
