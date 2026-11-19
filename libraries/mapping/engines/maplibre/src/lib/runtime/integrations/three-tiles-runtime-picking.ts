import * as THREE from "three";

import type { SharedThreeSceneFrame } from "../../core/shared-three-scene-types";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";
import type { Tiles3dRaycastResult } from "./three-tiles-runtime-types";
import {
  TILE_HIGHLIGHT_FLAG,
  TILE_OUTLINE_FLAG,
} from "./three-tiles-runtime-vendor";

type MetadataMesh = THREE.Mesh & {
  userData: {
    meshFeatures?: {
      getFeatures: (
        triangle: number,
        barycoord: THREE.Vector3
      ) => Array<number | null>;
      getFeatureInfo: () => Array<{
        propertyTable?: number | null;
        attribute?: number | null;
        texture?: unknown;
        nullFeatureId?: number | null;
      }>;
    };
    structuralMetadata?: {
      getPropertyTableData: (
        tableIndices: number,
        ids: number
      ) => Record<string, unknown>;
    };
    [key: string]: unknown;
  };
};

/** Per mesh: which local feature ids belong to which building. */
const FEATURE_KEYS = "__carmaFeatureKeys";

/** The highlight colour: CARMA selection blue, as GenericThreeLayer uses it. */
const HIGHLIGHT_COLOR = 0x3a7ceb;

/**
 * Answers clicks on a tileset out of the glTF property table in the tile.
 *
 * The ray comes from the shared scene's render camera of the last observer
 * frame, which carries MapLibre's own projection, so it lands on exactly what
 * was drawn. Requires `GLTFExtensionsPlugin` with `metadata` on, which is its
 * default: that is what puts `meshFeatures` and `structuralMetadata` on the
 * meshes.
 */
export function createThreeTilesPicking(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    "tiles" | "map" | "runtimeVisible" | "orientationGroup"
  >
) {
  let camera: THREE.PerspectiveCamera | null = null;
  const raycaster = new THREE.Raycaster();
  const pickNdc = new THREE.Vector2();

  // Buildings picked so far, by the key of feature set 0. `highlight` is
  // called with an index into this, which is the signature the other 3D
  // layers use.
  const pickedKeys: string[] = [];

  let highlightMesh: THREE.Mesh | null = null;
  // The building on show. The overlay is a copy of the tiles' triangles, so
  // it has to be copied again whenever a tile loads, unloads or swaps for a
  // finer one; until then it keeps a coarse tile's shell or misses the part
  // of the building in a tile that came in after the click.
  let highlightedKey: string | null = null;
  let overlayStale = false;
  let watchedTiles: ThreeTilesRuntimeState["tiles"] = null;
  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: HIGHLIGHT_COLOR,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    // The overlay sits on the same triangles it copies, so without a pull
    // towards the camera it fights the surface underneath it.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });

  /**
   * Keep the observer's camera. Offscreen callers (shadow, accumulation and
   * embedded views) leave out `cssViewport`, and their cameras do not show
   * what the user clicked on.
   */
  const observeFrame = (frame: SharedThreeSceneFrame) => {
    if (!frame.cssViewport) return;
    const renderCamera = frame.renderCamera as THREE.PerspectiveCamera;
    if (renderCamera.isPerspectiveCamera) camera = renderCamera;
    // Once per frame however many tiles changed since the last one.
    if (overlayStale && highlightedKey != null) buildOverlay(highlightedKey);
    overlayStale = false;
  };

  const markOverlayStale = () => {
    if (highlightedKey == null) return;
    overlayStale = true;
    runtimeState.map?.triggerRepaint();
  };

  const unwatchTiles = () => {
    if (!watchedTiles) return;
    watchedTiles.removeEventListener("load-model", markOverlayStale);
    watchedTiles.removeEventListener("dispose-model", markOverlayStale);
    watchedTiles.removeEventListener("tile-visibility-change", markOverlayStale);
    watchedTiles = null;
  };

  /** Follow the renderer that is current now; a reattach brings a new one. */
  const watchTiles = () => {
    const tiles = runtimeState.tiles;
    if (tiles === watchedTiles) return;
    unwatchTiles();
    if (!tiles) return;
    tiles.addEventListener("load-model", markOverlayStale);
    tiles.addEventListener("dispose-model", markOverlayStale);
    tiles.addEventListener("tile-visibility-change", markOverlayStale);
    watchedTiles = tiles;
  };

  const isPickable = (object: THREE.Object3D): object is MetadataMesh =>
    (object as THREE.Mesh).isMesh === true &&
    object.userData?.[TILE_OUTLINE_FLAG] !== true &&
    object.userData?.[TILE_HIGHLIGHT_FLAG] !== true;

  /** Whether the object is drawn, up to the tileset's own group. */
  const isShown = (object: THREE.Object3D, top: THREE.Object3D): boolean => {
    for (
      let current: THREE.Object3D | null = object;
      current && current !== top;
      current = current.parent
    ) {
      if (!current.visible) return false;
    }
    return true;
  };

  /**
   * The buffer carrying feature set 0's ids on this mesh.
   *
   * The name is read back out of the mesh features rather than written down
   * here. The glTF declares `_FEATURE_ID_0`, but three's GLTFLoader lowercases
   * every attribute it has no mapping for, so the buffer arrives as
   * `_feature_id_0`; and the number in that name is the extension's attribute
   * index, not the set's position in the list.
   */
  const featureIdAttribute = (mesh: MetadataMesh) => {
    const info = mesh.userData.meshFeatures?.getFeatureInfo()[0];
    if (!info || info.attribute == null) return undefined;
    return (mesh.geometry as THREE.BufferGeometry).getAttribute(
      `_feature_id_${info.attribute}`
    );
  };

  /** The key a building is addressed by: whatever feature set 0 resolves to. */
  const featureKey = (
    properties: Record<string, unknown> | null
  ): string | null => {
    if (!properties) return null;
    const id = properties.building_id ?? properties.id ?? properties.fid;
    return id == null ? null : String(id);
  };

  /**
   * The feature ids at a hit, one per set: the corner nearest the hit decides,
   * which is how `MeshFeatures.getFeatures` resolves them too. Sets carried in
   * vertex attributes are read here directly. `getFeatures` always goes
   * through its texture reader, which brings up a WebGL context of its own and
   * reads pixels back synchronously, so it stays for texture sets alone.
   */
  const featureIdsAt = (
    mesh: MetadataMesh,
    triangle: number,
    barycoord: THREE.Vector3
  ): Array<number | null> => {
    const meshFeatures = mesh.userData.meshFeatures;
    if (!meshFeatures) return [];
    const info = meshFeatures.getFeatureInfo();
    if (info.some((set) => set.texture !== undefined))
      return meshFeatures.getFeatures(triangle, barycoord);

    const geometry = mesh.geometry as THREE.BufferGeometry;
    const index = geometry.getIndex();
    const nearest =
      barycoord.x >= barycoord.y && barycoord.x >= barycoord.z
        ? 0
        : barycoord.y >= barycoord.z
        ? 1
        : 2;
    const corner = triangle * 3 + nearest;
    const vertex = index ? index.getX(corner) : corner;
    return info.map((set) => {
      // A set with neither attribute nor texture numbers features by vertex.
      const value =
        set.attribute == null
          ? vertex
          : geometry.getAttribute(`_feature_id_${set.attribute}`)?.getX(vertex);
      if (value == null || value === (set.nullFeatureId ?? null)) return null;
      return value;
    });
  };

  const readFeatures = (
    mesh: MetadataMesh,
    triangle: number,
    barycoord: THREE.Vector3
  ): Tiles3dRaycastResult["features"] | null => {
    const meshFeatures = mesh.userData.meshFeatures;
    const metadata = mesh.userData.structuralMetadata;
    if (!meshFeatures) return null;

    const ids = featureIdsAt(mesh, triangle, barycoord);
    const info = meshFeatures.getFeatureInfo();
    return ids.map((featureId, index) => {
      const propertyTable = info[index]?.propertyTable ?? null;
      let properties: Record<string, unknown> | null = null;
      if (featureId != null && propertyTable != null && metadata) {
        properties = metadata.getPropertyTableData(propertyTable, featureId);
      }
      return { featureId, propertyTable, properties };
    });
  };

  /**
   * Which local feature ids of this mesh belong to which building.
   *
   * Built once per mesh and kept on it. A tile holds up to a few hundred
   * buildings and the answer cannot change while the tile is loaded.
   */
  const featureIndexOf = (
    mesh: MetadataMesh
  ): Map<string, Set<number>> | null => {
    const cached = mesh.userData[FEATURE_KEYS] as
      | Map<string, Set<number>>
      | undefined;
    if (cached) return cached;

    const metadata = mesh.userData.structuralMetadata;
    const meshFeatures = mesh.userData.meshFeatures;
    if (!metadata || !meshFeatures) return null;
    const table = meshFeatures.getFeatureInfo()[0]?.propertyTable ?? null;
    if (table == null) return null;
    const idAttribute = featureIdAttribute(mesh);
    if (!idAttribute) return null;

    const byKey = new Map<string, Set<number>>();
    const seen = new Set<number>();
    for (let i = 0; i < idAttribute.count; i += 1) {
      const featureId = idAttribute.getX(i);
      if (seen.has(featureId)) continue;
      seen.add(featureId);
      const key = featureKey(metadata.getPropertyTableData(table, featureId));
      if (key == null) continue;
      const bucket = byKey.get(key);
      if (bucket) bucket.add(featureId);
      else byKey.set(key, new Set([featureId]));
    }
    mesh.userData[FEATURE_KEYS] = byKey;
    return byKey;
  };

  const removeOverlay = () => {
    if (!highlightMesh) return;
    highlightMesh.parent?.remove(highlightMesh);
    highlightMesh.geometry.dispose();
    highlightMesh = null;
    runtimeState.map?.triggerRepaint();
  };

  const clearHighlight = () => {
    highlightedKey = null;
    overlayStale = false;
    removeOverlay();
  };

  /**
   * Paint one building.
   *
   * Copies the triangles that carry the building's feature id into an overlay
   * mesh rather than recolouring the tile geometry, which the renderer cache
   * can evict or rebuild under us. The overlay hangs beside the tiles, in the
   * frame of their parent, so a refit of the camera mount moves it along.
   *
   * The lasting answer is a material that reads a colour per feature id out of
   * a lookup texture, which also gives roof colouring; this holds until then.
   *
   * Only tiles that are drawn take part: a coarse tile kept loaded under the
   * finer ones that replaced it would otherwise add its own, cruder shell.
   */
  const buildOverlay = (key: string) => {
    removeOverlay();
    const tiles = runtimeState.tiles;
    const parent = tiles?.group.parent;
    if (!tiles || !parent) return;

    parent.updateMatrixWorld(true);
    const parentInverse = parent.matrixWorld.clone().invert();
    const meshToParent = new THREE.Matrix4();
    const positions: number[] = [];
    const vertex = new THREE.Vector3();

    tiles.group.traverse((object) => {
      if (!isPickable(object) || !isShown(object, runtimeState.orientationGroup))
        return;
      const wanted = featureIndexOf(object)?.get(key);
      if (!wanted || wanted.size === 0) return;

      const geometry = object.geometry as THREE.BufferGeometry;
      const idAttribute = featureIdAttribute(object);
      const positionAttribute = geometry.getAttribute("position");
      if (!idAttribute || !positionAttribute) return;
      const index = geometry.getIndex();
      const vertexAt = (corner: number) => (index ? index.getX(corner) : corner);
      const count = index ? index.count : positionAttribute.count;

      meshToParent.multiplyMatrices(parentInverse, object.matrixWorld);
      for (let triangle = 0; triangle + 2 < count; triangle += 3) {
        if (!wanted.has(idAttribute.getX(vertexAt(triangle)))) continue;
        for (let corner = 0; corner < 3; corner += 1) {
          vertex
            .fromBufferAttribute(positionAttribute, vertexAt(triangle + corner))
            .applyMatrix4(meshToParent);
          positions.push(vertex.x, vertex.y, vertex.z);
        }
      }
    });

    if (positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    highlightMesh = new THREE.Mesh(geometry, highlightMaterial);
    highlightMesh.userData[TILE_HIGHLIGHT_FLAG] = true;
    highlightMesh.castShadow = false;
    highlightMesh.receiveShadow = false;
    parent.add(highlightMesh);
    runtimeState.map?.triggerRepaint();
  };

  const highlightKey = (key: string) => {
    highlightedKey = key;
    overlayStale = false;
    watchTiles();
    buildOverlay(key);
  };

  const raycast = (
    screenX: number,
    screenY: number
  ): Tiles3dRaycastResult | null => {
    const { map, tiles } = runtimeState;
    if (!map || !tiles || !camera || !runtimeState.runtimeVisible) return null;
    const canvas = map.getCanvas();
    if (!canvas.clientWidth || !canvas.clientHeight) return null;

    const ndcX = (screenX / canvas.clientWidth) * 2 - 1;
    const ndcY = -(screenY / canvas.clientHeight) * 2 + 1;
    pickNdc.set(ndcX, ndcY);
    raycaster.setFromCamera(pickNdc, camera);

    const hits = raycaster.intersectObject(tiles.group, true);
    for (const hit of hits) {
      const object = hit.object;
      if (!isPickable(object) || !isShown(object, runtimeState.orientationGroup))
        continue;
      // The first surface the ray meets is what the user clicked on. A mesh
      // without features ends the search there rather than letting the ray
      // pick a building behind it.
      if (hit.faceIndex == null || !hit.barycoord) return null;
      const features = readFeatures(object, hit.faceIndex, hit.barycoord);
      if (!features || features.length === 0) return null;

      const properties = features[0]?.properties ?? null;
      const key = featureKey(properties);
      let resolvedSourceIndex: number | undefined;
      if (key != null) {
        const existing = pickedKeys.indexOf(key);
        resolvedSourceIndex =
          existing >= 0 ? existing : pickedKeys.push(key) - 1;
      }

      return {
        kind: "tiles3d",
        ndc: { x: ndcX, y: ndcY },
        candidates: hits.length,
        hitDistance: hit.distance,
        hitDepth: hit.point.clone().project(camera).z,
        resolvedSourceIndex,
        features,
        properties,
      };
    }
    return null;
  };

  const highlight = (resolvedSourceIndex: number) => {
    const key = pickedKeys[resolvedSourceIndex];
    if (key == null) return;
    highlightKey(key);
  };

  const dispose = () => {
    clearHighlight();
    unwatchTiles();
    highlightMaterial.dispose();
    camera = null;
  };

  return {
    observeFrame,
    raycast,
    highlight,
    unhighlight: clearHighlight,
    dispose,
  };
}
