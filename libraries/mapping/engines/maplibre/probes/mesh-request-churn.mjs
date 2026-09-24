// Headless request-churn probe for the mesh loader (TILES_COVERAGE.md,
// benchmarks/mesh-request-churn-20260917.md).
// Needs the geoportal dev server on http://localhost:4200 and Playwright with Chrome.
//
//   node libraries/mapping/engines/maplibre/probes/mesh-request-churn.mjs rest
//   node libraries/mapping/engines/maplibre/probes/mesh-request-churn.mjs pan 4
//
// Exit code 1 on FAIL. Counts every b3dm request per URL and every abort, so a
// cancel/re-request loop shows as repeats of one URL instead of as throughput:
// the aborted fetch is served from the HTTP cache and costs no bytes, which is
// why bandwidth and tile statistics stay unremarkable while the view churns.
// A settled view must request each payload once; repeats mean the runtime is
// cancelling work that its own next traversal demands again.
import { chromium } from "playwright";

const [scenario = "rest", ...rest] = process.argv.slice(2);
const numbers = rest.map(Number);
const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:4200";
const STYLE_URL = `${BASE}/data/mesh2024-cesium-parity.style.json`;
// Tilted close view over the valley: the resident cut fills the cache ceiling,
// which is the condition under which the settled-demand sweep releases tiles.
const START = { lat: 51.2476452, lng: 7.1224632, zoom: 19.358, b: 12.84, p: 34.24 };
const MAX_REPEAT = Number(process.env.PROBE_MAX_REPEAT ?? 3);
const MAX_ABORT_SHARE = Number(process.env.PROBE_MAX_ABORT_SHARE ?? 0.25);
const SETTLE_MS = Number(process.env.PROBE_SETTLE_MS ?? 90_000);

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// Counting in the page keeps aborted requests visible: an aborted fetch never
// reaches resource timing, and DevTools reports it without a completed entry.
await context.addInitScript(() => {
  const counts = new Map();
  const original = window.fetch;
  window.__carmaMeshRequests = { counts, starts: 0, aborted: 0, done: 0 };
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    if (!url || !/\.b3dm/.test(url)) return original.apply(this, arguments);
    const key = url.split("/").slice(-2).join("/");
    const stats = window.__carmaMeshRequests;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    stats.starts += 1;
    const pending = original.apply(this, arguments);
    pending.then(() => { stats.done += 1; }, (error) => { if (error?.name === "AbortError") stats.aborted += 1; });
    return pending;
  };
});
const page = await context.newPage();
const failures = [];

const read = () => page.evaluate(() => {
  const stats = window.__carmaMeshRequests;
  const repeated = [...stats.counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  return { starts: stats.starts, done: stats.done, aborted: stats.aborted, urls: stats.counts.size, worst: repeated.slice(0, 5), repeatedUrls: repeated.length };
});
const drop = async () => {
  await page.goto(`${BASE}/#/?lat=${START.lat}&lng=${START.lng}&zoom=${START.zoom}&b=${START.b}&p=${START.p}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__carmaMap && window.__carmaMap.isStyleLoaded(), null, { timeout: 90_000 });
  await page.waitForTimeout(2000);
  await page.evaluate((dropped) => { const dt = new DataTransfer(); dt.setData("URL", dropped); dt.setData("text/uri-list", dropped); dt.setData("text/plain", dropped); window.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true })); window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); }, STYLE_URL);
};
// Requests stop on their own once the view is covered; a churning runtime never
// reaches that state, so the wait is bounded rather than idle-triggered.
const settle = async (label, maxMs = SETTLE_MS) => {
  const t0 = Date.now();
  let last = -1, since = Date.now();
  while (Date.now() - t0 < maxMs) {
    await page.waitForTimeout(1000);
    const { starts } = await read();
    if (starts !== last) { last = starts; since = Date.now(); } else if (Date.now() - since > 8000) break;
  }
  const stats = await read();
  const abortShare = stats.starts ? stats.aborted / stats.starts : 0;
  const worst = stats.worst.map(([url, n]) => `${url}x${n}`).join(", ") || "none";
  console.log(`${label}: ${stats.starts} req over ${stats.urls} tiles, ${stats.aborted} aborted (${Math.round(abortShare * 100)}%), ${stats.repeatedUrls} repeated; worst ${worst}`);
  const maxRepeat = stats.worst[0]?.[1] ?? 1;
  if (maxRepeat > MAX_REPEAT) failures.push(`${label}: one tile requested ${maxRepeat} times (limit ${MAX_REPEAT})`);
  if (abortShare > MAX_ABORT_SHARE) failures.push(`${label}: ${Math.round(abortShare * 100)}% of requests aborted (limit ${Math.round(MAX_ABORT_SHARE * 100)}%)`);
  return stats;
};

if (scenario === "rest") {
  await drop();
  await settle("settled");
} else if (scenario === "pan") {
  const [pans = 4] = numbers;
  await drop();
  await settle("settled");
  for (let i = 0; i < pans; i++) {
    const [dx, dy] = [[-600, 0], [0, -400], [600, 0], [0, 400]][i % 4];
    await page.evaluate(([x, y]) => window.__carmaMap.panBy([x, y], { duration: 600 }), [dx, dy]);
    await page.waitForTimeout(1500);
  }
  await settle("after pans");
} else {
  console.error(`unknown scenario ${scenario}`);
  process.exitCode = 2;
}
await browser.close();
console.log(failures.length ? `FAIL\n  ${failures.join("\n  ")}` : "PASS");
if (failures.length) process.exitCode = 1;
