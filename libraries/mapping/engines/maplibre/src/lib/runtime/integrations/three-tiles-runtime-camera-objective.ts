import type { Tile } from "3d-tiles-renderer/core";
import { Box3, Matrix4 } from "three";
import {
  evaluateMeshCameraObjective,
  nextMeshCameraErrorTarget,
  type MeshCameraContribution,
} from "../../core/mesh-camera-objective";
import {
  createMeshRegionCutQuery,
  isLoadedMesh,
  isMeshTileUnconditionallyRefined,
} from "../../core/mesh-tile-coverage";
import {
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
  type TileCameraContribution,
} from "../../core/tile-camera-demand";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import { UNLOADED_LOADING_STATE } from "./three-tiles-runtime-vendor";

type CameraObjectiveState = Pick<
  ThreeTilesRuntimeState,
  | "tileCameraDemand"
  | "tileRetries"
  | "tiles"
  | "displayedMeshFrontier"
  | "meshContentRevision"
  | "requestedErrorTarget"
  | "memoryErrorTarget"
  | "effectiveErrorTarget"
>;

/** Camera errors are cached per bound and camera snapshot. Projected footprints
 * are added lazily for request ranking, then reused. Error is linear in
 * geometricError, so candidate and fallback share their per-camera measurement.
 */
export function createMeshCameraObjectives(state: CameraObjectiveState) {
  const bounds = new Box3();
  const transform = new Matrix4();
  let owner: unknown;
  type CameraUnits = {
    errors?: readonly TileCameraContribution[];
    areas?: readonly TileCameraContribution[];
  };
  let units = new WeakMap<Tile, CameraUnits>();
  // Content/mask revisions change publication, but usually not a tile's bounds.
  // Keep the expensive projection only while its numerical geometry is exact.
  let projections = new WeakMap<
    Tile,
    CameraUnits & { bounds: Box3; transform: Matrix4; scale: number }
  >();
  const placement = new Matrix4();
  let placementFrame = -1;
  let placementGroup: unknown;
  let frame = -1;
  let revision = -1;
  let requestedTarget = NaN;
  let memoryTarget = NaN;
  let effectiveTarget = NaN;
  let displayed: unknown;
  let cuts = new Map<string, ReturnType<typeof createMeshRegionCutQuery>>();
  let objectives = new WeakMap<Tile, ReturnType<typeof evaluate>>();
  let publishedAncestors: Set<Tile> | undefined;

  const sync = () => {
    const nextFrame = state.tiles?.frameCount ?? -1;
    const group = state.tiles?.group;
    let placementChanged = false;
    if (placementFrame !== nextFrame || placementGroup !== group) {
      placementFrame = nextFrame;
      placementGroup = group;
      placementChanged = !!group && !placement.equals(group.matrixWorld);
      if (group) placement.copy(group.matrixWorld);
    }
    const geometryChanged =
      owner !== state.tileCameraDemand ||
      revision !== state.meshContentRevision ||
      placementChanged;
    if (geometryChanged) {
      if (owner !== state.tileCameraDemand) projections = new WeakMap();
      owner = state.tileCameraDemand;
      units = new WeakMap();
    }
    if (
      geometryChanged ||
      requestedTarget !== state.requestedErrorTarget ||
      memoryTarget !== state.memoryErrorTarget ||
      effectiveTarget !== state.effectiveErrorTarget ||
      frame !== state.tiles?.frameCount ||
      revision !== state.meshContentRevision ||
      displayed !== state.displayedMeshFrontier
    ) {
      requestedTarget = state.requestedErrorTarget;
      memoryTarget = state.memoryErrorTarget;
      effectiveTarget = state.effectiveErrorTarget;
      frame = state.tiles?.frameCount ?? -1;
      revision = state.meshContentRevision;
      displayed = state.displayedMeshFrontier;
      cuts = new Map();
      objectives = new WeakMap();
      publishedAncestors = undefined;
    }
  };
  const readUnits = (
    tile: RuntimeTile,
    includeVisibleArea = false
  ): readonly TileCameraContribution[] => {
    sync();
    const cached = units.get(tile);
    const hit = includeVisibleArea
      ? cached?.areas
      : cached?.areas ?? cached?.errors;
    if (hit) return hit;
    const volume = tile.engineData?.boundingVolume;
    if (!volume?.getAABB || !state.tiles) return [];
    readOrientedTileBounds(volume, bounds, transform);
    transform.premultiply(state.tiles.group.matrixWorld);
    const scale = state.tiles.group.matrixWorld.getMaxScaleOnAxis();
    let projected = projections.get(tile);
    if (
      !projected ||
      !projected.bounds.equals(bounds) ||
      !projected.transform.equals(transform) ||
      projected.scale !== scale
    ) {
      projected = {
        bounds: bounds.clone(),
        transform: transform.clone(),
        scale,
      };
      projections.set(tile, projected);
    }
    let contributions = includeVisibleArea
      ? projected.areas
      : projected.areas ?? projected.errors;
    if (!contributions) {
      const result = state.tileCameraDemand.evaluate(
        bounds,
        scale,
        undefined,
        includeVisibleArea,
        transform,
        true
      );
      contributions = (result.contributions ?? []).map((view) => ({ ...view }));
      if (includeVisibleArea) projected.areas = contributions;
      else projected.errors = contributions;
    }
    const copied = contributions;
    const entry = cached ?? {};
    if (includeVisibleArea) entry.areas = copied;
    else entry.errors = copied;
    units.set(tile, entry);
    return copied;
  };
  const publishedFor = (id: string): ReadonlySet<Tile> =>
    id === TILE_MAIN_OBSERVER_ID
      ? state.displayedMeshFrontier
      : state.tiles?.visibleTiles ?? state.displayedMeshFrontier;
  const fallbackFor = (tile: Tile, id: string): Tile | null => {
    const published = publishedFor(id);
    for (let ancestor: Tile | null = tile; ancestor; ancestor = ancestor.parent)
      if (
        published.has(ancestor) &&
        (ancestor === tile || ancestor.refine === "REPLACE") &&
        isLoadedMesh(ancestor) &&
        !isMeshTileUnconditionallyRefined(ancestor)
      )
        return ancestor;
    return null;
  };
  const covered = (tile: Tile, id: string) => {
    let query = cuts.get(id);
    if (!query) {
      query = createMeshRegionCutQuery(
        publishedFor(id),
        Number.MAX_VALUE,
        (candidate) => ({
          intersects:
            !(candidate as RuntimeTile).engineData?.boundingVolume?.getAABB ||
            readUnits(candidate as RuntimeTile).some((view) => view.id === id),
          errorPixels: 0,
        })
      );
      cuts.set(id, query);
    }
    return query(tile) !== null;
  };
  const hasPublishedReplacementDescendant = (tile: Tile): boolean => {
    if (tile.refine !== "REPLACE") return false;
    if (!publishedAncestors) {
      publishedAncestors = new Set();
      for (const view of state.tileCameraDemand.views)
        for (const member of publishedFor(view.id)) {
          if (!isLoadedMesh(member)) continue;
          for (let parent = member.parent; parent; parent = parent.parent) {
            // The first visit already inserted this ancestor's complete path.
            if (publishedAncestors.has(parent)) break;
            publishedAncestors.add(parent);
          }
        }
    }
    return publishedAncestors.has(tile);
  };
  const targetFor = (view: TileCameraContribution) =>
    view.id === TILE_MAIN_OBSERVER_ID
      ? Math.max(state.requestedErrorTarget, state.memoryErrorTarget)
      : view.errorTargetPixels;

  const demand = (tile: RuntimeTile, includeObserver: boolean) => {
    const views = readUnits(tile);
    let errorRatio = 0,
      refinementErrorRatio = 0,
      viewCount = 0,
      priority = -Infinity;
    let receiver = false;
    let needsDrawableCoverage = false;
    const preservesFinerCut = hasPublishedReplacementDescendant(tile);
    const exhaustedReplacement =
      tile.refine === "REPLACE" &&
      (tile.children?.length ?? 0) > 0 &&
      tile.internal?.loadingState === UNLOADED_LOADING_STATE &&
      state.tileRetries.isExhausted(tile);
    for (const view of views) {
      if (!includeObserver && view.id === TILE_MAIN_OBSERVER_ID) continue;
      viewCount++;
      receiver ||= view.role === TILE_CAMERA_ROLE.RECEIVER;
      priority = Math.max(priority, view.priority < 0 ? view.priority : 1);
      const error = view.errorPixels * tile.geometricError;
      const fallback = fallbackFor(tile, view.id);
      needsDrawableCoverage ||=
        view.priority >= 0 &&
        tile.internal?.hasRenderableContent === true &&
        fallback === null &&
        !preservesFinerCut &&
        !exhaustedReplacement;
      const base = targetFor(view);
      // Movement/admission floors only affect new work. Existing cut retention
      // keeps the final-demand ratio in the snapshot's normalized units.
      const floor =
        view.id === TILE_MAIN_OBSERVER_ID ? state.effectiveErrorTarget : base;
      const stage = Math.max(
        floor,
        fallback
          ? nextMeshCameraErrorTarget(
              base,
              view.errorPixels * fallback.geometricError
            )
          : view.errorTargetPixels
      );
      errorRatio = Math.max(errorRatio, error / view.errorTargetPixels);
      refinementErrorRatio = Math.max(refinementErrorRatio, error / stage);
    }
    if (viewCount > 0) {
      if (needsDrawableCoverage) {
        // Load the first drawable approximation before traversing to detail.
        // A different camera's refinement must not replace a pending receiver
        // while that receiver still waits for coarse external caster coverage.
        refinementErrorRatio = Math.min(refinementErrorRatio, 1);
      } else if (
        exhaustedReplacement ||
        preservesFinerCut ||
        (!tile.internal?.hasRenderableContent &&
          (tile.internal?.hasUnrenderableContent || tile.children?.length))
      ) {
        // Exhausted replacement payloads must let healthy children repair the
        // gap, even below the error target. Pending retries still stop above.
        // Metadata and ancestors of the fine cut likewise remain traversal paths.
        refinementErrorRatio = Math.max(
          refinementErrorRatio,
          1 + Number.EPSILON
        );
      }
    }
    return {
      required: viewCount > 0,
      receiver,
      errorRatio,
      refinementErrorRatio,
      priority,
    };
  };

  function evaluate(tile: RuntimeTile) {
    const contributions: MeshCameraContribution[] = [];
    let group: Tile = tile;
    let provisional = false;
    let areaPixels = 0;
    for (const view of readUnits(tile, true)) {
      if (view.priority < 0) continue;
      const fallback = fallbackFor(tile, view.id);
      if (!fallback && covered(tile, view.id)) continue;
      // Camera-specific fallbacks are ancestors on one path. The outermost
      // replacement family owns atomic handover, independent of camera order.
      if (fallback)
        for (
          let ancestor: Tile | null = group;
          ancestor;
          ancestor = ancestor.parent
        )
          if (ancestor === fallback) {
            group = fallback;
            break;
          }
      const current = fallback
        ? view.errorPixels * fallback.geometricError
        : null;
      let next = view.errorPixels * tile.geometricError;
      // A published node also owns discovery of unprocessed child metadata.
      // Score that discovery against its visible children instead of zeroing it.
      if (fallback === tile) {
        let found = false;
        next = 0;
        for (const child of tile.children ?? []) {
          const childView = readUnits(child as RuntimeTile).find(
            (entry) => entry.id === view.id
          );
          if (childView) {
            found = true;
            next = Math.max(next, childView.errorPixels * child.geometricError);
          } else if (!(child as RuntimeTile).engineData?.boundingVolume)
            provisional = true;
        }
        if (!found) next = provisional ? targetFor(view) : current ?? 0;
      }
      if (!tile.internal?.hasRenderableContent) {
        // Metadata has no drawable approximation of its own. Its potential is
        // discovery down to the camera's target, not its inherited coarse error.
        provisional = true;
        next = targetFor(view);
      }
      areaPixels += view.visibleAreaPixels;
      contributions.push({
        id: view.id,
        currentErrorPixels: current,
        nextErrorPixels: next,
        visibleAreaFraction: view.visibleAreaFraction,
        targetErrorPixels: targetFor(view),
      });
    }
    const objective = evaluateMeshCameraObjective(contributions);
    return { ...objective, group, visibleAreaPixels: areaPixels, provisional };
  }
  const objective = (tile: RuntimeTile) => {
    sync();
    let result = objectives.get(tile);
    if (!result) {
      result = evaluate(tile);
      objectives.set(tile, result);
    }
    return result;
  };
  const reset = () => {
    // Capacity preemption refreshes mutable published cuts, not camera geometry.
    // sync() still invalidates units for content, mask, camera or placement changes.
    cuts = new Map();
    objectives = new WeakMap();
    publishedAncestors = undefined;
  };
  return { demand, objective, reset };
}
