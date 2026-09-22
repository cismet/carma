import { type Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import { receiverMatchedTileError } from "../../core/shadow-receiver-mask";
import type { SharedThreeSceneTileVolume } from "../../core/shared-three-scene-types";
import {
  TILE_CAMERA_PRIORITY,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import { resolveTileRequestPriority } from "../../core/tile-scheduling-policy";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import { getThreeTileDiagnosticSteps } from "./three-tiles-diagnostic-steps";
import { TILES_LOAD_POLICY } from "./three-tiles-load-policy";
import {
  getReadyMeshRegionCut,
  hasMeshRefinementContentInView,
} from "./three-tiles-mesh-frontier";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/** spatial responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesSpatial(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "modelLocalBounds"
    | "frameFromTiles"
    | "referenceToCurrent"
    | "orientationGroup"
    | "tiles"
    | "tileCameraDemand"
    | "runtimeVisible"
    | "tileViewElevationProjection"
    | "tileViewElevationFrustum"
    | "options"
    | "tileBoundingBox"
    | "committedMeshCasterFrontier"
    | "displayedMeshFrontier"
    | "meshRefinementSupport"
    | "activeTileBoundingBox"
    | "tileBoundsTransform"
    | "tilesetUrl"
    | "mainViewIntersectionCache"
    | "viewFrustumsReady"
    | "tileViewFrustum"
    | "deferred"
    | "tileRetries"
    | "effectiveErrorTarget"
    | "tileBoundingSphere"
    | "tileProjectedCenter"
    | "tileViewProjection"
    | "shadowReceiverMask"
    | "shadowSelectionEnabled"
    | "shadowView"
    | "shadowReceiverMatch"
    | "rootBoundsTransform"
    | "rootTileBoundingBox"
    | "rootWorldBoundingBox"
    | "offsetGroup"
    | "mainViewProjectionChanged"
    | "lastMainViewProjection"
    | "marginCamera"
    | "marginProjection"
    | "marginFrustum"
    | "ringFrustums"
    | "tileDebugProgress"
    | "requestedErrorTarget"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    "getStableTileId" | "getTileLoadReason"
  >
) {
  let cameraErrors = new WeakMap<RuntimeTile, number>();
  /** Product of the local matrices from `node` up to, excluding, `stop`. */
  const localChain = (
    node: THREE.Object3D,
    stop: THREE.Object3D | null,
    target: THREE.Matrix4
  ): THREE.Matrix4 => {
    target.identity();
    for (
      let current: THREE.Object3D | null = node;
      current && current !== stop;
      current = current.parent
    ) {
      if (current.matrixAutoUpdate) current.updateMatrix();
      target.premultiply(current.matrix);
    }
    return target;
  };
  const updateFrameFromTiles: ThreeTilesRuntimeServices["updateFrameFromTiles"] =
    () => {
      if (!runtimeState.tiles) return runtimeState.frameFromTiles.identity();
      // Up to and including the runtime root; its parent is the frame host,
      // the layer's local-frame group or the scene.
      return localChain(
        runtimeState.tiles.group,
        runtimeState.orientationGroup.parent,
        runtimeState.frameFromTiles
      );
    };
  const modelChain = new THREE.Matrix4();
  const viewportFocusNdc = new THREE.Vector3();
  const cameraBounds = new THREE.Box3();
  const cameraBoundsTransform = new THREE.Matrix4();
  const noCameraDemand = {
    required: false,
    receiver: false,
    errorRatio: 0,
    priority: Number.NEGATIVE_INFINITY,
  };
  type CachedCameraDemand = Readonly<{
    required: boolean;
    receiver: boolean;
    errorRatio: number;
    priority: number;
  }>;
  // A tile's demand only changes with the compiled tile cameras (a new
  // object per camera signature), yet priority, attachment and shadow
  // selection ask for the same tile several times per frame. Decision: memo
  // per tile for the lifetime of the compiled demand object; the 2026-09-18
  // cold-start profile put the evaluation family at 1.5-2 s of a 15 s shadow
  // load, see TILES_COVERAGE.md#main-thread-gltf-parse-share-2026-09-18.
  let cameraDemandCache = new WeakMap<
    RuntimeTile,
    [CachedCameraDemand | null, CachedCameraDemand | null]
  >();
  let cameraDemandCacheOwner: unknown = null;
  const getTileCameraDemand: ThreeTilesRuntimeServices["getTileCameraDemand"] =
    (tile, includeObserver = false) => {
      const bounds = tile.engineData?.boundingVolume;
      if (
        !runtimeState.tiles ||
        !bounds?.getAABB ||
        (!includeObserver &&
          !runtimeState.tileCameraDemand.views.some(
            (view) => view.id !== TILE_MAIN_OBSERVER_ID
          ))
      )
        return noCameraDemand;
      if (cameraDemandCacheOwner !== runtimeState.tileCameraDemand) {
        cameraDemandCacheOwner = runtimeState.tileCameraDemand;
        cameraDemandCache = new WeakMap();
      }
      const slot = includeObserver ? 1 : 0;
      const cached = cameraDemandCache.get(tile);
      const hit = cached?.[slot];
      if (hit) {
        if (includeObserver && hit.required)
          cameraErrors.set(
            tile,
            hit.errorRatio * runtimeState.effectiveErrorTarget
          );
        return hit;
      }
      readOrientedTileBounds(bounds, cameraBounds, cameraBoundsTransform);
      cameraBoundsTransform.premultiply(runtimeState.tiles.group.matrixWorld);
      cameraBounds.applyMatrix4(cameraBoundsTransform);
      const demand = runtimeState.tileCameraDemand.evaluate(
        cameraBounds,
        tile.geometricError *
          runtimeState.tiles.group.matrixWorld.getMaxScaleOnAxis(),
        // This API describes additional camera roles. The primary observer
        // must not bypass the independent shadow publication gate.
        includeObserver ? undefined : TILE_MAIN_OBSERVER_ID
      );
      // The evaluation result is scratch storage; keep a copy.
      const result: CachedCameraDemand = {
        required: demand.required,
        receiver: demand.receiver,
        errorRatio: demand.errorRatio,
        priority: demand.priority,
      };
      const entry = cached ?? [null, null];
      entry[slot] = result;
      if (!cached) cameraDemandCache.set(tile, entry);
      if (includeObserver && demand.required)
        cameraErrors.set(
          tile,
          demand.errorRatio * runtimeState.effectiveErrorTarget
        );
      return result;
    };
  const getTileRequestPriority: ThreeTilesRuntimeServices["getTileRequestPriority"] =
    (tile) => {
      if (runtimeState.meshRefinementSupport.has(tile))
        return TILE_CAMERA_PRIORITY.COVERAGE_REPAIR;
      const bounds = tile.engineData?.boundingVolume;
      // isTileInMainView includes extra receivers for coverage/material roles.
      // Priority needs the actual observer frustum, or every receiver would be
      // promoted back to PRIMARY regardless of its explicitly chosen rank.
      const inObserver =
        runtimeState.viewFrustumsReady && bounds?.intersectsFrustum
          ? bounds.intersectsFrustum(runtimeState.tileViewFrustum)
          : tile.traversal?.inFrustum ?? false;
      return resolveTileRequestPriority({
        replacementSupport: false,
        cameraPriority: getTileCameraDemand(tile).priority,
        motionPrefetch: !!tile.motionPrefetch,
        observerVisible: inObserver,
        selectedShadowReceiver:
          runtimeState.shadowSelectionEnabled &&
          tile.shadowReceiverCurrent === true,
        shadowWithoutSelection:
          !!runtimeState.shadowView &&
          (!runtimeState.shadowSelectionEnabled ||
            !runtimeState.shadowReceiverMask),
      });
    };
  const readModelFrameBounds: ThreeTilesRuntimeServices["readModelFrameBounds"] =
    (model: THREE.Object3D, target: THREE.Box3): THREE.Box3 => {
      // Tile payloads are immutable after GLTF publication, so the bounds in
      // the model's own space are walked once per model (walking every
      // vertex-bearing descendant per corridor query cost 15.6 s in one
      // startup trace). Per read only the local chain from the model up to
      // the runtime root is applied: a moved model is reflected, and a
      // local-frame refit moves the frame group, never this result, so keys
      // derived from it survive the refit.
      let bounds = runtimeState.modelLocalBounds.get(model);
      if (!bounds) {
        const localBounds = new THREE.Box3();
        const box = new THREE.Box3();
        const matrix = new THREE.Matrix4();
        model.traverse((object) => {
          const geometry = (object as THREE.Mesh).geometry as
            | THREE.BufferGeometry
            | undefined;
          if (!geometry) return;
          if (geometry.boundingBox === null) geometry.computeBoundingBox();
          if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
          box
            .copy(geometry.boundingBox)
            .applyMatrix4(localChain(object, model, matrix));
          localBounds.union(box);
        });
        bounds = localBounds;
        runtimeState.modelLocalBounds.set(model, bounds);
      }
      const frameFromModel = localChain(
        model,
        runtimeState.tiles?.group ?? null,
        modelChain
      ).premultiply(updateFrameFromTiles());
      return target.copy(bounds).applyMatrix4(frameFromModel);
    };

  const getViewElevationRange: ThreeTilesRuntimeServices["getViewElevationRange"] =
    (camera: THREE.Camera): readonly [number, number] | null => {
      if (!runtimeState.tiles || !runtimeState.runtimeVisible) return null;
      const currentTiles = runtimeState.tiles;
      camera.updateMatrixWorld(true);
      runtimeState.tileViewElevationProjection
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .multiply(runtimeState.referenceToCurrent);
      runtimeState.tileViewElevationFrustum.setFromProjectionMatrix(
        runtimeState.tileViewElevationProjection,
        camera.coordinateSystem,
        camera.reversedDepth
      );
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      for (const tile of currentTiles.visibleTiles) {
        if (
          runtimeState.options.providesTerrain &&
          !isTileInMainView(tile as RuntimeTile)
        )
          continue;
        const model = (tile as RuntimeTile).engineData?.scene;
        if (!model) continue;
        readModelFrameBounds(model, runtimeState.tileBoundingBox);
        if (runtimeState.tileBoundingBox.isEmpty()) continue;
        if (
          !runtimeState.tileViewElevationFrustum.intersectsBox(
            runtimeState.tileBoundingBox
          )
        )
          continue;
        minimum = Math.min(minimum, runtimeState.tileBoundingBox.min.y);
        maximum = Math.max(maximum, runtimeState.tileBoundingBox.max.y);
      }
      return Number.isFinite(minimum) && Number.isFinite(maximum)
        ? [minimum, maximum]
        : null;
    };

  const getActiveTileVolumes: ThreeTilesRuntimeServices["getActiveTileVolumes"] =
    (): readonly SharedThreeSceneTileVolume[] => {
      if (!runtimeState.tiles || !runtimeState.runtimeVisible) return [];
      updateFrameFromTiles();
      const volumes: SharedThreeSceneTileVolume[] = [];
      for (const tile of runtimeState.tiles.activeTiles) {
        // Native traversal may keep active metadata/ancestors while the atomic
        // corridor cut is staged. Only the published surface supplies receivers.
        if (
          runtimeState.options.providesTerrain &&
          !runtimeState.tiles.visibleTiles.has(tile)
        )
          continue;
        if (
          runtimeState.options.providesTerrain &&
          !isTileInMainView(tile as RuntimeTile) &&
          (tile as RuntimeTile).shadowReceiverCenterness === undefined &&
          !runtimeState.committedMeshCasterFrontier.has(tile)
        )
          continue;
        const activeTile = tile as RuntimeTile;
        // Use the loaded surface, not an ECEF-axis-aligned metadata box rotated
        // into the local frame. That conservative double AABB can inflate a city
        // tile's vertical span by kilometres and destroy shadow contact resolution.
        runtimeState.activeTileBoundingBox.makeEmpty();
        const model = activeTile.engineData?.scene;
        if (model) {
          readModelFrameBounds(model, runtimeState.activeTileBoundingBox);
        }
        const boundingVolume = activeTile.engineData?.boundingVolume;
        if (
          runtimeState.activeTileBoundingBox.isEmpty() &&
          boundingVolume?.getAABB
        ) {
          readOrientedTileBounds(
            boundingVolume,
            runtimeState.activeTileBoundingBox,
            runtimeState.tileBoundsTransform
          );
          runtimeState.tileBoundsTransform.premultiply(
            runtimeState.frameFromTiles
          );
          runtimeState.activeTileBoundingBox.applyMatrix4(
            runtimeState.tileBoundsTransform
          );
        }
        if (runtimeState.activeTileBoundingBox.isEmpty()) continue;
        volumes.push({
          id: dependencies.getStableTileId(tile),
          kind: runtimeState.options.providesTerrain
            ? "terrain-tile"
            : "3d-tile",
          sourceId: runtimeState.tilesetUrl,
          steps: runtimeState.tileDebugProgress.has(tile)
            ? getThreeTileDiagnosticSteps(
                runtimeState.tileDebugProgress.get(tile)!,
                runtimeState.shadowView !== null,
                performance.now()
              )
            : undefined,
          geometricError: tile.geometricError,
          errorPixels: getTileScreenError(tile as RuntimeTile),
          loadReason: dependencies.getTileLoadReason(activeTile as RuntimeTile),
          receiverObjectId: model?.id,
          minimum: runtimeState.activeTileBoundingBox.min.toArray(),
          maximum: runtimeState.activeTileBoundingBox.max.toArray(),
        });
      }
      return volumes;
    };

  const isTileInMainView: ThreeTilesRuntimeServices["isTileInMainView"] = (
    tile: RuntimeTile
  ): boolean => {
    const cached = runtimeState.mainViewIntersectionCache.get(tile);
    if (cached !== undefined) return cached;
    const bounds = tile.engineData?.boundingVolume;
    if (
      !bounds ||
      !runtimeState.viewFrustumsReady ||
      typeof bounds.intersectsFrustum !== "function"
    ) {
      return tile.traversal?.inFrustum ?? false;
    }
    const inView =
      bounds.intersectsFrustum(runtimeState.tileViewFrustum) ||
      getTileCameraDemand(tile).receiver;
    runtimeState.mainViewIntersectionCache.set(tile, inView);
    return inView;
  };

  const isChildUnloadable: ThreeTilesRuntimeServices["isChildUnloadable"] = (
    child: RuntimeTile
  ): boolean =>
    runtimeState.deferred.has(child) ||
    runtimeState.tileRetries.isBlocked(child) ||
    (!child.internal?.hasContent && (child.children?.length ?? 0) === 0);

  /**
   * The main view converged when every displayed tile inside the main camera
   * frustum either meets the effective target or cannot refine any further
   * because all of its children are deferred, retry-blocked or empty.
   */
  const mainViewWithinErrorFactor: ThreeTilesRuntimeServices["mainViewWithinErrorFactor"] =
    (
      factor: number,
      allowBlocked = true,
      frontier: ReadonlySet<Tile> | undefined = runtimeState.options
        .providesTerrain
        ? runtimeState.displayedMeshFrontier
        : runtimeState.tiles?.visibleTiles
    ) => {
      // Mesh visibleTiles also contains offscreen casters (and their retained
      // parents). Only the loaded receiver cut drives viewport LOD progression;
      // corridor completeness is checked independently before shadow capture.
      // Testing the render union can strand a complete viewport at its coarse
      // startup target while every request queue is already empty.
      if (!runtimeState.tiles || !frontier || frontier.size === 0) return false;
      const acceptedError = runtimeState.effectiveErrorTarget * factor;
      const root = runtimeState.tiles.rootTileset?.root;
      if (runtimeState.options.providesTerrain && root) {
        // A complete-looking loaded subset is not proof of viewport coverage.
        // Missing intersecting branches must keep the settled demand audit alive.
        return (
          getReadyMeshRegionCut(root, frontier, acceptedError, (tile) => ({
            intersects:
              !(tile as RuntimeTile).engineData?.boundingVolume ||
              isTileInMainView(tile as RuntimeTile),
            errorPixels: getTileScreenError(tile as RuntimeTile),
          })) !== null
        );
      }
      for (const visible of frontier) {
        const tile = visible as RuntimeTile;
        const children = (tile.children ?? []) as RuntimeTile[];
        if (children.length === 0 || tile.traversal?.unconditionallyRefine) {
          continue;
        }
        if (!isTileInMainView(tile)) continue;
        if (getTileScreenError(tile) <= acceptedError) continue;
        // A loose parent box can intersect the camera while all processed child
        // volumes miss it. There is no visible refinement to fetch in that branch.
        // Test current bounds, not a previous traversal's inFrustum/failed flag;
        // unknown child bounds still block convergence until they are processed.
        if (
          children.every(
            (child) =>
              !hasMeshRefinementContentInView(
                child,
                (candidate) =>
                  !(candidate as RuntimeTile).engineData?.boundingVolume ||
                  isTileInMainView(candidate as RuntimeTile)
              )
          )
        )
          continue;
        if (!allowBlocked || !children.every(isChildUnloadable)) return false;
      }
      return true;
    };

  const mainViewConverged: ThreeTilesRuntimeServices["mainViewConverged"] =
    () => mainViewWithinErrorFactor(1);

  const getTileCenterness: ThreeTilesRuntimeServices["getTileCenterness"] = (
    bounds: NonNullable<RuntimeTile["engineData"]>["boundingVolume"]
  ) => {
    if (!bounds) return 0;
    bounds.getSphere(runtimeState.tileBoundingSphere);
    runtimeState.tileProjectedCenter
      .copy(runtimeState.tileBoundingSphere.center)
      .applyMatrix4(runtimeState.tileViewProjection);
    const centerDistance = Math.min(
      Math.SQRT2,
      Math.hypot(
        runtimeState.tileProjectedCenter.x - viewportFocusNdc.x,
        runtimeState.tileProjectedCenter.y - viewportFocusNdc.y
      )
    );
    return 1 - centerDistance / Math.SQRT2;
  };

  const getTileScreenError: ThreeTilesRuntimeServices["getTileScreenError"] = (
    tile: RuntimeTile,
    includeShadow = true
  ): number => {
    if (!runtimeState.tiles) return Number.POSITIVE_INFINITY;
    let cameraError = cameraErrors.get(tile);
    // The compiled union now includes the main observer. Do not max it with
    // the vendor's uncut-box SSE, which would reintroduce edge overrefinement.
    const volume = tile.engineData?.boundingVolume;
    if (
      cameraError === undefined &&
      volume?.getAABB &&
      runtimeState.tileCameraDemand.views.length > 0
    ) {
      const union = getTileCameraDemand(tile, true);
      if (union.required) {
        cameraError = union.errorRatio * runtimeState.effectiveErrorTarget;
        cameraErrors.set(tile, cameraError);
      }
    } else if (cameraError === undefined) {
      // Bootstrap/legacy fallback only when no compiled bound evaluation is
      // available. Never restore uncut-box SSE after a compiled frustum miss.
      const target = {
        inView: false,
        error: Number.POSITIVE_INFINITY,
        distanceFromCamera: Number.POSITIVE_INFINITY,
      };
      if (volume?.distanceToPoint) {
        runtimeState.tiles.calculateTileViewError(tile, target);
      } else if (isTileInMainView(tile)) {
        target.inView = true;
        target.error = tile.traversal?.error ?? Number.POSITIVE_INFINITY;
      }
      if (target.inView) {
        cameraError = target.error;
        if (volume?.distanceToPoint) cameraErrors.set(tile, cameraError);
      }
    }
    const bounds = tile.engineData?.boundingVolume;
    if (includeShadow && bounds?.getAABB && runtimeState.shadowReceiverMask) {
      readOrientedTileBounds(
        bounds,
        runtimeState.tileBoundingBox,
        runtimeState.tileBoundsTransform
      );
      // A staged finer receiver can have a smaller prism. The still-published
      // coarse family retains its fringe casters until their joint replacement;
      // those casters remain measurable against that committed receiver mask.
      if (
        runtimeState.shadowReceiverMask?.match(
          runtimeState.tileBoundingBox,
          runtimeState.shadowReceiverMatch,
          runtimeState.tileBoundsTransform,
          { key: tile, parent: tile.parent ?? undefined }
        )
      ) {
        return Math.max(
          cameraError ?? 0,
          receiverMatchedTileError(
            tile.geometricError,
            runtimeState.shadowReceiverMatch.receiverGeometricError,
            runtimeState.effectiveErrorTarget,
            runtimeState.shadowReceiverMatch.receiverPixelsPerMeter
          )
        );
      }
    }
    return cameraError ?? Number.POSITIVE_INFINITY;
  };

  const updateRootWorldBounds: ThreeTilesRuntimeServices["updateRootWorldBounds"] =
    (): boolean => {
      if (!runtimeState.tiles) return false;
      const volume = (
        runtimeState.tiles.rootTileset?.root as RuntimeTile | undefined
      )?.engineData?.boundingVolume;
      runtimeState.rootBoundsTransform.identity();
      if (volume?.getOBB) {
        readOrientedTileBounds(
          volume,
          runtimeState.rootTileBoundingBox,
          runtimeState.rootBoundsTransform
        );
      } else if (
        !runtimeState.tiles.getBoundingBox(runtimeState.rootTileBoundingBox)
      ) {
        return false;
      }
      // Expanding in ECEF before returning to the local frame can turn a thin
      // city surface into a kilometres-high box and an equally long caster ray.
      runtimeState.rootBoundsTransform.premultiply(updateFrameFromTiles());
      runtimeState.rootWorldBoundingBox
        .copy(runtimeState.rootTileBoundingBox)
        .applyMatrix4(runtimeState.rootBoundsTransform);
      return !runtimeState.rootWorldBoundingBox.isEmpty();
    };

  /** Main-view and prefetch-margin frustums in the tiles group frame. */
  const prepareViewFrustums: ThreeTilesRuntimeServices["prepareViewFrustums"] =
    (viewCamera: THREE.Camera) => {
      if (!runtimeState.tiles) return;
      // Scope native camera-error memoization to this audit, never a prior drag.
      cameraErrors = new WeakMap();
      // Refresh the parents directly, then let TilesGroup recompute its own
      // world matrix so its cached inverse (used by the traversal) stays in sync.
      runtimeState.offsetGroup.updateWorldMatrix(true, false);
      runtimeState.tiles.group.updateMatrixWorld(true);
      viewCamera.updateWorldMatrix(true, false);
      // Retention and request priorities read native SSE before tiles.update().
      // Refresh its cameraInfo now, or this audit memoizes the previous zoom.
      runtimeState.tiles.prepareForTraversal();
      runtimeState.tileViewProjection
        .multiplyMatrices(
          viewCamera.projectionMatrix,
          viewCamera.matrixWorldInverse
        )
        .multiply(runtimeState.tiles.group.matrixWorld);
      runtimeState.mainViewProjectionChanged =
        !runtimeState.lastMainViewProjection.equals(
          runtimeState.tileViewProjection
        );
      if (runtimeState.mainViewProjectionChanged) {
        runtimeState.mainViewIntersectionCache = new WeakMap();
        runtimeState.lastMainViewProjection.copy(
          runtimeState.tileViewProjection
        );
      }
      runtimeState.tileViewFrustum.setFromProjectionMatrix(
        runtimeState.tileViewProjection,
        viewCamera.coordinateSystem,
        viewCamera.reversedDepth
      );
      viewportFocusNdc.set(0, 0, -1).applyMatrix4(viewCamera.projectionMatrix);
      if (viewCamera instanceof THREE.PerspectiveCamera) {
        runtimeState.marginCamera.fov =
          viewCamera.fov * TILES_LOAD_POLICY.prefetchMarginFovFactor;
        runtimeState.marginCamera.aspect = viewCamera.aspect;
        runtimeState.marginCamera.near = viewCamera.near;
        runtimeState.marginCamera.far = viewCamera.far;
        runtimeState.marginCamera.zoom = viewCamera.zoom;
        runtimeState.marginCamera.updateProjectionMatrix();
        // Widen around the same principal point: padding shifts the optical
        // axis inside the full viewport, including all padded edge coverage.
        runtimeState.marginCamera.projectionMatrix.elements[8] =
          viewCamera.projectionMatrix.elements[8];
        runtimeState.marginCamera.projectionMatrix.elements[9] =
          viewCamera.projectionMatrix.elements[9];
        runtimeState.marginCamera.projectionMatrixInverse
          .copy(runtimeState.marginCamera.projectionMatrix)
          .invert();
        runtimeState.marginProjection
          .multiplyMatrices(
            runtimeState.marginCamera.projectionMatrix,
            viewCamera.matrixWorldInverse
          )
          .multiply(runtimeState.tiles.group.matrixWorld);
        runtimeState.marginFrustum.setFromProjectionMatrix(
          runtimeState.marginProjection,
          viewCamera.coordinateSystem,
          viewCamera.reversedDepth
        );
        const halfTan = Math.tan(THREE.MathUtils.degToRad(viewCamera.fov / 2));
        TILES_LOAD_POLICY.idleRingTanMultipliers.forEach((multiplier, k) => {
          runtimeState.marginCamera.fov = Math.min(
            175,
            2 * THREE.MathUtils.radToDeg(Math.atan(halfTan * multiplier))
          );
          runtimeState.marginCamera.updateProjectionMatrix();
          runtimeState.marginCamera.projectionMatrix.elements[8] =
            viewCamera.projectionMatrix.elements[8];
          runtimeState.marginCamera.projectionMatrix.elements[9] =
            viewCamera.projectionMatrix.elements[9];
          runtimeState.marginCamera.projectionMatrixInverse
            .copy(runtimeState.marginCamera.projectionMatrix)
            .invert();
          runtimeState.marginProjection
            .multiplyMatrices(
              runtimeState.marginCamera.projectionMatrix,
              viewCamera.matrixWorldInverse
            )
            .multiply(runtimeState.tiles!.group.matrixWorld);
          runtimeState.ringFrustums[k].setFromProjectionMatrix(
            runtimeState.marginProjection,
            viewCamera.coordinateSystem,
            viewCamera.reversedDepth
          );
        });
      } else {
        runtimeState.marginFrustum.copy(runtimeState.tileViewFrustum);
        for (const frustum of runtimeState.ringFrustums)
          frustum.copy(runtimeState.tileViewFrustum);
      }
      runtimeState.viewFrustumsReady = true;
    };

  const isTileInPrefetchMargin: ThreeTilesRuntimeServices["isTileInPrefetchMargin"] =
    (tile: RuntimeTile): boolean => {
      const bounds = tile.engineData?.boundingVolume;
      if (!bounds || !runtimeState.viewFrustumsReady) return false;
      return bounds.intersectsFrustum(runtimeState.marginFrustum);
    };

  const getTileRingIndex: ThreeTilesRuntimeServices["getTileRingIndex"] = (
    tile: RuntimeTile
  ): number => {
    const bounds = tile.engineData?.boundingVolume;
    if (!bounds || !runtimeState.viewFrustumsReady) return 0;
    for (let k = 0; k < runtimeState.ringFrustums.length; k++)
      if (bounds.intersectsFrustum(runtimeState.ringFrustums[k])) return k + 1;
    // The last ring is the whole model at the coarsest level of the cascade,
    // so nothing of the extent is ever unloaded below that level.
    return runtimeState.ringFrustums.length + 1;
  };

  const isMainViewReady: ThreeTilesRuntimeServices["isMainViewReady"] = () =>
    mainViewWithinErrorFactor(
      runtimeState.requestedErrorTarget / runtimeState.effectiveErrorTarget,
      false
    );
  return {
    readModelFrameBounds,
    updateFrameFromTiles,
    getViewElevationRange,
    getActiveTileVolumes,
    isTileInMainView,
    getTileCameraDemand,
    getTileRequestPriority,
    isChildUnloadable,
    mainViewWithinErrorFactor,
    mainViewConverged,
    getTileCenterness,
    getTileScreenError,
    updateRootWorldBounds,
    prepareViewFrustums,
    isTileInPrefetchMargin,
    getTileRingIndex,
    isMainViewReady,
  };
}
