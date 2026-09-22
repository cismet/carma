import { type Tile } from "3d-tiles-renderer/core";
import type { TilesRuntimeDebugState } from "../diagnostics/tile-diagnostic-state";
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
import { recordThreeTileWait } from "./three-tiles-diagnostic-steps";
import { resolveTileContentUrl } from "./three-tiles-runtime-vendor";

/** Console/probe registry only; registering a runtime does not sample it. */
export const debugTilesRuntimes = (): Set<unknown> | null => {
  if (typeof window === "undefined") return null;
  const host = window as unknown as { __carmaTiles3d?: Set<unknown> };
  return (host.__carmaTiles3d ??= new Set());
};

/** debug responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesDebug(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | keyof TilesRuntimeDebugState
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
    | "options"
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
  // Decision: ../../../../TILES_COVERAGE.md#progressive-shadow-families-and-wait-telemetry
  // Bounded transition records, independent of debug geometry and scheduling.
  const waitEvents: unknown[] = [];
  let waitObservation = 0;
  const activeWaits = new Map<
    Tile,
    Partial<Record<"receiver" | "shadow", number>>
  >();
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
          void import("./three-tiles-debug-overlay")
            .then((module) => {
              createOverlay = module.createThreeTilesDebugOverlay;
              loadingOverlay = false;
              if (
                runtimeState.tileBoundsVisible &&
                runtimeState.tiles === tiles
              ) {
                syncTileDebugOverlay();
                runtimeState.map?.triggerRepaint();
              }
            })
            .catch((error: unknown) => {
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
      runtimeState.tileDebugOverlay ??= createOverlay(tiles.group);
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
        const visibleAt = progress.visibleAt ?? now;
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
  const recordTileWait: ThreeTilesRuntimeServices["recordTileWait"] = (
    tile,
    role,
    reason,
    blocker
  ) => {
    if (
      !runtimeState.options.diagnostics ||
      runtimeState.options.tileTelemetry === false
    )
      return;
    const progress = getTileDebugProgress(tile);
    const now = performance.now();
    let roles = activeWaits.get(tile);
    if (reason !== null) {
      if (!roles) activeWaits.set(tile, (roles = {}));
      roles[role] = waitObservation;
    } else if (roles) {
      delete roles[role];
      if (Object.keys(roles).length === 0) activeWaits.delete(tile);
    }
    // No diagnostic reference may retain an unbounded evicted tile history.
    if (activeWaits.size > 1024) {
      const oldest = activeWaits.keys().next().value!;
      const previous = runtimeState.tileDebugProgress.get(oldest);
      if (previous)
        for (const role of ["receiver", "shadow"] as const)
          recordThreeTileWait(previous, role, null, now);
      activeWaits.delete(oldest);
    }
    if (
      !recordThreeTileWait(
        progress,
        role,
        reason,
        now,
        blocker ? resolveTileContentUrl(blocker) : undefined
      )
    )
      return;
    if (waitEvents.length < 32)
      waitEvents.push({
        url: resolveTileContentUrl(tile),
        role,
        reason,
        waits: progress.waits?.map((wait) => ({
          ...wait,
          ms: (wait.until ?? now) - wait.since,
        })),
      });
  };
  return {
    recordTileWait,
    beginTileWaitObservation: () => {
      waitObservation++;
    },
    endTileWaitObservation: () => {
      // Once a new cut no longer demands this role, it is not still waiting.
      for (const [tile, roles] of activeWaits)
        for (const role of ["receiver", "shadow"] as const)
          if (roles[role] !== undefined && roles[role] !== waitObservation)
            recordTileWait(tile, role, null);
    },
    setTelemetryEnabled(enabled: boolean) {
      runtimeState.options.tileTelemetry = enabled;
      if (enabled) {
        runtimeState.options.diagnostics = true;
        if (runtimeState.tiles) debugTilesRuntimes()?.add(runtimeState);
        runtimeState.map?.triggerRepaint();
      } else {
        const now = performance.now();
        for (const tile of activeWaits.keys()) {
          const progress = runtimeState.tileDebugProgress.get(tile);
          if (progress)
            for (const role of ["receiver", "shadow"] as const)
              recordThreeTileWait(progress, role, null, now);
        }
        activeWaits.clear();
        waitEvents.length = 0;
      }
    },
    drainTileWaitEvents: () => waitEvents.splice(0),
    readState: (): Readonly<TilesRuntimeDebugState> | undefined =>
      runtimeState.options.diagnostics ? runtimeState : undefined,
    getTileDebugId,
    getTileDebugProgress,
    recordTileIteration,
    formatDebugDuration,
    getStableTileId,
    syncTileDebugOverlay,
    setTileBoundsVisible,
    setDiagnosticsEnabled(enabled: boolean) {
      runtimeState.options.diagnostics = enabled;
      if (enabled && runtimeState.tiles)
        debugTilesRuntimes()?.add(runtimeState);
      else debugTilesRuntimes()?.delete(runtimeState);
    },
  };
}
