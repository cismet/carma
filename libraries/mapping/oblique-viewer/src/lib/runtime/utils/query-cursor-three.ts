import type { Map as MaplibreMap, MercatorCoordinate } from "maplibre-gl";
import {
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";

import {
  QUERY_CURSOR_DEFAULTS,
  createQueryCursorNormalSmoother,
  orientNormalTowardViewer,
  queryCursorRingMatrix,
  screenConstantRingRadius,
  surfaceNormalFromNeighbours,
} from "../../core/utils/query-cursor";

/** Surface picks under the pointer; neighbours only when the normal is resampled. */
export type QueryCursorSurfaceSample = Readonly<{
  center: MercatorCoordinate;
  neighbours?: Readonly<{
    right?: MercatorCoordinate;
    left?: MercatorCoordinate;
    up?: MercatorCoordinate;
    down?: MercatorCoordinate;
  }> | null;
}>;

export type QueryCursorThree = Readonly<{
  /** `null` hides the ring (pointer off the query surface or no surface hit). */
  setSample: (sample: QueryCursorSurfaceSample | null) => void;
  isVisible: () => boolean;
  dispose: () => void;
}>;

type Geographic = Readonly<{ lngLat: [number, number]; altitude: number }>;

const geographicOf = (coordinate: MercatorCoordinate): Geographic => {
  const { lng, lat } = coordinate.toLngLat();
  return { lngLat: [lng, lat], altitude: coordinate.toAltitude() };
};

let nextQueryCursorId = 0;

/**
 * Three.js query cursor in the shared MapLibre scene: the port of the Cesium
 * point-query ring. Pointer samples arrive outside the render loop; the ring
 * is rebuilt per frame from geographic positions, so local-frame rebases and
 * camera motion keep its place and its constant screen size.
 */
export const createQueryCursorThree = (
  map: MaplibreMap,
  options: Partial<
    Pick<
      typeof QUERY_CURSOR_DEFAULTS,
      | "targetScreenRadius"
      | "innerHoleRadiusRatio"
      | "opacity"
      | "color"
      | "showNormalLine"
    >
  > = {}
): QueryCursorThree => {
  const style = { ...QUERY_CURSOR_DEFAULTS, ...options };
  const lease = acquireSharedThreeScene(map);
  const project = ({ lngLat, altitude }: Geographic) =>
    lease.layer.projectLngLatToScene(lngLat, altitude);
  // The runtime root stays visible: the photo-axis picker keys its hit cache
  // on every runtime's root visibility, so only the cursor group toggles.
  const root = new Group();
  root.matrixAutoUpdate = false;
  const cursor = new Group();
  cursor.matrixAutoUpdate = false;
  cursor.visible = false;
  root.add(cursor);
  const ringGeometry = new RingGeometry(
    Math.min(Math.max(style.innerHoleRadiusRatio, 0), 0.999),
    1,
    style.ringSegments
  );
  const ringMaterial = new MeshBasicMaterial({
    color: style.color,
    opacity: style.opacity,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
  });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.renderOrder = 10_000;
  cursor.add(ring);
  const lineGeometry = new LineGeometry();
  // Cesium draws ±radius through the surface; only the outer half shows.
  lineGeometry.setPositions([0, 0, 0, 0, 0, 1]);
  const lineMaterial = new LineMaterial({
    color: style.color,
    opacity: style.opacity,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    linewidth: style.normalLineWidth,
  });
  const normalLine = new Line2(lineGeometry, lineMaterial);
  normalLine.renderOrder = 10_000;
  normalLine.visible = style.showNormalLine;
  normalLine.frustumCulled = false;
  cursor.add(normalLine);

  const smoother = createQueryCursorNormalSmoother();
  let target: Geographic | null = null;
  let disposed = false;

  const hide = () => {
    if (!cursor.visible) return;
    cursor.visible = false;
    map.triggerRepaint();
  };

  const localUpAt = (geographic: Geographic, center: Vector3) => {
    const raised = project({
      ...geographic,
      altitude: geographic.altitude + 1,
    });
    return raised && raised.sub(center).lengthSq() > 0
      ? raised.normalize()
      : new Vector3(0, 1, 0);
  };

  const sceneToClip = new Matrix4();
  const update = (frame: SharedThreeSceneFrame) => {
    if (!target) {
      cursor.visible = false;
      return;
    }
    const center = project(target);
    const width = frame.cssViewport?.x ?? map.getCanvas().clientWidth;
    const height = frame.cssViewport?.y ?? map.getCanvas().clientHeight;
    if (!center || !(width > 0) || !(height > 0)) {
      cursor.visible = false;
      return;
    }
    const now = performance.now();
    const latest = smoother.latest() ?? localUpAt(target, center);
    sceneToClip
      .copy(frame.renderCamera.projectionMatrix)
      .multiply(frame.renderCamera.matrixWorldInverse);
    const normal = orientNormalTowardViewer(
      smoother.average(latest, now),
      sceneToClip
    );
    const radius = screenConstantRingRadius({
      center,
      normal,
      sceneToClip,
      viewport: { width, height },
      targetScreenRadius: style.targetScreenRadius,
    });
    if (radius === null) {
      cursor.visible = false;
      return;
    }
    cursor.matrix.copy(queryCursorRingMatrix(center, normal, radius));
    cursor.matrixWorldNeedsUpdate = true;
    cursor.visible = true;
    lineMaterial.resolution.set(width, height);
    // Keep drawing while older normals still fade out of the trail.
    if (!smoother.isSettled(now)) map.triggerRepaint();
  };

  const runtime: SharedThreeSceneRuntime = {
    id: "oblique-query-cursor-" + ++nextQueryCursorId,
    originLngLat: [map.getCenter().lng, map.getCenter().lat],
    providesTerrain: false,
    receivesMapStyleTexture: false,
    root,
    update,
    dispose: () => {
      ringGeometry.dispose();
      ringMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
    },
  };
  lease.layer.addRuntime(runtime);

  return {
    setSample: (sample) => {
      if (disposed) return;
      if (!sample) {
        target = null;
        smoother.reset();
        hide();
        return;
      }
      target = geographicOf(sample.center);
      const neighbours = sample.neighbours;
      if (neighbours) {
        const center = project(target);
        const at = (coordinate?: MercatorCoordinate) =>
          coordinate ? project(geographicOf(coordinate)) : null;
        const normal =
          center &&
          surfaceNormalFromNeighbours(
            center,
            {
              right: at(neighbours.right),
              left: at(neighbours.left),
              up: at(neighbours.up),
              down: at(neighbours.down),
            },
            localUpAt(target, center)
          );
        if (normal) smoother.push(normal, performance.now());
      }
      map.triggerRepaint();
    },
    isVisible: () => cursor.visible,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      target = null;
      lease.layer.removeRuntime(runtime.id);
      lease.release();
      map.triggerRepaint();
    },
  };
};
