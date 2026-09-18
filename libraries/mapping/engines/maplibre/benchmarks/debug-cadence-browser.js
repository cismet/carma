// Run in the Storybook page's console: await benchmarkDebugCadence('{}').
// Uses the actual runtime, restores camera/control state, and does not reload tiles.
const benchmarkDebugCadence = async (settingsJson) => {
 const settings=JSON.parse(settingsJson),w=document.querySelector('iframe')?.contentWindow||window,s=[...w.__carmaTiles3d][0],m=s.map;
 const original=settings.original||{center:m.getCenter().toArray(),zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing()};
 const sleep=ms=>new Promise(r=>w.setTimeout(r,ms));
 const button=w.document.querySelector('button[aria-label="Overview options"]');
 const optionsOpen=button?.getAttribute('aria-pressed')==='true';
 if(!optionsOpen)button?.click();
 await sleep(300);
 const radio=mode=>[...w.document.querySelectorAll('input[type=radio]')].find(e=>e.closest('label')?.textContent?.includes(mode==='frame'?'Every render frame':'Deferred (10 Hz)'));
 if(!radio('frame'))return {error:"Cadence controls unavailable"};
 const previous=radio('frame').checked?'frame':'10hz';
 m.jumpTo(original);await sleep(6000);
 const rows=[],post=w.Worker.prototype.postMessage,task=w.scheduler.postTask;
 let active=null,raf=0,last=0;
 const percentile=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b.length?+b[Math.min(b.length-1,Math.floor(b.length*p))].toFixed(2):null};
 const stats=a=>({n:a.length,p50:percentile(a,.5),p95:percentile(a,.95),max:a.length?+Math.max(...a).toFixed(2):null,total:+a.reduce((x,y)=>x+y,0).toFixed(2)});
 w.Worker.prototype.postMessage=function(message,...args){if(active){if(message?.type==='camera')active.cameraMessages++;if(message?.type==='frame'){active.framesSent++;if(message.snapshot)active.snapshots++}}return post.call(this,message,...args)};
 w.scheduler.postTask=function(cb,options){const queued=w.performance.now();return task.call(this,()=>{const started=w.performance.now();try{return cb()}finally{if(active)active.tasks.push({priority:options?.priority,wait:started-queued,cpu:w.performance.now()-started})}},options)};
 const onRender=()=>{if(active)active.renders++};m.on('render',onRender);
 const tick=t=>{if(active&&last)active.dt.push(t-last);last=t;raf=w.requestAnimationFrame(tick)};raf=w.requestAnimationFrame(tick);
 const observer=new w.PerformanceObserver(list=>{if(active)for(const e of list.getEntries())active.long.push(e.duration)});observer.observe({type:'longtask'});
 const host=w.document.querySelector('[data-worker-ms]');
 const mutations=new w.MutationObserver(()=>{if(active&&host)active.worker.push(Number(host.dataset.workerMs))});
 if(host)mutations.observe(host,{attributes:true,attributeFilter:['data-worker-ms']});
 const state=()=>({target:s.effectiveErrorTarget,resident:s.tiles.lruCache.itemSet.size,frontier:s.displayedMeshFrontier.size,bytes:s.tiles.lruCache.cachedBytes,queued:s.tiles.stats?.queued,downloading:s.tiles.stats?.downloading,parsing:s.tiles.stats?.parsing,ready:s.lastMainViewConverged});
 const path=async()=>{for(const [dx,dy,dz,db] of [[.00012,0,.06,6],[0,.00010,0,0],[-.00012,0,-.06,-6],[0,0,0,0]]){m.easeTo({center:[original.center[0]+dx,original.center[1]+dy],zoom:original.zoom+dz,bearing:original.bearing+db,pitch:original.pitch,duration:950,essential:true});await sleep(1000)}};
 try{
  for(const mode of ['10hz','frame']){radio(mode).click();await sleep(250);await path()}
  for(const mode of ['10hz','frame','frame','10hz','10hz','frame']){
   radio(mode).click();await sleep(350);
   const row={mode,dt:[],long:[],worker:[],tasks:[],renders:0,cameraMessages:0,framesSent:0,snapshots:0,start:state()};
   active=row;last=0;const begin=w.performance.now();await path();const elapsed=w.performance.now()-begin;active=null;
   rows.push({mode,elapsedMs:+elapsed.toFixed(1),raf:stats(row.dt),rafOver33:row.dt.filter(x=>x>33.4).length,rafOver50:row.dt.filter(x=>x>50).length,renderFps:+(1000*row.renders/elapsed).toFixed(1),renders:row.renders,longTasks:stats(row.long),workerAckMs:stats(row.worker),cameraMessages:row.cameraMessages,framesSent:row.framesSent,snapshots:row.snapshots,tasks:[...new Set(row.tasks.map(t=>t.priority))].map(p=>({priority:p,cpu:stats(row.tasks.filter(t=>t.priority===p).map(t=>t.cpu)),wait:stats(row.tasks.filter(t=>t.priority===p).map(t=>t.wait))})),start:row.start,end:state()});
  }
  const result={at:new Date().toISOString(),ua:w.navigator.userAgent,viewport:[w.innerWidth,w.innerHeight,w.devicePixelRatio],original,warmup:'6 seconds settle + 8 seconds motion in both modes',rows};
  w.__debugCadenceAfter=result;return result;
 }finally{active=null;w.cancelAnimationFrame(raf);observer.disconnect();mutations.disconnect();m.off('render',onRender);w.Worker.prototype.postMessage=post;w.scheduler.postTask=task;radio(previous)?.click();m.jumpTo(original);if(!optionsOpen)button?.click()}
};
