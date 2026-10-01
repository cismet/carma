import {
  LngLatBounds,
  MercatorCoordinate,
  type Map as MaplibreMap,
} from "maplibre-gl";
import {
  Box3,
  Box3Helper,
  Group,
  Matrix4,
  Mesh,
  Vector2,
  Vector3,
  type PerspectiveCamera,
  type Scene,
} from "three";
import {
  TERRAIN_COMPARISON_SOURCES,
  type TerrainComparisonSource,
} from "./terrain-comparison-sources";
import {
  createLocalEcefFrame,
  createGcg2016HeightField,
  sampleGcg2016HeightField,
} from "@carma-geo/proj";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  type SharedThreeSceneFrame,
} from "@carma-mapping/engines/maplibre";
import {
  buildRasterDemTerrainRuntime,
  createTerrainEcefPresentation,
  getTerrainScreenErrorRatio,
} from "@carma-mapping/engines/maplibre/terrain";

/** Presentation adapter only. The production runtime owns every tile request,
 * quality stage, publication, cancellation, worker and seam decision. */
export const createTerrainComparisonRuntime = async ({
  origin,
  source,
  minimumLevel,
  segments,
  scenes,
  requestDraw,
  setStatus,
  signal,
}: {
  origin: [number, number];
  source: TerrainComparisonSource;
  minimumLevel: number;
  segments: number;
  scenes: readonly Scene[];
  requestDraw: () => void;
  setStatus: (status: string) => void;
  signal: AbortSignal;
}) => {
  const resource = TERRAIN_COMPARISON_SOURCES[source];
  const [west, south, east, north] = resource.bounds;
  const field =
    source === "nrw"
      ? await createGcg2016HeightField({ west, south, east, north }, signal)
      : null;
  signal.throwIfAborted();
  const frame = createLocalEcefFrame(...origin);
  const ecef = createTerrainEcefPresentation(origin, (lng, lat) =>
    field && lng >= west && lng <= east && lat >= south && lat <= north
      ? sampleGcg2016HeightField(field, lng, lat)
      : 0
  );
  const runtime = buildRasterDemTerrainRuntime(
    "terrain-comparison",
    resource,
    origin,
    {
      geometryProjection: "mercator",
      errorTargetPixels: 0.5,
      minimumLevel,
      maximumMeshSegments: segments,
      maxSelectionTiles: source === "global" ? 512 : 128,
      maxCachedMeshes: source === "global" ? 512 : 128,
      maxCachedMeshBytes: (source === "global" ? 512 : 256) * 1024 ** 2,
      maxCacheBytes: 64 * 1024 ** 2,
      requestConcurrency: 4,
      noDataHeightMeters: source === "nrw" ? -9999 : undefined,
      receivesMapStyleTexture: false,
      material: { color: 0xb4bf94 },
      onContentChanged: requestDraw,
      onError: (error) => setStatus(String(error)),
    }
  );
  scenes[0].add(runtime.root);
  scenes[1].add(ecef.root);

  // The shared runtime reads this viewport contract; no MapLibre Map or map
  // renderer is created. Its geographic envelope is bounded by the source,
  // and its real Three camera frustum performs the tile intersection tests.
  const mercator = MercatorCoordinate.fromLngLat(origin, 0);
  const scale = mercator.meterInMercatorCoordinateUnits();
  const sourceBox = new Box3();
  for (const lng of [west, east])
    for (const lat of [south, north])
      for (const height of [-1000, 10000]) {
        const point = MercatorCoordinate.fromLngLat([lng, lat], height);
        sourceBox.expandByPoint(
          new Vector3(
            (point.x - mercator.x) / scale,
            point.z / scale,
            (point.y - mercator.y) / scale
          )
        );
      }
  let bounds = new LngLatBounds([west, south], [east, north]);
  const host = {
    getBounds: () => bounds,
    triggerRepaint: requestDraw,
    isMoving: () => false,
    on() {
      return host;
    },
    off() {
      return host;
    },
  };
  const map = host as unknown as MaplibreMap;
  runtime.onAdd?.(map);
  const identity = new Matrix4();
  const localFrame: SharedThreeSceneFrame["localFrame"] = {
    lngLat: origin,
    referenceLngLat: origin,
    revision: 0,
    sceneFromLocal: identity,
    sceneFromLocalRotation: identity,
    sceneFromLocalReference: identity,
    referenceToCurrent: identity,
    currentToReference: identity,
  };
  const mirrors = new Map<
    Mesh,
    { native: Mesh; flatBox: Box3Helper; ecefBox: Box3Helper }
  >();
  const ecefBoxes = new Group();
  ecefBoxes.matrixAutoUpdate = false;
  ecefBoxes.matrix.copy(frame.localFromEcef);
  scenes[1].add(ecefBoxes);
  let disposed = false;
  const update = (
    camera: PerspectiveCamera,
    viewport: Vector2,
    target: Vector3,
    boxes: boolean,
    wireframe: boolean
  ) => {
    if (disposed) return [[], []] as Vector3[][];
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([
        {
          id: "comparison",
          camera,
          viewport: [viewport.x, viewport.y],
          errorTargetPixels: 0.5,
          role: TILE_CAMERA_ROLE.RECEIVER,
        },
      ])
    );
    const intersections = demand.intersectionVertices(sourceBox);
    bounds = new LngLatBounds([west, south], [west, south]);
    if (intersections.length) {
      bounds = new LngLatBounds();
      for (const point of intersections)
        bounds.extend(
          new MercatorCoordinate(
            mercator.x + point.x * scale,
            mercator.y + point.z * scale
          ).toLngLat()
        );
    }
    runtime.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: target,
      cssViewport: viewport,
      viewport,
      localFrame,
    });
    const published = runtime.getPublishedTerrainTiles();
    const retained = new Set(published.map(({ mesh }) => mesh));
    for (const [mesh, mirror] of mirrors) {
      if (retained.has(mesh)) continue;
      ecef.disposeTile(mirror.native);
      mirror.flatBox.removeFromParent();
      mirror.flatBox.dispose();
      mirror.ecefBox.removeFromParent();
      mirror.ecefBox.dispose();
      mirrors.delete(mesh);
    }
    let maximumErrorPixels = 0;
    const receiverPoints: Vector3[][] = [[], []];
    for (const { tile, mesh, bounds: tileBounds } of published) {
      let mirror = mirrors.get(mesh);
      if (!mirror) {
        const native = mesh.clone(false);
        native.geometry = mesh.geometry;
        ecef.root.add(native);
        ecef.mount(native, tile);
        mirror = {
          native,
          flatBox: new Box3Helper(new Box3(), 0x8cd2f4),
          ecefBox: new Box3Helper(new Box3(), 0x8cd2f4),
        };
        scenes[0].add(mirror.flatBox);
        ecefBoxes.add(mirror.ecefBox);
        mirrors.set(mesh, mirror);
      }
      mirror.native.geometry = mesh.geometry;
      mirror.native.material = mesh.material;
      mirror.native.castShadow = mesh.castShadow;
      mirror.native.receiveShadow = mesh.receiveShadow;
      ecef.sync(mirror.native);
      mesh.updateWorldMatrix(true, false);
      mirror.flatBox.box
        .copy(mesh.geometry.boundingBox!)
        .applyMatrix4(mesh.matrixWorld);
      const nativeReceivers = demand.intersectionVertices(mirror.flatBox.box);
      receiverPoints[0].push(...nativeReceivers);
      const projected = ecef.mesh(mirror.native)!;
      projected.updateWorldMatrix(true, false);
      receiverPoints[1].push(
        ...demand.intersectionVertices(
          projected.geometry.boundingBox!,
          undefined,
          projected.matrixWorld
        )
      );
      if (nativeReceivers.length)
        maximumErrorPixels = Math.max(
          maximumErrorPixels,
          getTerrainScreenErrorRatio(
            tile.geometricErrorMeters,
            viewport.y,
            camera.fov,
            tileBounds.distanceToPoint(camera.position),
            1
          )
        );
      ecef.ecefBounds(mirror.native, mirror.ecefBox.box);
      mirror.flatBox.visible = mirror.ecefBox.visible = boxes;
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material])
        if ("wireframe" in material) material.wireframe = wireframe;
    }
    const levels = published.map(({ tile }) => tile.id.level);
    setStatus(
      `${published.length} tiles · levels ${
        levels.length ? `${Math.min(...levels)}–${Math.max(...levels)}` : "…"
      } · target 0.5 CSS px · max ${maximumErrorPixels.toFixed(2)} px · ${
        runtime.getRequestDemand?.() ?? 0
      } pending`
    );
    return receiverPoints;
  };
  return {
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const mirror of mirrors.values()) {
        mirror.flatBox.removeFromParent();
        mirror.flatBox.dispose();
        mirror.ecefBox.dispose();
      }
      mirrors.clear();
      ecef.dispose();
      ecef.root.removeFromParent();
      ecefBoxes.removeFromParent();
      runtime.dispose();
      runtime.root.removeFromParent();
    },
  };
};
