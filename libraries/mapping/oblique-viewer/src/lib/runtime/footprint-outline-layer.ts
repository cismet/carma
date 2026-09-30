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

import type { AnimationConfig, ObliquePose } from "../core/types";
import { footprintMarkerGeometry } from "../core/utils/footprint-marker";

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
  setRing: (
    ring: Position[] | null,
    annotation?: {
      pose: ObliquePose | null;
      seriesLabel?: string;
    }
  ) => void;
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
  let markerPoints: [number, number][] = [];
  let arrowVertexCount = 0;
  let labelText: string | undefined;
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
  const labelMaterial = new THREE.MeshBasicMaterial({
    color: style.color,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const arrow = new Line2(new LineGeometry(), material);
  const yearLabel = new THREE.Mesh(new THREE.BufferGeometry(), labelMaterial);
  arrow.frustumCulled = yearLabel.frustumCulled = false;
  arrow.visible = yearLabel.visible = false;
  scene.add(arrow, yearLabel);
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
    const next = [...points, ...markerPoints].map(
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
    const positions = localPoints.flatMap((point) => [
      point.x,
      point.y,
      point.z,
    ]);
    const previous = line.geometry;
    line.geometry = new LineGeometry().setPositions(positions);
    previous.dispose();
    const markerPositions = markerPoints.flatMap(([lng, lat], index) =>
      toLocal(lng, lat, heights[points.length + index]).toArray()
    );
    const setPositions = (mesh: THREE.Mesh, values: number[]) => {
      const attribute = mesh.geometry.getAttribute("position");
      if (
        attribute instanceof THREE.BufferAttribute &&
        attribute.array.length === values.length
      ) {
        attribute.array.set(values);
        attribute.needsUpdate = true;
      } else {
        mesh.geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(values, 3)
        );
      }
    };
    const previousArrow = arrow.geometry;
    arrow.geometry = new LineGeometry();
    const arrowPositions = markerPositions.slice(0, arrowVertexCount * 3);
    if (arrowPositions.length >= 6) arrow.geometry.setPositions(arrowPositions);
    previousArrow.dispose();
    setPositions(yearLabel, markerPositions.slice(arrowVertexCount * 3));
    return true;
  };

  /** The open caret and text follow sampled terrain and the outline's fade. */
  const updateMarkers = (
    ring: Position[],
    annotation: Parameters<FootprintOutlineLayer["setRing"]>[1]
  ): void => {
    markerPoints = [];
    arrowVertexCount = 0;
    arrow.visible = yearLabel.visible = false;
    arrow.geometry.dispose();
    yearLabel.geometry.dispose();
    arrow.geometry = new LineGeometry();
    yearLabel.geometry = new THREE.BufferGeometry();
    if (!annotation?.pose) return;
    const polygon = ring.map(([lng, lat]) => {
      const local = toLocal(lng, lat, 0);
      return new THREE.Vector2(local.x, -local.y);
    });
    const marker = footprintMarkerGeometry(polygon, annotation.pose);
    if (!marker) return;
    const uv: number[] = [];
    const appendTriangle = (
      vertices: THREE.Vector2[],
      texture: THREE.Vector2[]
    ) => {
      const [a, b, c] = vertices;
      const steps = Math.max(
        1,
        Math.ceil(
          Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) /
            SEGMENT_METERS
        )
      );
      const vertex = (i: number, j: number) => {
        const x = i / steps,
          y = j / steps;
        const point = a
          .clone()
          .multiplyScalar(1 - x - y)
          .addScaledVector(b, x)
          .addScaledVector(c, y);
        const ll = new MercatorCoordinate(
          origin.x + point.x * meterScale,
          origin.y - point.y * meterScale
        ).toLngLat();
        markerPoints.push([ll.lng, ll.lat]);
        const tex = texture[0]
          .clone()
          .multiplyScalar(1 - x - y)
          .addScaledVector(texture[1], x)
          .addScaledVector(texture[2], y);
        uv.push(tex.x, tex.y);
      };
      for (let i = 0; i < steps; i++) {
        for (let j = 0; i + j < steps; j++) {
          vertex(i, j);
          vertex(i + 1, j);
          vertex(i, j + 1);
          if (i + j + 1 < steps) {
            vertex(i + 1, j);
            vertex(i + 1, j + 1);
            vertex(i, j + 1);
          }
        }
      }
    };
    const [tip, right, left] = marker.triangle;
    const caret = [right, tip, left].map((point) => {
      const ll = new MercatorCoordinate(
        origin.x + point.x * meterScale,
        origin.y - point.y * meterScale
      ).toLngLat();
      return [ll.lng, ll.lat];
    });
    markerPoints = densify(caret);
    arrowVertexCount = markerPoints.length;
    arrow.visible = true;
    uv.length = 0;
    const text = annotation.seriesLabel;
    if (!text) return;
    if (text !== labelText) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = "800 172px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      const fontSize = Math.min(
        172,
        (172 * 480) / Math.max(480, ctx.measureText(text).width)
      );
      ctx.font = `800 ${fontSize}px sans-serif`;
      ctx.fillText(text, 256, 132);
      labelMaterial.map?.dispose();
      labelMaterial.map = new THREE.CanvasTexture(canvas);
      labelMaterial.map.colorSpace = THREE.SRGBColorSpace;
      labelMaterial.needsUpdate = true;
      labelText = text;
    }
    const [tl, tr, br, bl] = marker.labelCorners;
    appendTriangle(
      [tl, tr, bl],
      [
        new THREE.Vector2(0, 1),
        new THREE.Vector2(1, 1),
        new THREE.Vector2(0, 0),
      ]
    );
    appendTriangle(
      [tr, br, bl],
      [
        new THREE.Vector2(1, 1),
        new THREE.Vector2(1, 0),
        new THREE.Vector2(0, 0),
      ]
    );
    yearLabel.geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(uv, 2)
    );
    yearLabel.visible = true;
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
      (point) =>
        clip.set(point.x, point.y, point.z, 1).applyMatrix4(matrix).w > 0
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
      // Wide lines cannot clip a combined MapLibre camera matrix safely.
      // Ordinary triangle meshes can, so keep markers when an edge is behind us.
      line.visible = inFrontOfCamera(matrix);
      arrow.visible =
        markerPoints.slice(0, arrowVertexCount).length > 0 &&
        markerPoints.slice(0, arrowVertexCount).every(([lng, lat], index) => {
          const point = toLocal(lng, lat, heights[points.length + index]);
          return (
            clip.set(point.x, point.y, point.z, 1).applyMatrix4(matrix).w > 0
          );
        });
      camera.projectionMatrix.copy(matrix);
      camera.projectionMatrixInverse.copy(matrix).invert();

      const canvas = map.getCanvas();
      material.resolution.set(canvas.clientWidth, canvas.clientHeight);
      material.opacity = opacity;
      labelMaterial.opacity = opacity * 0.5;

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
    setRing: (ring, annotation) => {
      if (!ring || ring.length < 2) {
        points = [];
        heights = [];
        localPoints = [];
        markerPoints = [];
        arrow.visible = yearLabel.visible = false;
        map.triggerRepaint();
        return;
      }
      origin = MercatorCoordinate.fromLngLat({
        lng: ring[0][0],
        lat: ring[0][1],
      });
      meterScale = origin.meterInMercatorCoordinateUnits();
      model
        .makeTranslation(origin.x, origin.y, 0)
        .scale(new THREE.Vector3(meterScale, meterScale, meterScale));
      points = densify(ring);
      updateMarkers(ring, annotation);
      heights = [];
      updateHeights();
      map.triggerRepaint();
    },
    setStyle: (next) => {
      style = next;
      material.color.set(next.color);
      labelMaterial.color.set(next.color);
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
      arrow.geometry.dispose();
      yearLabel.geometry.dispose();
      labelMaterial.map?.dispose();
      labelMaterial.dispose();
      renderer?.dispose();
      renderer = null;
    },
  };
};
