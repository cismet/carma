/** DevTools navigate_page initScript. Not imported by the app.
 * Keep Mesh2024 enabled in the test profile. Read .samples/.captures after 10s.
 * Timings are synchronous CPU/driver submission, NOT GPU timer-query results.
 * Warm reload leaves HTTP/asset caches intact. Run at identical canvas size.
 */
(() => {
  performance.setResourceTimingBufferSize(20_000);
  const result = { samples: [], captures: {}, costs: {}, stop: () => {} };
  window.__carmaMeshShadowReloadBenchmark = result;
  const restores = [];
  const wrapped = new WeakMap();
  let hookedMap;
  let lastSample = 0;

  const wrap = (object, key) => {
    if (!object || typeof object[key] !== "function") return;
    let keys = wrapped.get(object);
    if (!keys) wrapped.set(object, (keys = new Set()));
    if (keys.has(key)) return;
    keys.add(key);
    const original = object[key];
    const measured = function (...args) {
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const cost = (result.costs[key] ??= { calls: 0, ms: 0, maximumMs: 0 });
        const elapsed = performance.now() - start;
        cost.calls++;
        cost.ms += elapsed;
        cost.maximumMs = Math.max(cost.maximumMs, elapsed);
      }
    };
    object[key] = measured;
    restores.push(() => {
      if (object[key] === measured) object[key] = original;
    });
  };

  const capture = () => {
    const elapsedSeconds = performance.now() / 1000;
    const target = [5, 8, 10].find(
      (seconds) => elapsedSeconds >= seconds && !result.captures[seconds]
    );
    if (target === undefined) return;
    result.captures[target] = {
      elapsedSeconds,
      image: hookedMap.getCanvas().toDataURL("image/jpeg", 0.8),
    };
  };
  const timer = setInterval(() => {
    const map = window.__carmaMap;
    const host =
      map?.style?._layers["carma-shared-three-scene"]?.implementation;
    const runtime = host
      ?.getRuntimes()
      .find((source) => source.providesTerrain);
    if (!runtime) return;
    for (const key of [
      "update",
      "getShadowRegionRevision",
      "isShadowRegionReady",
    ])
      wrap(runtime, key);
    wrap(host.getRenderer(), "render");
    if (hookedMap !== map) {
      hookedMap?.off("render", capture);
      hookedMap = map;
      map.on("render", capture);
    }
    const elapsedSeconds = performance.now() / 1000;
    if (elapsedSeconds - lastSample >= 1) {
      lastSample = elapsedSeconds;
      const volumes = runtime.getActiveTileVolumes?.() ?? [];
      result.samples.push({
        elapsedSeconds,
        demand: runtime.getRequestDemand?.(),
        mainViewReady: runtime.isMainViewReady?.(),
        receivers: volumes.filter((volume) => volume.loadReason === "viewport")
          .length,
        casters: volumes.filter((volume) => volume.loadReason === "shadow")
          .length,
        costs: structuredClone(result.costs),
      });
    }
    if (elapsedSeconds >= 40) result.stop();
  }, 50);
  result.stop = () => {
    clearInterval(timer);
    hookedMap?.off("render", capture);
    for (const restore of restores.splice(0)) restore();
  };
})();
