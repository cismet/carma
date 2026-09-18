// DevTools console: install this file, then await __tileMotionBenchmark.run({parse: 2, requests: 16}).
// Runtime evidence only: bounds-based coverage/area is not a pixel-perfect hole certificate.
(() => {
  const w = document.querySelector('iframe')?.contentWindow || window;
  const s = [...(w.__carmaTiles3d || [])][0];
  if (!s?.tiles || !s.map) throw new Error('Mesh runtime unavailable');
  const map = s.map, tiles = s.tiles;
  const initial = {center: map.getCenter().toArray(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), elevation:map.getCenterElevation()};
  const clampedBefore=map.getCenterClampedToGround();
  const initialLimits = {parse: s.normalParseConcurrency, requests: s.requestConcurrency};
  const box = s.tileBoundingBox.clone(), matrix = s.tileBoundsTransform.clone();
  const probe = s.tileProjectedCenter.clone(), projection = s.tileViewProjection.clone();
  const sleep = ms => new Promise(resolve => w.setTimeout(resolve, ms));
  const percentile = (values, p) => {const v = values.filter(Number.isFinite).sort((a,b)=>a-b); return v.length ? v[Math.min(v.length-1, Math.floor(p*v.length))] : null;};
  const statistics = values => ({n: values.length, p50: percentile(values,.5), p95:percentile(values,.95), max: values.length ? Math.max(...values) : null});
  const intersects = tile => tile.engineData?.boundingVolume?.intersectsFrustum?.(s.tileViewFrustum) ?? false;
  const classification = tile => intersects(tile) ? 'viewport' : tile.geometricError >= s.extentGeometricError ? 'baseline' : tile.zoomPrefetch ? 'zoom-prefetch' : tile.idleRing ? 'ring' : 'outside';
  const summarize = samples => ({
    samples: samples.length,
    viewportError: statistics(samples.map(x=>x.errorMean)),
    viewportP95: statistics(samples.map(x=>x.errorP95)),
    areaWeightedError: statistics(samples.map(x=>x.areaError)),
    underTargetFraction: statistics(samples.map(x=>x.underTarget)),
    outsideProcessing: statistics(samples.map(x=>x.activeOutside)),
    viewportProcessing: statistics(samples.map(x=>x.activeViewport)),
    cacheGiB: statistics(samples.map(x=>x.cacheBytes/2**30)),
    sampleCostMs: statistics(samples.map(x=>x.probeMs)),
    floorUncoveredMax: Math.max(0,...samples.map(x=>x.floorUncovered)),
    frontierEmpty: samples.filter(x=>!x.frontier).length,
    effectiveTargets:[...new Set(samples.map(x=>x.target))],
  });
  const results = [];
  // Keep completed runs if Storybook hot reload replaces its preview iframe.
  w.parent.__tileMotionBenchmarkResults = results;
  w.__tileMotionBenchmark = {
    results,
    async run({parse=2,requests=16,debug=false,name=`p${parse}-d${requests}`,baseError=20}={}) {
      if (this.running) throw new Error('Benchmark already running');
      this.running=true;
      const baseErrorBefore=s.options.baseErrorTargetPixels;
      s.options.baseErrorTargetPixels=baseError;
      map.setCenterClampedToGround(false);
      const debugButton=w.document.querySelector('button[aria-label="Tile diagnostics"]');
      const debugBefore=debugButton?.getAttribute('aria-pressed')==='true';
      if (debugButton && debugBefore!==debug) debugButton.click();
      s.hostHandle.loading.setParseConcurrency(parse);
      s.hostHandle.loading.setRequestConcurrency(requests);
      const startState=s.hostHandle.loading.getCoverageStatus();
      const events=[],samples=[],dt=[],renderDt=[],long=[],phaseTimes=[];
      let phase='settle', active=true,raf=0,last=0,lastRender=0,lastProbe=0,renders=0;
      const parseJobs=new Set(),originalAdd=tiles.parseQueue.add;
      tiles.parseQueue.add=function(tile,callback){return originalAdd.call(this,tile,entry=>{
        const begin=w.performance.now();parseJobs.add(entry);
        events.push({t:begin,phase,type:'parse-start',id:entry.content?.uri,classification:classification(entry),moving:map.isMoving()});
        const finish=()=>{parseJobs.delete(entry);if(active)events.push({t:w.performance.now(),phase,type:'parse-end',ms:w.performance.now()-begin,id:entry.content?.uri,classification:classification(entry),moving:map.isMoving()});};
        try{return Promise.resolve(callback(entry)).finally(finish);}catch(error){finish();throw error;}
      });};
      const floors=[];
      const walk=tile=>{if(!tile.internal)return;const children=tile.children||[];if(tile.geometricError>=s.extentGeometricError && children.every(c=>c.geometricError<s.extentGeometricError)){floors.push(tile);return;}for(const c of children)walk(c);};walk(tiles.root);
      const eventHandlers=[];
      for(const type of ['tile-download-start','tile-download-end','load-model','dispose-model','load-error']){
        const fn=e=>{if(events.length<5000)events.push({t:w.performance.now(),phase,type,id:e.tile?.content?.uri,classification:e.tile?classification(e.tile):null,moving:map.isMoving()});};
        tiles.addEventListener(type,fn);eventHandlers.push([type,fn]);
      }
      const sample=()=>{
        const begin=w.performance.now(),errors=[];
        let areaSum=0,errorArea=0,belowArea=0;
        const view=s.tileCameraDemand.views[0];
        if(view)projection.fromArray(view.projectionMatrix).multiply(view.worldToView);
        for(const tile of new Set([...s.displayedMeshFrontier,...s.meshUnderlayFrontier])){
          if(!intersects(tile))continue;
          const volume=tile.engineData?.boundingVolume;
          if(!volume?.getOBB)continue;
          volume.getOBB(box,matrix); matrix.premultiply(tiles.group.matrixWorld);box.applyMatrix4(matrix);
          const demand=s.tileCameraDemand.evaluate(box,tile.geometricError*tiles.group.matrixWorld.getMaxScaleOnAxis());
          if(!demand.required)continue;
          // This harness measures one camera; use its actual compiled target,
          // not a potentially changing runtime stage target.
          const error=demand.errorRatio*view.errorTargetPixels;errors.push(error);
          let minX=1,minY=1,maxX=-1,maxY=-1;
          for(let i=0;i<8;i++){probe.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(projection);minX=Math.min(minX,probe.x);maxX=Math.max(maxX,probe.x);minY=Math.min(minY,probe.y);maxY=Math.max(maxY,probe.y);}
          const area=Math.max(0,Math.min(1,maxX)-Math.max(-1,minX))*Math.max(0,Math.min(1,maxY)-Math.max(-1,minY));
          areaSum+=area;errorArea+=error*area;if(error<=s.requestedErrorTarget*1.05)belowArea+=area;
        }
        const loading={};let activeOutside=0,activeViewport=0;
        for(const tile of tiles.loadingTiles){const role=classification(tile),state=tile.internal?.loadingState,key=`${role}:${state}`;loading[key]=(loading[key]||0)+1;if(state===2||state===3){if(role==='viewport')activeViewport++;else if(role!=='baseline')activeOutside++;}}
        let visited=0;
        const covered=tile=>{
          if(++visited>5000)return null;
          if(!intersects(tile))return true;
          if(s.displayedMeshFrontier.has(tile)||s.meshUnderlayFrontier.has(tile))return true;
          const children=(tile.children||[]).filter(intersects);return children.length>0 && children.every(c=>covered(c)===true);
        };
        const floorUncovered=floors.filter(tile=>intersects(tile)&&!covered(tile)&&!(()=>{for(let p=tile.parent;p;p=p.parent)if(s.displayedMeshFrontier.has(p)||s.meshUnderlayFrontier.has(p))return true;return false;})()).length;
        const downloadQueues=[...tiles.downloadQueue.originQueues.values()];
        const downloadActive=downloadQueues.reduce((sum,queue)=>sum+queue.currJobs,0);
        const downloadWaiting=downloadQueues.reduce((sum,queue)=>sum+queue.items.length,0);
        samples.push({t:begin,phase,zoom:map.getZoom(),moving:map.isMoving(),target:s.effectiveErrorTarget,frontier:s.displayedMeshFrontier.size,visible:errors.length,errorMean:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null,errorP95:percentile(errors,.95),areaError:areaSum?errorArea/areaSum:null,underTarget:areaSum?belowArea/areaSum:null,loading,activeOutside,activeViewport,executingOutside:[...parseJobs].filter(t=>classification(t)!=='viewport'&&classification(t)!=='baseline').length,executingViewport:[...parseJobs].filter(t=>classification(t)==='viewport').length,downloadActive,downloadWaiting,downloadLimit:tiles.downloadQueue.maxJobsPerOrigin,parseLimit:tiles.parseQueue.maxJobs,parseActive:tiles.parseQueue.currJobs,parseQueue:tiles.parseQueue.items.length,cacheBytes:tiles.lruCache.cachedBytes,deferred:s.deferred.size,floorUncovered,probeMs:w.performance.now()-begin});
      };
      const onRender=()=>{const now=w.performance.now();renders++;if(lastRender)renderDt.push(now-lastRender);lastRender=now;if(now-lastProbe>=150){lastProbe=now;sample();}};
      const tick=t=>{if(last)dt.push(t-last);last=t;if(active)raf=w.requestAnimationFrame(tick);};
      const observer=new w.PerformanceObserver(list=>{for(const e of list.getEntries())long.push(e.duration)});observer.observe({type:'longtask'});
      map.on('render',onRender);raf=w.requestAnimationFrame(tick);
      const begin=w.performance.now();
      const move=async(name,camera,duration,pause)=>{phase=name;phaseTimes.push({phase,t:w.performance.now()});map.easeTo({...camera,duration,essential:true});await sleep(duration+pause);sample();};
      try {
        // Heights sampled with downward rays against resident source geometry;
        // avoid benchmarking empty frames from a camera below the mesh.
        await move('start',{center:[7.1999207,51.2725716],zoom:17,pitch:35,bearing:0,elevation:185.49},0,1500);
        await move('fast-in',{zoom:19},450,300);
        await move('far-pan',{center:[7.158,51.258],elevation:172.98},650,200);
        await move('out',{zoom:14},400,500);
        await move('pan-west',{center:[7.1228,51.2489],elevation:156.45},650,200);
        await move('back-in',{zoom:18.5},450,500);
        await move('reverse-pan',{center:[7.15,51.253],bearing:35,elevation:219.01},650,200);
        await move('wide',{zoom:15},450,500);
        await move('return',{center:[7.1999207,51.2725716],zoom:17,bearing:0,elevation:185.49},700,6000);
        const elapsed=w.performance.now()-begin;
        const result={name,parse,requests,debug,baseError,at:new Date().toISOString(),ua:w.navigator.userAgent,viewport:[w.innerWidth,w.innerHeight,w.devicePixelRatio],hardwareConcurrency:w.navigator.hardwareConcurrency,elapsed,renders,renderFps:1000*renders/elapsed,raf:statistics(dt),renderIntervals:statistics(renderDt),longTasks:statistics(long),startState,endState:s.hostHandle.loading.getCoverageStatus(),summary:summarize(samples),phases:phaseTimes.map(p=>({phase:p.phase,...summarize(samples.filter(x=>x.phase===p.phase))})),events,samples};
        results.push(result);return {...result,events:events.length,samples:samples.length,phases:undefined};
      } finally {
        active=false;this.running=false;w.cancelAnimationFrame(raf);observer.disconnect();map.off('render',onRender);for(const [type,fn]of eventHandlers)tiles.removeEventListener(type,fn);
        tiles.parseQueue.add=originalAdd;s.options.baseErrorTargetPixels=baseErrorBefore;
        s.hostHandle.loading.setParseConcurrency(initialLimits.parse);s.hostHandle.loading.setRequestConcurrency(initialLimits.requests);
        if(debugButton&&(debugButton.getAttribute('aria-pressed')==='true')!==debugBefore)debugButton.click();
      }
    },
    restore(){map.setCenterClampedToGround(clampedBefore);map.jumpTo(initial);s.hostHandle.loading.setParseConcurrency(initialLimits.parse);s.hostHandle.loading.setRequestConcurrency(initialLimits.requests);},
  };
  return {installed:true,initial};
})();
