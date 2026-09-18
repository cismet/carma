// Run in the Mesh Coverage iframe with DevTools; returns a promise.
// Bounds-based cut diagnostics, not a pixel-perfect surface coverage certificate.
// Browser console: await (await import('/path/to/this/file')).default() is not
// required: evaluate this expression directly in the already loaded story.
(async () => {
  const state = [...window.__carmaTiles3d][0];
  const map = state.map;
  const box = state.tileBoundingBox.clone();
  const transform = state.tileBoundsTransform.clone();
  const intersects = (tile) =>
    tile.engineData?.boundingVolume?.intersectsFrustum(state.tileViewFrustum);
  const screenError = (tile) => {
    tile.engineData.boundingVolume.getOBB(box, transform);
    transform.premultiply(state.tiles.group.matrixWorld);
    box.applyMatrix4(transform);
    return state.tileCameraDemand.evaluate(
      box,
      tile.geometricError * state.tiles.group.matrixWorld.getMaxScaleOnAxis()
    ).errorRatio * state.tileCameraDemand.views[0].errorTargetPixels;
  };
  let previous = new Set(state.displayedMeshFrontier);
  let frames = 0;
  const changes = [];
  const disposals = [];
  const initial = {
    center: map.getCenter().toArray(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    elevation: map.getCenterElevation(),
    camera: state.tileCameraDemand.views[0].position.toArray(),
    coverage: state.hostHandle.loading.getCoverageStatus(),
  };
  const render = () => {
    frames++;
    const next = state.displayedMeshFrontier;
    for (const tile of previous) {
      if (next.has(tile) || !intersects(tile)) continue;
      for (let parent = tile.parent; parent; parent = parent.parent) {
        if (!next.has(parent)) continue;
        changes.push({
          tile: tile.content?.uri,
          parent: parent.content?.uri,
          loaded: tile.internal.loadingState,
          parentError: screenError(parent),
          childError: screenError(tile),
          target: state.effectiveErrorTarget,
          moving: map.isMoving(),
          siblings: (parent.children || []).filter(intersects).map((sibling) => ({
            tile: sibling.content?.uri,
            loaded: sibling.internal.loadingState,
            previouslyPublished: previous.has(sibling),
          })),
        });
        break;
      }
    }
    previous = new Set(next);
  };
  const dispose = ({ tile }) => {
    if (previous.has(tile) || intersects(tile))
      disposals.push({
        tile: tile.content?.uri,
        previouslyPublished: previous.has(tile),
        inView: intersects(tile),
      });
  };
  map.on('render', render);
  state.tiles.addEventListener('dispose-model', dispose);
  try {
    for (const offset of [[180, 0], [0, 160], [-180, 0], [0, -160], [250, 120], [-250, -120]]) {
      map.panBy(offset, { duration: 700 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } finally {
    map.off('render', render);
    state.tiles.removeEventListener('dispose-model', dispose);
  }
  const result = {
    initial,
    frames,
    changes,
    disposals,
    aboveIdle: changes.filter((change) => change.parentError > state.requestedErrorTarget * 1.025).length,
    final: state.hostHandle.loading.getCoverageStatus(),
  };
  window.__dragRetentionResults ??= [];
  window.__dragRetentionResults.push(result);
  return result;
})();
