import { TilesetHierarchyPlugin } from "../../src/lib/runtime/integrations/tileset-hierarchy-plugin.ts";
const rootUrl = "https://wupp-3d-datax.cismet.de/mesh2024/tileset.json";
const output = document.querySelector("#result");
const now = () => performance.now();
const native = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
};
const pluginRead = async (plugin, url) => {
  const value = await plugin.fetchData(url, {});
  return value instanceof Response ? value.json() : value;
};
const summarize = (raw) => {
  const sorted = [...raw].sort((a, b) => a - b);
  return { medianMs: sorted[4], p95Ms: sorted[8], raw };
};
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]])
        )
      : item
  );
const batch = async (urls, load) => {
  const result = [];
  for (let i = 0; i < urls.length; i += 8)
    result.push(...(await Promise.all(urls.slice(i, i + 8).map(load))));
  return result;
};
let preparing, restoring;
try {
  const root = await native(rootUrl);
  const known = new Set([rootUrl]),
    pending = [],
    documents = new Map([[rootUrl, root]]);
  const discover = (source, url) => {
    const stack = [source.root];
    while (stack.length) {
      const tile = stack.pop();
      const uri = tile.content?.uri ?? tile.content?.url;
      if (uri && /\.json(?:[?#]|$)/.test(uri)) {
        const resolved = new URL(uri, url).href;
        if (!known.has(resolved)) {
          known.add(resolved);
          pending.push(resolved);
        }
      }
      stack.push(...(tile.children ?? []));
    }
  };
  discover(root, rootUrl);
  while (documents.size < 25 && pending.length) {
    const urls = pending.splice(0, Math.min(8, 25 - documents.size));
    const results = await batch(urls, native);
    results.forEach((source, i) => {
      documents.set(urls[i], source);
      discover(source, urls[i]);
    });
  }
  const urls = [...documents.keys()].filter((url) => url !== rootUrl);
  preparing = new TilesetHierarchyPlugin(rootUrl);
  await pluginRead(preparing, rootUrl);
  const prepareStart = now();
  await batch(urls, (url) => pluginRead(preparing, url));
  const prepareMs = now() - prepareStart;
  // Only a test synchronization delay: production never waits for persistence.
  await new Promise((resolve) => setTimeout(resolve, 750));
  preparing.dispose();
  preparing = null;
  restoring = new TilesetHierarchyPlugin(rootUrl);
  const rootStart = now();
  await pluginRead(restoring, rootUrl);
  const rootValidationMs = now() - rootStart;
  await batch(urls, (url) => pluginRead(restoring, url));
  const baseline = [],
    cached = [];
  for (let run = 0; run < 9; run++) {
    output.textContent = JSON.stringify({
      phase: "measuring",
      run: run + 1,
      documents: urls.length,
    });
    for (const reuse of run % 2 ? [true, false] : [false, true]) {
      const start = now();
      const results = await batch(
        urls,
        reuse ? (url) => pluginRead(restoring, url) : native
      );
      (reuse ? cached : baseline).push(now() - start);
      results.forEach((value, i) => {
        if (canonical(value) !== canonical(documents.get(urls[i])))
          throw Error("Native descriptor parity failed");
      });
    }
  }
  output.textContent = JSON.stringify(
    {
      phase: "complete",
      browser: navigator.userAgent,
      cores: navigator.hardwareConcurrency,
      documents: urls.length,
      prepareMs,
      rootValidationMs,
      baseline: summarize(baseline),
      cached: summarize(cached),
      stats: restoring.getStats(),
      parity: true,
      scope:
        "24 actual external metadata documents; nine alternating warm batches, concurrency8; production worker/plugin/codec/native descriptor reconstruction versus browser-cache fetch+JSON parse. One new worker after preparation. Root revalidation measured separately; excludes native OBB preprocessing, traversal, mesh loading and shading. No full-app speedup claim.",
    },
    null,
    2
  );
} catch (error) {
  output.textContent = String(error) + "\n" + error.stack;
} finally {
  preparing?.dispose();
  restoring?.dispose();
}
