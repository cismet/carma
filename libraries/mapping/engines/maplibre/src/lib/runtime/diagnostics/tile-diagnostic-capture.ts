import * as THREE from "three";
import type { Tile } from "3d-tiles-renderer/core";
import { projectTileDiagnosticViewport } from "./tile-diagnostic-viewport";
import { readEnuToLocalYUpSceneRotationMatrix } from "@carma-commons/camera/model";
import { ecefToEnuMatrix } from "@carma-geo/proj";
import {
  snapshotTileCameraViews,
  createTileCameraDemand,
  TILE_MAIN_OBSERVER_ID,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import { estimateTileTargetSteps } from "../integrations/three-tiles-runtime-coverage";
import {
  collectFloorLeaves,
  tileWorldBox,
  loadingTilesOf,
  tileId,
  levelsToTarget,
  kindOf,
  type RuntimeTile,
  type TilesRuntimeDebugState,
} from "./tile-diagnostic-state";
import type {
  Kind,
  OverlayModel,
  OverlayRect,
} from "../../core/diagnostics/tile-diagnostic-model";
import { yieldTileDiagnosticTask } from "./tile-diagnostic-scheduler";

export type TileDiagnosticCaptureOptions = {
  width: number;
  height: number;
  overviewUp: "tileset" | "camera-tangent" | string;
  overviewView: string;
  showOverlay: boolean;
  showOverviewPanel: boolean;
  showFrustum: boolean;
  showResident: boolean;
  sceneLabels: boolean;
};

/** Read live scene objects only on the owner thread; yield between bounded batches.
 * The returned numeric model is the input to the independent worker mailbox.
 */
export const captureTileDiagnostics = async (
  state: Readonly<TilesRuntimeDebugState>,
  camera: THREE.Camera | null,
  options: TileDiagnosticCaptureOptions,
  isCancelled: () => boolean = () => false
) => {
  const tiles = state.tiles,
    root = tiles?.root;
  if (!tiles || !root || isCancelled()) return null;
  const { width, height } = options;
  if (width <= 48 || height <= 48) return null;
  const group = tiles.group;
  group.updateWorldMatrix(true, false);
  // Keep one camera union/target for the entire yielding capture. A camera
  // update replaces the runtime evaluator; mixing revisions invents missing LODs.
  const targetPixels = state.requestedErrorTarget;
  const runtimeDemand = state.tileCameraDemand;
  // Loader staging changes admission, not the diagnostic quality contract.
  // Re-normalize the main camera too: merely changing the label would leave
  // errorRatio relative to the temporary coarse movement/startup target.
  const cameraDemand = runtimeDemand.views?.some(
    (view) =>
      view.id === TILE_MAIN_OBSERVER_ID &&
      view.errorTargetPixels !== targetPixels
  )
    ? createTileCameraDemand(
        runtimeDemand.views.map((view) =>
          view.id === TILE_MAIN_OBSERVER_ID
            ? { ...view, errorTargetPixels: targetPixels }
            : view
        )
      )
    : runtimeDemand;
  const worldScale = group.matrixWorld.getMaxScaleOnAxis();
  const renderCamera = camera?.clone() ?? null;
  const cache = tiles.lruCache as unknown as { itemSet: Map<Tile, unknown> };
  const extent = new THREE.Box3(),
    box = new THREE.Box3();
  let iterations = 0,
    sliceStart = performance.now();
  if (!tileWorldBox(root, group, extent)) return null;
  const worldToEcef = group.matrixWorld.clone().invert();
  const cameraEcef = (
    renderCamera
      ? renderCamera.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3()
  ).applyMatrix4(worldToEcef);
  const worldToOverview = readEnuToLocalYUpSceneRotationMatrix();
  if (options.overviewUp === "camera-tangent")
    worldToOverview.multiply(ecefToEnuMatrix(cameraEcef));
  worldToOverview.multiply(worldToEcef);
  const overviewExtent = extent.clone().applyMatrix4(worldToOverview);
  const margin = 24;
  const spanX = overviewExtent.max.x - overviewExtent.min.x;
  const spanZ = overviewExtent.max.z - overviewExtent.min.z;
  const scale = Math.min(
    (width - 2 * margin) / spanX,
    (height - 2 * margin) / spanZ
  );
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanZ * scale) / 2;
  const toScreen = (x: number, z: number): [number, number] => [
    offsetX + (x - overviewExtent.min.x) * scale,
    offsetY + (z - overviewExtent.min.z) * scale,
  ];
  const {
    showOverlay: mapOverlay,
    showOverviewPanel,
    showFrustum,
    showResident,
    sceneLabels,
  } = options;
  const showOverlay = mapOverlay || showOverviewPanel;

  const floorLeaves = collectFloorLeaves(root, state.extentGeometricError);
  const floor = new Set(floorLeaves);
  const projectedErrors = new Map<Tile, number | null>();
  const candidates = new Set<Tile>([
    ...floorLeaves,
    ...cache.itemSet.keys(),
    ...state.displayedMeshFrontier,
    ...state.meshUnderlayFrontier,
    ...loadingTilesOf(tiles),
  ]);
  const ordered = [...candidates].sort(
    (a, b) =>
      (a.internal?.depth ?? 0) - (b.internal?.depth ?? 0) ||
      b.geometricError - a.geometricError
  );
  const rects: OverlayRect[] = [];
  const labelled: Array<{ tile: Tile; id: string; kind: Kind }> = [];
  let displayed = 0;
  let underlay = 0;
  for (const tile of ordered) {
    if (++iterations % 128 === 0 && performance.now() - sliceStart >= 2) {
      await yieldTileDiagnosticTask();
      sliceStart = performance.now();
      if (isCancelled()) return null;
    }
    const kind = kindOf(tile, state, floor);
    if (!kind) continue;
    const ancestor = tile.internal?.hasRenderableContent !== true;
    if (kind === "displayed") displayed += 1;
    if (kind === "underlay") underlay += 1;
    if (
      sceneLabels &&
      (kind === "displayed" || kind === "underlay") &&
      labelled.length < 400
    )
      labelled.push({ tile, id: tileId(tile), kind });
    if (!showOverlay) continue;
    if (!ancestor && kind === "resident" && !showResident) continue;
    if (!tileWorldBox(tile, group, box)) continue;
    const projectedBox = box.clone().applyMatrix4(worldToOverview);
    const [x0, y0] = toScreen(projectedBox.min.x, projectedBox.min.z);
    const [x1, y1] = toScreen(projectedBox.max.x, projectedBox.max.z);
    const demand = cameraDemand.evaluate(box, tile.geometricError * worldScale);
    const error = demand.required ? demand.errorRatio * targetPixels : NaN;
    projectedErrors.set(tile, demand.required ? error : null);
    rects.push({
      tile,
      id: tileId(tile),
      world: box.clone(),
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      kind: ancestor ? "ancestor" : kind,
      floor: floor.has(tile),
      error,
      levels: levelsToTarget(error, targetPixels),
      quality: null,
      ring: (tile as RuntimeTile).idleRing === true,
      outsideDemand: !demand.required,
      phase: state.deferred.has(tile)
        ? "Ⅱ"
        : ({ 1: "○", 2: "◐", 3: "●", [-1]: "×" } as Record<number, string>)[
            tile.internal?.loadingState ?? 0
          ] ?? "",
    });
  }
  // Overview hierarchy only: a parent remains a boundary, but its status
  // glyph must not cover finer resident/requested child footprints.
  // Metadata routing nodes do not represent a renderable surface level.
  const subdivided = new Set<Tile>();
  for (const rect of rects) {
    if (performance.now() - sliceStart >= 2) {
      await yieldTileDiagnosticTask();
      sliceStart = performance.now();
      if (isCancelled()) return null;
    }
    if (rect.kind === "ancestor") continue;
    let parent = rect.tile.parent;
    while (parent && !subdivided.has(parent)) {
      subdivided.add(parent);
      parent = parent.parent;
    }
  }
  for (const rect of rects) {
    if (performance.now() - sliceStart >= 2) {
      await yieldTileDiagnosticTask();
      sliceStart = performance.now();
      if (isCancelled()) return null;
    }
    if (subdivided.has(rect.tile)) rect.kind = "ancestor";
    if (rect.kind === "ancestor" || rect.outsideDemand) continue;
    rect.quality = estimateTileTargetSteps(rect.tile, targetPixels, (node) => {
      if (projectedErrors.has(node)) return projectedErrors.get(node)!;
      if (!tileWorldBox(node, group, box)) return null;
      // Read the same compiled camera union without invoking the vendor's
      // traversal callback: that callback also changes request/floor state.
      const result = cameraDemand.evaluate(
        box,
        node.geometricError * worldScale
      );
      const error = result.required ? result.errorRatio * targetPixels : null;
      projectedErrors.set(node, error);
      return error;
    });
  }

  const viewportBasis = {
    bounds: [...extent.min.toArray(), ...extent.max.toArray()],
    worldToOverview: worldToOverview.toArray(),
    screen: [
      scale,
      offsetX - overviewExtent.min.x * scale,
      offsetY - overviewExtent.min.z * scale,
    ],
    width,
    height,
  };
  let intersectionEdges: OverlayModel["intersectionEdges"] = null;
  let centerHit: [number, number] | null = null;
  let footprintBounds: OverlayModel["footprintBounds"] = null;
  if (
    showOverlay &&
    (showFrustum || options.overviewView === "frustum") &&
    renderCamera
  ) {
    const viewport = projectTileDiagnosticViewport(
      viewportBasis,
      snapshotTileCameraViews([
        {
          id: "coverage-overview",
          camera: renderCamera,
          viewport: [width, height],
          errorTargetPixels: targetPixels,
          role: TILE_CAMERA_ROLE.RECEIVER,
        },
      ])[0]
    );
    intersectionEdges = Array.from(
      { length: viewport.edges.length / 4 },
      (_, i) =>
        Array.from(viewport.edges.subarray(i * 4, i * 4 + 4)) as [
          number,
          number,
          number,
          number
        ]
    );
    centerHit = viewport.center;
    footprintBounds = viewport.footprintBounds;
  }
  let model: OverlayModel = {
    width,
    height,
    extent: null,
    intersectionEdges: null,
    centerHit: null,
    footprintBounds: null,
    rects: [],
    target: targetPixels,
  };
  if (showOverlay) {
    const [ex0, ey0] = toScreen(overviewExtent.min.x, overviewExtent.min.z);
    const [ex1, ey1] = toScreen(overviewExtent.max.x, overviewExtent.max.z);
    model = {
      width,
      height,
      extent: { x: ex0, y: ey0, w: ex1 - ex0, h: ey1 - ey0 },
      intersectionEdges: showFrustum ? intersectionEdges : null,
      centerHit,
      footprintBounds,
      rects,
      viewportBasis,
      target: targetPixels,
    };
  }
  return { model, labelled, displayed, underlay, floorLeaves };
};
