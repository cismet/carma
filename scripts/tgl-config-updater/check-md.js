// Offline sanity-check: parse a saved services.md and compare the vector
// style entries it contains against an existing tileserver-gl config.json.
// No Playwright, no network — just file I/O plus the same regex / key
// derivation as update-config.js.
//
// Usage:
//   node check-md.js [services.md] [config.json] [--clean-up]
//   node check-md.js                                  # defaults to ~/Downloads/{services.md,config.json}
//
// Modes (matching update-config.js):
//   default       additive: would only add/refresh, never remove
//   --clean-up    would also drop entries missing from the md

const fs = require("fs");
const path = require("path");
const os = require("os");

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const CLEAN_UP = process.argv.includes("--clean-up");
const MD_PATH = positional[0] || path.join(os.homedir(), "Downloads/services.md");
const CONFIG_PATH =
  positional[1] || path.join(os.homedir(), "Downloads/config.json");

// --- mirrored from update-config.js -----------------------------------------

function getStyleName(vectorStyle) {
  const parts = vectorStyle.replace(/^https?:\/\//, "").split("/");
  const folder = parts[parts.length - 2];
  const file = parts[parts.length - 1].split(".").slice(0, -1).join(".");
  const base = file === "style" ? `${folder}-style` : `${folder}-${file}`;
  return base.replace(/[^a-zA-Z0-9-]/g, "-");
}

function isWellFormedUrl(url) {
  if (/\s/.test(url)) return false;
  try {
    const u = new URL(url);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      u.pathname.endsWith("style.json")
    );
  } catch {
    return false;
  }
}

// --- extraction -------------------------------------------------------------

function extractUrls(md) {
  const re = /https?:\/\/\S+style\.json\b/gi;
  return [...new Set(md.match(re) || [])].sort();
}

// --- comparison + table -----------------------------------------------------

function pad(s, w) {
  s = String(s);
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function printTable(rows, headers) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length))
  );
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(headers.map((h, i) => pad(h, widths[i])).join("  "));
  console.log(sep);
  for (const r of rows) {
    console.log(r.map((c, i) => pad(c ?? "", widths[i])).join("  "));
  }
}

function main() {
  const md = fs.readFileSync(MD_PATH, "utf8");
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

  const rawUrls = extractUrls(md);
  const wellFormed = rawUrls.filter(isWellFormedUrl);
  const malformed = rawUrls.filter((u) => !isWellFormedUrl(u));

  const scrapedByKey = new Map();
  for (const url of wellFormed) {
    const key = getStyleName(url);
    if (scrapedByKey.has(key) && scrapedByKey.get(key) !== url) {
      console.warn(
        `[check] key collision: ${key} -> ${scrapedByKey.get(key)} vs ${url}`
      );
    }
    scrapedByKey.set(key, url);
  }

  const configByKey = new Map(
    Object.entries(config.styles ?? {}).map(([k, v]) => [k, v.style])
  );
  const protectedKeys = new Set(
    Object.entries(config.styles ?? {})
      .filter(([, v]) => v && v.protected === true)
      .map(([k]) => k)
  );

  // Compute what would actually end up in config.json depending on mode.
  //   additive: nothing is pruned (KEPT additive)
  //   clean-up: prune anything not in md, EXCEPT entries flagged `protected: true`
  const allKeys = new Set([...scrapedByKey.keys(), ...configByKey.keys()]);
  const rows = [];
  for (const key of [...allKeys].sort()) {
    const inMd = scrapedByKey.has(key);
    const inCfg = configByKey.has(key);
    const isProtected = protectedKeys.has(key);
    let status;
    if (inMd && inCfg) {
      status =
        scrapedByKey.get(key) === configByKey.get(key) ? "OK" : "URL DIFFERS";
    } else if (inMd) {
      status = "+ ADDED";
    } else if (isProtected) {
      status = "= KEPT (protected)";
    } else {
      status = CLEAN_UP ? "- REMOVED" : "= KEPT (additive)";
    }
    if (status === "OK") continue; // only show diffs
    rows.push([
      status,
      key,
      scrapedByKey.get(key) ?? "",
      configByKey.get(key) ?? "",
    ]);
  }

  const okCount = [...allKeys].filter(
    (k) =>
      scrapedByKey.has(k) &&
      configByKey.has(k) &&
      scrapedByKey.get(k) === configByKey.get(k)
  ).length;

  const protectedCount = protectedKeys.size;
  const finalCount = CLEAN_UP
    ? new Set([...scrapedByKey.keys(), ...protectedKeys]).size
    : new Set([...scrapedByKey.keys(), ...configByKey.keys()]).size;

  console.log(`md:      ${MD_PATH}`);
  console.log(`config:  ${CONFIG_PATH}`);
  console.log(`mode:    ${CLEAN_UP ? "clean-up" : "additive (default)"}`);
  console.log("");
  console.log(`raw URL matches:   ${rawUrls.length}`);
  console.log(`well-formed:       ${wellFormed.length}`);
  console.log(`malformed:         ${malformed.length}`);
  console.log(`scraped styles:    ${scrapedByKey.size}`);
  console.log(`config styles:     ${configByKey.size}`);
  console.log(`protected styles:  ${protectedCount}`);
  console.log(`final styles:      ${finalCount}`);
  console.log(`matching (OK):     ${okCount}`);
  console.log(
    `differing rows:    ${rows.length} (shown below; rows with status OK are hidden)`
  );
  console.log("");

  if (malformed.length) {
    console.log("=== MALFORMED URLs (rejected) ===");
    for (const u of malformed) console.log("  " + JSON.stringify(u));
    console.log("");
  }

  console.log("=== DIFF TABLE ===");
  printTable(rows, ["status", "style key", "scraped URL", "config URL"]);
}

main();
