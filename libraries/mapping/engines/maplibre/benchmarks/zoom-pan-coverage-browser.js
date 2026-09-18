// Evaluate in the warmed Mesh Coverage iframe. Native MapLibre motion, not
// synthetic wheel input. Structural coverage evidence, not a pixel certificate.
(async () => {
  const state = [...window.__carmaTiles3d][0];
  const map = state.map;
  const tiles = state.tiles;
  const center = map.getCenter().toArray();
  const zoom = map.getZoom();
  const result = { frames: 0, gapFrames: 0, disposals: 0, unsafeDisposals: 0,
    examples: [], initial: state.hostHandle.loading.getCoverageStatus() };
  const history = new Set(state.displayedMeshFrontier);
  const intersects = (tile) =>
    !!tile.engineData?.boundingVolume?.intersectsFrustum(state.tileViewFrustum);
  const covered = (tile, cut, viewOnly = false) => {
    for (let node = tile; node; node = node.parent)
      if (cut.has(node) && node.internal?.loadingState === 4) return true;
    const descendants = (node) =>
      (viewOnly && !intersects(node)) ||
      (cut.has(node) && node.internal?.loadingState === 4) ||
      (!!node.children?.length && node.children.every(descendants));
    return !!tile.children?.length && tile.children.every(descendants);
  };
  const render = () => {
    result.frames++;
    const cut = state.displayedMeshFrontier;
    for (const tile of history) {
      if (!intersects(tile) || covered(tile, cut, true)) continue;
      result.gapFrames++;
      if (result.examples.length < 5) result.examples.push({
        tile: tile.content?.uri, zoom: map.getZoom(), state: tile.internal.loadingState,
      });
      break;
    }
    for (const tile of cut) history.add(tile);
  };
  const dispose = ({ tile }) => {
    result.disposals++;
    const resident = new Set(tiles.lruCache.itemList);
    resident.delete(tile);
    if (!covered(tile, resident)) result.unsafeDisposals++;
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  map.on("render", render);
  tiles.addEventListener("dispose-model", dispose);
  try {
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const target of [19, 15, 18, 14, 17]) {
        map.zoomTo(target, { duration: 250 });
        await wait(850);
      }
      for (const offset of [[1400, 0], [1400, 0], [-1400, 0], [-1400, 0]]) {
        map.panBy(offset, { duration: 1200 });
        await wait(1400);
      }
      map.zoomTo(12, { duration: 250 });
      await wait(850);
      map.easeTo({ center, zoom, duration: 300 });
      await wait(1000);
    }
  } finally {
    map.off("render", render);
    tiles.removeEventListener("dispose-model", dispose);
  }
  result.sameRuntime = [...window.__carmaTiles3d][0] === state;
  result.final = state.hostHandle.loading.getCoverageStatus();
  result.prediction = state.hostHandle.scene.getMotionPrefetchStats();
  window.__zoomPanCoverageResult = result;
  return result;
})();
