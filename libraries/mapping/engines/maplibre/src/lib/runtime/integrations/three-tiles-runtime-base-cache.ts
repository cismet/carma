import { meshBaseMemoryBudget } from "../../core/mesh-error-policy";
import { MeshBaseCachePlugin } from "./mesh-base-cache-plugin";
import { cacheCeilingBuildId } from "./three-tiles-cache-ceiling-memory";
import type { Object3D } from "three";
import type { Tile } from "3d-tiles-renderer/core";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";

type State = Pick<
  ThreeTilesRuntimeState,
  | "options"
  | "tiles"
  | "tilesetUrl"
  | "extentGeometricError"
  | "ceilingBytes"
  | "lastMainViewConverged"
  | "loadingPaused"
  | "map"
  | "extentFloorArmed"
  | "extentFloorAuditPending"
>;

/** The resident source base is shared by shaded and unshaded presentation. */
export const registerMeshBaseCache = (
  state: State,
  fetchSource: (
    url: string,
    options: RequestInit
  ) => Promise<Response | ArrayBuffer>,
  prepareModel: (
    scene: Object3D,
    tile: Tile,
    signal?: AbortSignal
  ) => Promise<void>
): MeshBaseCachePlugin | null => {
  // HMR module paths do not identify an immutable producer build.
  if (
    !import.meta.env.PROD ||
    !state.tiles ||
    !state.options.persistBaseTiles ||
    !state.options.providesTerrain ||
    state.options.mercatorProjection ||
    typeof Worker === "undefined"
  )
    return null;
  const plugin = new MeshBaseCachePlugin({
    sourceUrl: state.tilesetUrl,
    buildId: cacheCeilingBuildId(import.meta.url),
    extentError: () => state.extentGeometricError,
    memoryBudget: () =>
      meshBaseMemoryBudget(
        state.ceilingBytes,
        state.options.baseCoverageMemoryShare
      ),
    canPrepare: () =>
      state.lastMainViewConverged &&
      !state.loadingPaused &&
      !state.map?.isMoving?.(),
    onConfirmed: () => {
      state.extentFloorArmed = true;
      state.extentFloorAuditPending = true;
      state.tiles?.dispatchEvent({ type: "needs-update" });
    },
    fetchSource,
    prepareModel,
  });
  state.tiles.registerPlugin(plugin);
  return plugin;
};
