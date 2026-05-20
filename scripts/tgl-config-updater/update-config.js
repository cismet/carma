// Scrapes /about/services from the geoportal SPA, extracts all vector-style
// URLs, and rewrites tileserver-gl's config.json. Designed to run in a
// Playwright container as a docker-compose sidecar.
//
// Style-key derivation mirrors getStyleName() in
// apps/geoportal/src/app/helper/print.tsx so the IDs match what the geoportal
// sends at print time.

const { chromium } = require("playwright");
const fs = require("fs/promises");
const path = require("path");
const { execSync } = require("child_process");

// The .md route renders the same service list as a markdown document, which
// exposes every style URL as plain text in the DOM and is therefore the most
// reliable scrape target. Note the hash-based router (#/...) — Playwright's
// page.goto() handles this fine.
const TARGET_URL =
  process.env.SERVICES_URL ||
  "https://digital-twin-wuppertal-live.github.io/geoportal/#/about/services.md";
const CONFIG_DIR = process.env.CONFIG_DIR || "/data";
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const DRY_RUN =
  process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
// By default the updater is additive: it adds new scraped styles and refreshes
// URLs of existing entries, but never removes a style that disappeared from
// the services page. Pass --clean-up to also drop missing entries.
const CLEAN_UP =
  process.argv.includes("--clean-up") || process.env.CLEAN_UP === "1";

const MIN_RATIO = 0.5; // refuse to write if new count drops below 50% of previous
const STABLE_MS = 10_000; // URL list must be unchanged for this long
const POLL_MS = 2_000;
const TIMEOUT_MS = 120_000;

const TILEJSON_DEFAULT = { bounds: [7.19, 51.26, 7.21, 51.28] };
const OPTIONS_DEFAULT = {
  tileMargin: 128,
  serveStaticMaps: true,
  paths: { root: "./" },
  formatQuality: 80,
  maxSize: 18000,
  maxScaleFactor: 5,
};

function getStyleName(vectorStyle) {
  const parts = vectorStyle.replace(/^https?:\/\//, "").split("/");
  const folder = parts[parts.length - 2];
  const file = parts[parts.length - 1].split(".").slice(0, -1).join(".");
  const base = file === "style" ? `${folder}-style` : `${folder}-${file}`;
  return base.replace(/[^a-zA-Z0-9-]/g, "-");
}

async function collectVectorUrls(page) {
  return await page.evaluate(() => {
    const re = /https?:\/\/[^\s"'<>)]+style\.json\b/gi;
    const urls = new Set();
    document.querySelectorAll("a[href]").forEach((a) => {
      const m = a.href.match(re);
      if (m) m.forEach((u) => urls.add(u));
    });
    const text = document.body.innerText || "";
    const m = text.match(re);
    if (m) m.forEach((u) => urls.add(u));
    return [...urls];
  });
}

async function waitForStable(page) {
  let prev = -1;
  let stableSince = 0;
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const urls = await collectVectorUrls(page);
    if (urls.length === prev && urls.length > 0) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= STABLE_MS) return urls;
    } else {
      prev = urls.length;
      stableSince = 0;
    }
    await page.waitForTimeout(POLL_MS);
  }
  throw new Error(
    `url list did not stabilize within ${TIMEOUT_MS}ms (last=${prev})`
  );
}

function isWellFormedUrl(url) {
  // Reject anything with internal whitespace, control chars, or that doesn't
  // parse as a URL. Defends against page-rendering artifacts that could
  // smuggle a broken URL into config.json.
  if (/\s/.test(url)) return false;
  // (\s above already catches the only real failure mode we have seen)
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      u.pathname.endsWith("style.json");
  } catch {
    return false;
  }
}

function buildConfig(urls) {
  const styles = {};
  const rejected = [];
  for (const url of [...urls].sort()) {
    if (!isWellFormedUrl(url)) {
      rejected.push(url);
      continue;
    }
    const key = getStyleName(url);
    if (styles[key] && styles[key].style !== url) {
      console.warn(
        `[updater] key collision: ${key} -> ${styles[key].style} vs ${url}`
      );
    }
    styles[key] = { style: url, tilejson: TILEJSON_DEFAULT };
  }
  if (rejected.length) {
    console.warn(
      `[updater] rejected ${rejected.length} malformed URL(s):`,
      rejected
    );
  }
  return { options: OPTIONS_DEFAULT, styles };
}

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: CONFIG_DIR, stdio: "pipe" })
      .toString()
      .trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : "";
    throw new Error(`git ${args} -> ${stderr || err.message}`);
  }
}

function ensureRepo() {
  // When CONFIG_DIR is a host-mounted volume, the directory is usually owned
  // by a different uid than the container user, which triggers git's
  // "dubious ownership" refusal. Whitelist the path globally before we touch
  // anything. Safe to call repeatedly; a no-op if already added.
  try {
    execSync(`git config --global --add safe.directory ${CONFIG_DIR}`, {
      stdio: "pipe",
    });
  } catch (err) {
    console.warn(
      "[updater] could not set safe.directory:",
      err.message
    );
  }

  try {
    git("rev-parse --is-inside-work-tree");
  } catch {
    console.log("[updater] initializing git repo in", CONFIG_DIR);
    git("init -q");
  }
  // Always (re)assert the local identity. The container runs as root with no
  // global git config, so `git commit` would otherwise fail with
  // "Author identity unknown" on repos that were initialized externally.
  git("config user.name config-updater");
  git("config user.email config-updater@local");
}

async function readPreviousConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw: "", json: { styles: {} } };
  }
}

function summarizeDiff(prevStyles, nextStyles) {
  const prevKeys = new Set(Object.keys(prevStyles));
  const nextKeys = new Set(Object.keys(nextStyles));
  const added = [...nextKeys].filter((k) => !prevKeys.has(k)).sort();
  const removed = [...prevKeys].filter((k) => !nextKeys.has(k)).sort();
  const changed = [...nextKeys]
    .filter(
      (k) => prevKeys.has(k) && prevStyles[k].style !== nextStyles[k].style
    )
    .sort();
  return { added, removed, changed };
}

function printDryRunReport(prev, nextJson, urls) {
  const { added, removed, changed } = summarizeDiff(
    prev.json.styles ?? {},
    nextJson.styles
  );

  console.log("");
  console.log("=== DRY RUN — no files written, no commits made ===");
  console.log(`scraped URLs:  ${urls.length}`);
  console.log(`prev styles:   ${Object.keys(prev.json.styles ?? {}).length}`);
  console.log(`next styles:   ${Object.keys(nextJson.styles).length}`);
  console.log(`added:         ${added.length}`);
  console.log(`removed:       ${removed.length}`);
  console.log(`changed url:   ${changed.length}`);
  if (added.length) console.log("\n+ added:\n  " + added.join("\n  "));
  if (removed.length) console.log("\n- removed:\n  " + removed.join("\n  "));
  if (changed.length) console.log("\n~ changed:\n  " + changed.join("\n  "));

  const nextRaw = JSON.stringify(nextJson, null, 4) + "\n";
  console.log("\n=== unified diff ===");
  try {
    const tmp = `${CONFIG_PATH}.dryrun`;
    execSync(`mkdir -p ${path.dirname(tmp)}`);
    require("fs").writeFileSync(tmp, nextRaw);
    try {
      execSync(`diff -u "${CONFIG_PATH}" "${tmp}"`, { stdio: "inherit" });
      console.log("(no textual differences)");
    } catch {
      // diff exits non-zero when files differ — that's expected, output went to stdio
    }
    require("fs").unlinkSync(tmp);
  } catch (err) {
    console.warn("[updater] could not produce unified diff:", err.message);
  }
}

async function atomicWrite(filePath, content) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, filePath);
}

function commitIfChanged(message) {
  const status = git("status --porcelain config.json");
  if (!status) {
    console.log("[updater] no changes");
    return false;
  }
  git("add config.json");
  git(`commit -q -m "${message}"`);
  console.log("[updater] committed:", message);
  return true;
}

function isProtected(entry) {
  return entry && entry.protected === true;
}

function withProtectionPreserved(prevEntry, scrapedEntry) {
  // When a scrape refreshes an existing style, keep the operator's
  // `protected: true` flag so they don't have to re-pin after every run.
  if (isProtected(prevEntry) && !isProtected(scrapedEntry)) {
    return { ...scrapedEntry, protected: true };
  }
  return scrapedEntry;
}

function mergeAdditive(prevJson, scrapedConfig) {
  // Start from prev (preserving every existing entry + the previous options
  // block), then overlay scraped entries. Nothing is removed; URLs are
  // refreshed; the `protected` flag is carried over for refreshed entries.
  const styles = { ...(prevJson.styles ?? {}) };
  for (const [key, scraped] of Object.entries(scrapedConfig.styles)) {
    styles[key] = withProtectionPreserved(prevJson.styles?.[key], scraped);
  }
  return {
    options: prevJson.options ?? scrapedConfig.options,
    styles,
  };
}

function applyCleanUp(prevJson, scrapedConfig) {
  // Start from the scrape, then rescue any prev entry whose
  // `protected: true` flag is set — those survive clean-up untouched.
  const styles = {};
  for (const [key, scraped] of Object.entries(scrapedConfig.styles)) {
    styles[key] = withProtectionPreserved(prevJson.styles?.[key], scraped);
  }
  const rescued = [];
  for (const [key, prev] of Object.entries(prevJson.styles ?? {})) {
    if (!isProtected(prev)) continue;
    if (styles[key]) continue; // already present from scrape
    styles[key] = prev;
    rescued.push(key);
  }
  if (rescued.length) {
    console.log(
      `[updater] rescued ${rescued.length} protected style(s):`,
      rescued
    );
  }
  return {
    options: prevJson.options ?? scrapedConfig.options,
    styles,
  };
}

async function main() {
  if (!DRY_RUN) ensureRepo();
  const prev = await readPreviousConfig();
  const prevCount = Object.keys(prev.json.styles ?? {}).length;
  const mode = CLEAN_UP ? "clean-up" : "additive";

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    console.log(
      "[updater] loading",
      TARGET_URL,
      `[mode=${mode}]`,
      DRY_RUN ? "(dry-run)" : ""
    );
    await page.goto(TARGET_URL, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    const urls = await waitForStable(page);
    console.log(
      `[updater] collected ${urls.length} vector style URLs (prev=${prevCount})`
    );

    const scrapedConfig = buildConfig(urls);
    const finalConfig = CLEAN_UP
      ? applyCleanUp(prev.json, scrapedConfig)
      : mergeAdditive(prev.json, scrapedConfig);
    const finalCount = Object.keys(finalConfig.styles).length;

    if (DRY_RUN) {
      console.log(`[updater] mode: ${mode} (final styles=${finalCount})`);
      printDryRunReport(prev, finalConfig, urls);
      return;
    }

    // Safety abort only applies in clean-up mode; additive mode can never
    // shrink the file by definition.
    if (CLEAN_UP && prevCount > 10 && finalCount < prevCount * MIN_RATIO) {
      throw new Error(
        `safety abort: new count ${finalCount} < ${MIN_RATIO * 100}% of previous ${prevCount}`
      );
    }

    const json = JSON.stringify(finalConfig, null, 4) + "\n";
    await atomicWrite(CONFIG_PATH, json);
    commitIfChanged(
      `update config [${mode}] (${finalCount} styles, ${new Date().toISOString()})`
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[updater] failed:", err.message);
  process.exit(1);
});
