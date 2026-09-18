// Headless coverage probes for the mesh loader paradigm (TILES_COVERAGE.md).
// Needs the geoportal dev server on http://localhost:4200 and Playwright with Chrome.
//
//   node libraries/mapping/engines/maplibre/probes/mesh-coverage.mjs first-render
//   node libraries/mapping/engines/maplibre/probes/mesh-coverage.mjs zoom-out 21 20 12
//   node libraries/mapping/engines/maplibre/probes/mesh-coverage.mjs pan-zoom-out 19 2500 13
//
// Exit code 1 on FAIL. Every stop samples the blank share of the viewport and the extent
// invariant read through window.__carmaTiles3d (floor tiles loaded, used, covered).
import { chromium } from "playwright";

const [scenario = "first-render", ...rest] = process.argv.slice(2);
const numbers = rest.map(Number);
const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:4200";
const STYLE_URL = `${BASE}/data/mesh2024-cesium-parity.style.json`;
const START = { lat: 51.2725716, lng: 7.1999207, zoom: 18 };
const NET = { latency: 20, downloadThroughput: (50 * 1024 * 1024) / 8, uploadThroughput: (10 * 1024 * 1024) / 8, offline: false };
const BLANK_LIMIT = 0.5;

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", NET);
let requests = 0;
cdp.on("Network.requestWillBeSent", (e) => { if (/mesh2024\/.*b3dm/.test(e.request.url)) requests += 1; });
if (scenario === "zoom-out" && numbers[1]) {
  const basePx = numbers[1];
  await page.route("**/mesh2024-cesium-parity.style.json", async (route) => { const res = await route.fetch(); const json = await res.json(); json.metadata.carmaConf["3d"].baseErrorTarget = basePx; await route.fulfill({ response: res, json }); });
}
const analyzer = await context.newPage();

/** Share of background-coloured or white pixels in the map area. */
const blank = async () => {
  const buf = await page.screenshot({ clip: { x: 120, y: 110, width: 1160, height: 720 } });
  return analyzer.evaluate(async (b64) => {
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data; let bg = 0; const total = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { if ((Math.abs(d[i] - 0xd8) < 8 && Math.abs(d[i + 1] - 0xdd) < 8 && Math.abs(d[i + 2] - 0xe3) < 8) || (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250)) bg++; }
    return +((100 * bg) / total).toFixed(1);
  }, buf.toString("base64"));
};

/** Extent invariant: every floor tile loaded, LRU-used, with a loaded cut in its subtree. */
const coverage = () => page.evaluate(() => {
  const st = [...(window.__carmaTiles3d ?? [])][0]; if (!st?.tiles?.root) return { text: "no runtime", uncovered: 0, armed: false };
  const r = st.tiles; const c = r.lruCache; const ge = st.extentGeometricError;
  const loaded = (t) => t.internal?.hasRenderableContent && t.internal.loadingState === 4;
  const covered = (t) => { if (loaded(t)) return true; if (!t.internal) return false; const ch = t.children ?? []; if (t.internal.hasUnrenderableContent) return t.internal.loadingState === 4 && ch.length > 0 && ch.every(covered); return ch.length > 0 && ch.every(covered); };
  let floors = 0, uncovered = 0, floorLoaded = 0, floorUsed = 0;
  const walk = (t) => { if (!t.internal) return; if (t.geometricError >= ge && (t.children ?? []).every((k) => k.geometricError < ge)) { floors++; if (loaded(t)) floorLoaded++; if (c.usedSet.has(t)) floorUsed++; if (!covered(t)) uncovered++; return; } for (const k of t.children ?? []) walk(k); };
  walk(r.root);
  return { uncovered, armed: st.extentFloorArmed, text: `floor ${floorLoaded}/${floors} loaded, ${floorUsed} used, ${uncovered} uncovered; cache ${(c.cachedBytes / 1e6).toFixed(0)}/${(c.maxBytesSize / 1e6).toFixed(0)} MB, target ${r.errorTarget}, base ${st.meshBaseCoverageReady ? "ready" : "pending"}, floor pending ${st.extentFloorPending}` };
});

const failures = [];
const check = (label, value, limit = BLANK_LIMIT) => { if (value > limit) failures.push(`${label}: ${value}%`); };
const drop = async () => {
  await page.goto(`${BASE}/#/?lat=${START.lat}&lng=${START.lng}&zoom=${START.zoom}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__carmaMap && window.__carmaMap.isStyleLoaded(), null, { timeout: 90_000 });
  await page.waitForTimeout(2000);
  await page.evaluate((dropped) => { const dt = new DataTransfer(); dt.setData("URL", dropped); dt.setData("text/uri-list", dropped); dt.setData("text/plain", dropped); window.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true })); window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })); }, STYLE_URL);
};
const quiet = async (label, maxMs = 60000) => {
  const t0 = Date.now(); let last = -1, since = Date.now();
  while (Date.now() - t0 < maxMs) { await page.waitForTimeout(500); if (requests !== last) { last = requests; since = Date.now(); } else if (Date.now() - since > 5000) break; }
  const b = await blank(); const cov = await coverage();
  console.log(`${label}: ${requests} req, blank ${b}%, ${cov.text}`);
  if (cov.armed && cov.uncovered > 0) failures.push(`${label}: ${cov.uncovered} floor tiles without a loaded cut`);
  return b;
};
const stop = async (label, insideDataset = true) => {
  await page.waitForTimeout(900); const b0 = await blank();
  await page.waitForTimeout(1500); const b1 = await blank();
  await page.waitForTimeout(2000); const b2 = await blank();
  const cov = await coverage();
  console.log(`${label}: blank ${b0}% / ${b1}% / ${b2}% at 0.3 / 1.8 / 3.8 s, ${requests} req, ${cov.text}`);
  if (insideDataset) { check(label + " @0.3s", b0); check(label + " @1.8s", b1); check(label + " @3.8s", b2); }
  if (cov.armed && cov.uncovered > 0) failures.push(`${label}: ${cov.uncovered} floor tiles without a loaded cut`);
};
const zoomTo = (hashZoom, duration) => page.evaluate(([z, d]) => window.__carmaMap.zoomTo(z - 1, { duration: d }), [hashZoom, duration]);

if (scenario === "first-render") {
  await drop();
  const t0 = Date.now(); let first = null;
  // The drop replaces the basemap style: wait for the empty frame (nothing but
  // background) before looking for the first frame with mesh pixels.
  while (Date.now() - t0 < 10000 && (await blank()) < 99) await page.waitForTimeout(100);
  while (Date.now() - t0 < 60000) {
    const b = await blank();
    if (b < 99) { first = { t: (Date.now() - t0) / 1000, blank: b }; break; }
    await page.waitForTimeout(150);
  }
  console.log(`first mesh pixels at ${first?.t.toFixed(1)} s with ${first?.blank}% blank, ${requests} req`);
  if (!first) failures.push("no mesh within 60 s"); else check("first render", first.blank);
  await quiet("settled");
} else if (scenario === "zoom-out") {
  const [view = 21, , out = 12] = numbers;
  await drop(); await quiet("initial + extent");
  for (let z = START.zoom + 1; z <= view; z++) { await zoomTo(z, 700); await quiet(`zoomed in to ${z}`, 40000); }
  for (let z = view - 1; z >= out; z--) { await zoomTo(z, 600); await stop(`zoomed out to ${z}`, z >= 14); }
} else if (scenario === "pan-zoom-out") {
  const [view = 19, restMs = 2500, out = 13] = numbers;
  await drop(); await quiet("initial + extent");
  for (let z = START.zoom + 1; z <= view; z++) { await zoomTo(z, 700); await quiet(`zoomed in to ${z}`, 40000); }
  for (const [dx, dy] of [[1200, 0], [0, 800], [-1200, 0], [-1200, 0], [0, -800], [0, -800], [2400, 0], [0, 1600]]) {
    await page.evaluate(([dx, dy]) => window.__carmaMap.panBy([dx, dy], { duration: 600 }), [dx, dy]);
    await page.waitForTimeout(900); const b0 = await blank(); await page.waitForTimeout(restMs); const b1 = await blank();
    const cov = await coverage();
    console.log(`pan ${dx},${dy}: blank ${b0}% / ${b1}%, ${requests} req, ${cov.text}`);
    check(`pan ${dx},${dy} @0.3s`, b0); check(`pan ${dx},${dy} @rest`, b1);
    if (cov.armed && cov.uncovered > 0) failures.push(`pan ${dx},${dy}: ${cov.uncovered} floor tiles without a loaded cut`);
  }
  for (let z = view - 1; z >= out; z--) { await zoomTo(z, 600); await stop(`zoomed out to ${z}`, z >= 14); }
} else {
  console.error(`unknown scenario ${scenario}`); process.exitCode = 2;
}
await browser.close();
console.log(failures.length ? `FAIL\n  ${failures.join("\n  ")}` : "PASS");
if (failures.length) process.exitCode = 1;
