// Evaluate in the loaded Mesh Coverage iframe. One 2 km eastbound pan in 60 s.
// 200 m above DGM at each endpoint; record intermediate clearance, not an
// unsupported claim of exact terrain following. No server or cache reset.
(async () => {
  const state = [...window.__carmaTiles3d][0], map = state.map;
  performance.setResourceTimingBufferSize(30000);
  const resourceStart = performance.now();
  const hierarchy = state.tiles.getPluginByName('CARMA_TILESET_HIERARCHY');
  const hierarchyBefore = hierarchy?.getStats?.();
  const start = [7.1999207, 51.2725716];
  const end = [start[0] + 2000 / (111319.49079327358 * Math.cos(start[1] * Math.PI / 180)), start[1]];
  const groundCache = new Map();
  const ground = async ([lon, lat]) => {
    const z = 14, n = 2 ** z;
    const u = (lon + 180) / 360 * n;
    const v = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n;
    const x = Math.floor(u), y = Math.floor(v), key = `${x}/${y}`;
    if (!groundCache.has(key)) groundCache.set(key, (async () => {
      const response = await fetch(`https://terrain.cismet.de/services/nrw/dgm1_dhhn2016_terrarium/tiles/${z}/${x}/${y}.webp`);
      if (!response.ok) throw Error(`DGM ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob(), {colorSpaceConversion: 'none'});
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
      bitmap.close();
      return data;
    })());
    const image = await groundCache.get(key);
    const index = (Math.floor((v-y)*image.height)*image.width + Math.floor((u-x)*image.width))*4;
    return image.data[index]*256 + image.data[index+1] + image.data[index+2]/256 - 32768;
  };
  const heights = await Promise.all(Array.from({length: 21}, (_, i) => ground([start[0]+(end[0]-start[0])*i/20, start[1]])));
  groundCache.clear();
  document.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, button: 0, buttons: 0, view: window}));
  map.stop();
  map.setCenterClampedToGround(false);
  const startPose = map.calculateCameraOptionsFromTo(start, heights[0]+200, start, heights[0]);
  const endPose = map.calculateCameraOptionsFromTo(end, heights[20]+200, end, heights[20]);
  map.jumpTo({...startPose, bearing: 0});
  await new Promise(resolve => setTimeout(resolve, 3000));
  if (state.disposed) throw Error('Runtime remounted during setup');
  const durations = {}, restore = [];
  const wrap = (object, key, name) => {
    const original = object[key];
    object[key] = function(...args) {
      const started = performance.now();
      try { return original.apply(this, args); }
      finally { (durations[name] ??= []).push(performance.now()-started); }
    };
    restore.push(() => {object[key] = original;});
  };
  wrap(map, '_render', 'mapRender');
  wrap(state.hostHandle.scene, 'update', 'sceneUpdate');
  wrap(state.tiles, 'update', 'tilesUpdate');
  const shared = Object.values(map.style._layers).find(layer => layer.id === 'carma-shared-three-scene').implementation;
  wrap(shared, 'render', 'sharedRender');
  let commits = 0, mutations = 0;
  const renderedComponents = {};
  const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (hook?.onCommitFiberRoot) {
    const original = hook.onCommitFiberRoot;
    hook.onCommitFiberRoot = function(...args) {
      commits++;
      const pending = [args[1]?.current]; let visited = 0;
      while (pending.length && visited++ < 2000) {
        const fiber = pending.pop(); if (!fiber) continue;
        const name = fiber.type?.displayName || fiber.type?.name || fiber.type?.render?.name;
        if ((fiber.flags & 1) && name && /Tile|Mesh|Debug|Stat|Overlay|Progress/.test(name))
          renderedComponents[name] = (renderedComponents[name] || 0) + 1;
        if (fiber.child) pending.push(fiber.child);
        if (fiber.sibling) pending.push(fiber.sibling);
      }
      return original.apply(this, args);
    };
    restore.push(() => {hook.onCommitFiberRoot = original;});
  }
  const observer = new MutationObserver(records => {mutations += records.length;});
  observer.observe(document.getElementById('storybook-root'), {subtree:true, childList:true, attributes:true, characterData:true});
  const loaded = [], disposed = [], samples = [], frames = [];
  const inside = tile => tile.engineData?.boundingVolume?.intersectsFrustum(state.tileViewFrustum) ?? false;
  const handlers = [];
  let phase = 'pan';
  for (const type of ['load-model', 'dispose-model', 'tile-download-start']) {
    const listener = ({tile}) => {
      const event = {type, t:performance.now(), phase, tile:tile.content?.uri, inView:inside(tile)};
      if (type === 'load-model') loaded.push(event);
      else if (type === 'dispose-model') disposed.push(event);
    };
    state.tiles.addEventListener(type, listener); handlers.push([type,listener]);
  }
  const box = state.tileBoundingBox.clone(), matrix = state.tileBoundsTransform.clone();
  const qualitySeen = new Map();
  let refinedWhileVisible = 0, previousTime = 0, lastSample = 0;
  const onRender = () => {
    const now = performance.now();
    if (previousTime) frames.push(now-previousTime);
    previousTime = now;
    if (now-lastSample<250) return;
    lastSample = now;
    const t0 = performance.now(), errors = [];
    for (const tile of state.displayedMeshFrontier) {
      if (!inside(tile)) continue;
      tile.engineData.boundingVolume.getOBB(box,matrix);
      matrix.premultiply(state.tiles.group.matrixWorld); box.applyMatrix4(matrix);
      const demand = state.tileCameraDemand.evaluate(box,tile.geometricError*state.tiles.group.matrixWorld.getMaxScaleOnAxis());
      if (!demand.required) continue;
      errors.push(demand.errorRatio*state.tileCameraDemand.views[0].errorTargetPixels);
      if (!qualitySeen.has(tile)) {
        for (let p=tile.parent;p;p=p.parent) if (qualitySeen.has(p)) {refinedWhileVisible++;break;}
        qualitySeen.set(tile,now);
      }
    }
    samples.push({t:now,phase,errors,target:state.effectiveErrorTarget,
      queued:state.tiles.stats.queued,downloading:state.tiles.stats.downloading,parsing:state.tiles.stats.parsing,
      parseLimit:state.tiles.parseQueue.maxJobs,parseActive:state.tiles.parseQueue.currJobs,
      downloadLimit:state.tiles.downloadQueue.maxJobsPerOrigin,loadAncestors:state.tiles.loadAncestors,
      cacheBytes:state.tiles.lruCache.cachedBytes,support:state.meshRefinementSupport.size,
      prediction:state.hostHandle.scene.getMotionPrefetchStats?.(),
      cameraY:state.tileCameraDemand.views[0].position.y,center:map.getCenter().toArray(),
      probeMs:performance.now()-t0});
  };
  map.on('render',onRender);
  try {
    map.easeTo({...endPose,bearing:0,duration:60000,easing:t=>t,essential:true});
    await new Promise(resolve => setTimeout(resolve,60500));
    phase='settle';
    await new Promise(resolve => setTimeout(resolve,3000));
  } finally {
    map.off('render',onRender); observer.disconnect();
    for (const [type,listener] of handlers) state.tiles.removeEventListener(type,listener);
    for (const reset of restore.reverse()) reset();
  }
  const stats = values => {
    const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
    return {n:sorted.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],max:sorted.at(-1)};
  };
  const result = {start,end,heights,samples,loaded,disposed,
    summary:{frames:stats(frames),costs:Object.fromEntries(Object.entries(durations).map(([key,values])=>[key,stats(values)])),
      commits,renderedComponents,mutations,sameRuntime:[...window.__carmaTiles3d][0]===state,refinedWhileVisible,
      loadedDuringPan:loaded.filter(e=>e.phase==='pan').length,
      loadedInViewDuringPan:loaded.filter(e=>e.phase==='pan'&&e.inView).length,
      loadedAfterPan:loaded.filter(e=>e.phase==='settle').length,
      disposedInView:disposed.filter(e=>e.inView).length,
      probe:stats(samples.map(s=>s.probeMs)),coverage:state.hostHandle.loading.getCoverageStatus(),
      hierarchyBefore,hierarchyAfter:hierarchy?.getStats?.(),
      network:performance.getEntriesByType('resource').filter(e=>e.startTime>=resourceStart && /b3dm|\.json/.test(e.name)).map(e=>({url:e.name,duration:e.duration,transfer:e.transferSize}))}};
  window.__slowPanResults ??= [];window.__slowPanResults.push(result);
  return result;
})();
