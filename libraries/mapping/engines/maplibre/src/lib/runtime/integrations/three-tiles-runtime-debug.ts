import { type Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import {
  maximumSweepDistanceWithinBox,
  type ShadowReceiverMatch,
} from "../../core/shadow-receiver-mask";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import type { createThreeTilesDebugOverlay } from "./three-tiles-debug-overlay";
import {
  getMeshLoadStage,
  meshShadowStageError,
} from "./three-tiles-load-policy";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  MeshTileDebugProgress,
  RuntimeTile,
} from "./three-tiles-runtime-types";
import { resolveTileContentUrl } from "./three-tiles-runtime-vendor";

/** debug responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesDebug(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "tileDebugIds"
    | "nextTileDebugId"
    | "layerId"
    | "tileDebugProgress"
    | "tiles"
    | "tilesetUrl"
    | "tileBoundsVisible"
    | "tileDebugOverlay"
    | "tileDebugOverlayUpdatedAt"
    | "shadowView"
    | "sunwardDirection"
    | "committedMeshCasterFrontier"
    | "requestedErrorTarget"
    | "rootWorldBoundingBox"
    | "sourceWorldBoundsTransform"
    | "sourceWorldBoundingBox"
    | "map"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "isTileInMainView"
    | "updateRootWorldBounds"
    | "createReceiverSnapshot"
    | "getTileScreenError"
    | "peekShadowRegionRevision"
  >
) {
  let createOverlay: typeof createThreeTilesDebugOverlay | undefined;
  let loadingOverlay = false;
  const getTileDebugId: ThreeTilesRuntimeServices["getTileDebugId"] = (
    tile: Tile
  ) => {
    let sequence = runtimeState.tileDebugIds.get(tile);
    if (sequence === undefined) {
      sequence = runtimeState.nextTileDebugId++;
      runtimeState.tileDebugIds.set(tile, sequence);
    }
    const uri = tile.content?.uri;
    const depth = (tile as Tile & { internal?: { depth?: number } }).internal
      ?.depth;
    return `${runtimeState.layerId}:${uri ?? `d${depth ?? "?"}:t${sequence}`}`;
  };

  const getTileDebugProgress: ThreeTilesRuntimeServices["getTileDebugProgress"] =
    (tile: Tile): MeshTileDebugProgress => {
      let progress = runtimeState.tileDebugProgress.get(tile);
      if (!progress) {
        progress = {
          discoveredAt: performance.now(),
          iterations: 0,
          lastIterationFrame: -1,
        };
        runtimeState.tileDebugProgress.set(tile, progress);
      }
      return progress;
    };

  const recordTileIteration: ThreeTilesRuntimeServices["recordTileIteration"] =
    (tile: Tile) => {
      const progress = getTileDebugProgress(tile);
      const frame = runtimeState.tiles?.frameCount ?? -1;
      if (progress.lastIterationFrame === frame) return;
      progress.lastIterationFrame = frame;
      progress.iterations += 1;
    };

  const formatDebugDuration: ThreeTilesRuntimeServices["formatDebugDuration"] =
    (milliseconds: number | undefined): string =>
      milliseconds === undefined || !Number.isFinite(milliseconds)
        ? "–"
        : `${Math.max(0, milliseconds / 1_000).toFixed(2)}s`;

  const getStableTileId: ThreeTilesRuntimeServices["getStableTileId"] = (
    tile: Tile
  ) => {
    const path: number[] = [];
    for (let entry = tile; entry.parent; entry = entry.parent) {
      path.push(entry.parent.children?.indexOf(entry) ?? -1);
    }
    return `${runtimeState.tilesetUrl}#${path.reverse().join("/")}:${
      resolveTileContentUrl(tile) ?? "metadata"
    }`;
  };

  /** The overlay only exists while tile bounds are shown. */
  const syncTileDebugOverlay: ThreeTilesRuntimeServices["syncTileDebugOverlay"] =
    () => {
      const tiles = runtimeState.tiles;
      if (!tiles) return;
      if (!runtimeState.tileBoundsVisible) {
        runtimeState.tileDebugOverlay?.dispose();
        runtimeState.tileDebugOverlay = null;
        return;
      }
      if (!createOverlay) {
        if (!loadingOverlay) {
          loadingOverlay = true;
          void import("./three-tiles-debug-overlay").then((module) => {
            createOverlay = module.createThreeTilesDebugOverlay;
            loadingOverlay = false;
            if (runtimeState.tileBoundsVisible && runtimeState.tiles === tiles) {
              syncTileDebugOverlay();
              runtimeState.map?.triggerRepaint();
            }
          }).catch((error: unknown) => {
            loadingOverlay = false;
            console.error("Unable to load mesh diagnostics", error);
          });
        }
        return;
      }
      const now = performance.now();
      // Diagnostics must observe production work, never drive it. Text/line
      // rebuilds are intentionally slow and the readiness probe below only
      // reads an existing corridor proof.
      if (now - runtimeState.tileDebugOverlayUpdatedAt < 1_000) return;
      runtimeState.tileDebugOverlayUpdatedAt = now;
      runtimeState.tileDebugOverlay ??= createOverlay(
        tiles.group
      );
      const receiverTiles = [...tiles.visibleTiles].filter((tile) =>
        dependencies.isTileInMainView(tile as RuntimeTile)
      );
      tiles.group.updateWorldMatrix(true, false);
      dependencies.updateRootWorldBounds();
      const groupWorldInverse = tiles.group.matrixWorld.clone().invert();
      const sourceCamera = runtimeState.shadowView?.camera;
      if (sourceCamera) {
        sourceCamera.updateMatrixWorld(true);
        sourceCamera
          .getWorldDirection(runtimeState.sunwardDirection)
          .negate()
          .normalize();
      }
      const localSunwardDirection = sourceCamera
        ? runtimeState.sunwardDirection
            .clone()
            .transformDirection(groupWorldInverse)
        : null;
      const volumes = receiverTiles.flatMap((tile) => {
        const runtimeTile = tile as RuntimeTile;
        const bounds = runtimeTile.engineData?.boundingVolume;
        if (!bounds?.getAABB) return [];
        const box = new THREE.Box3();
        const transform = new THREE.Matrix4();
        readOrientedTileBounds(bounds, box, transform);
        if (box.isEmpty()) return [];
        let casterCount = 0;
        const receiverMask = dependencies.createReceiverSnapshot(
          new Set([tile])
        )?.mask;
        if (receiverMask) {
          const match: ShadowReceiverMatch = {
            receiverGeometricError: Number.POSITIVE_INFINITY,
            receiverCenterness: 0,
            lightFacing: 0,
          };
          for (const caster of runtimeState.committedMeshCasterFrontier) {
            const casterVolume = (caster as RuntimeTile).engineData
              ?.boundingVolume;
            if (!casterVolume?.getAABB) continue;
            const casterBox = new THREE.Box3();
            const casterTransform = new THREE.Matrix4();
            readOrientedTileBounds(casterVolume, casterBox, casterTransform);
            if (
              !casterBox.isEmpty() &&
              receiverMask.match(casterBox, match, casterTransform)
            ) {
              casterCount += 1;
            }
          }
        }
        const errorPixels = dependencies.getTileScreenError(runtimeTile);
        const stage = getMeshLoadStage(
          errorPixels,
          runtimeState.requestedErrorTarget
        );
        const progress = getTileDebugProgress(tile);
        progress.loadedAt ??= runtimeTile.engineData?.scene ? now : undefined;
        progress.visibleAt ??= now;
        const visibleAt = progress.visibleAt;
        let corridorDistance = 0;
        let corridorReady = false;
        if (sourceCamera && !runtimeState.rootWorldBoundingBox.isEmpty()) {
          runtimeState.sourceWorldBoundsTransform.multiplyMatrices(
            tiles.group.matrixWorld,
            transform
          );
          runtimeState.sourceWorldBoundingBox
            .copy(box)
            .applyMatrix4(runtimeState.sourceWorldBoundsTransform);
          corridorDistance = maximumSweepDistanceWithinBox(
            runtimeState.sourceWorldBoundingBox,
            runtimeState.rootWorldBoundingBox,
            runtimeState.sunwardDirection
          );
          corridorReady =
            dependencies.peekShadowRegionRevision(
              runtimeState.sourceWorldBoundingBox,
              meshShadowStageError(
                errorPixels,
                runtimeState.requestedErrorTarget
              ),
              runtimeState.sourceWorldBoundingBox
            ) !== null;
        }
        if (corridorReady) progress.corridorReadyAt ??= now;
        const stable = stage.stable && corridorReady;
        if (stable) progress.stableAt ??= now;
        const totalElapsed = (progress.stableAt ?? now) - progress.discoveredAt;
        const queueElapsed = progress.queuedAt
          ? progress.queuedAt - progress.discoveredAt
          : undefined;
        const loadElapsed = progress.loadedAt
          ? progress.loadedAt - (progress.queuedAt ?? progress.discoveredAt)
          : undefined;
        const visibleElapsed = progress.visibleAt
          ? visibleAt - (progress.loadedAt ?? progress.discoveredAt)
          : undefined;
        const corridorElapsed = progress.corridorReadyAt
          ? progress.corridorReadyAt - visibleAt
          : now - visibleAt;
        return [
          {
            id: getStableTileId(tile),
            bounds: box,
            boundsTransform: transform,
            loadReason: "viewport" as const,
            details: [
              `stage ${stage.current}/${stage.total} · ${
                stable
                  ? "stable"
                  : corridorReady
                  ? "corridor ready"
                  : "corridor streaming"
              } · ${
                Number.isFinite(errorPixels) ? errorPixels.toFixed(2) : "∞"
              } px`,
              `total ${formatDebugDuration(totalElapsed)} · ${
                progress.iterations
              } iterations`,
              `queue ${formatDebugDuration(
                queueElapsed
              )} · load ${formatDebugDuration(
                loadElapsed
              )} · visible ${formatDebugDuration(visibleElapsed)}`,
              `corridor ${formatDebugDuration(
                corridorElapsed
              )} · ${casterCount}/${
                runtimeState.committedMeshCasterFrontier.size
              } casters`,
            ],
            ...(localSunwardDirection && corridorDistance > 0
              ? {
                  corridor: {
                    direction: localSunwardDirection,
                    distance: corridorDistance,
                  },
                }
              : {}),
          },
        ];
      });
      runtimeState.tileDebugOverlay.update(volumes);
    };

  const setTileBoundsVisible: ThreeTilesRuntimeServices["setTileBoundsVisible"] =
    (enabled: boolean) => {
      if (runtimeState.tileBoundsVisible === enabled) return;
      runtimeState.tileBoundsVisible = enabled;
      if (!enabled) runtimeState.tileDebugProgress = new WeakMap();
      runtimeState.tileDebugOverlayUpdatedAt = -Infinity;
      syncTileDebugOverlay();
      runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
      runtimeState.map?.triggerRepaint();
    };
  return {
    getTileDebugId,
    getTileDebugProgress,
    recordTileIteration,
    formatDebugDuration,
    getStableTileId,
    syncTileDebugOverlay,
    setTileBoundsVisible,
  };
}
