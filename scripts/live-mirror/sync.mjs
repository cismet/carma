#!/usr/bin/env node
// Builds the source tree for the live code mirror: everything the apps listed
// in mirror.config.json are built from, copied out of this checkout and its
// submodules. Committing and pushing the tree is the workflow's job.
//
//   node scripts/live-mirror/sync.mjs --out /tmp/live-mirror-tree [--force]
//     [--apps geoportal,stadtplan] [--summary summary.json] [--strict]
//     [--require-secret-scan]
//
// Config keys:
//   apps          nx projects whose dependency closure is mirrored
//   rootPaths     files or directories outside any project that builds need
//   submodules    "include" or "exclude" for every path in .gitmodules
//   excludeGlobs  tree paths to drop ("**", "*", "?")
//   files         tree path -> repo path, copied as is
//   templates     tree path -> repo path, with {{apps}} and {{sources}} filled in
//   jsonOmit      tree path of a JSON file -> top-level keys to drop from it
//   npmOmit       npm packages to drop from package.json and package-lock.json
//   gitleaksConfig  repo path of the gitleaks config for the secret scan
//
// Runs on Node 20 (the CI version), so no fs.glob or path.matchesGlob.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    config: {
      type: "string",
      default: join(root, "scripts/live-mirror/mirror.config.json"),
    },
    apps: { type: "string" },
    force: { type: "boolean", default: false },
    summary: { type: "string" },
    strict: { type: "boolean", default: false },
    "require-secret-scan": { type: "boolean", default: false },
  },
});

const log = (message) => console.log(`[live-mirror] ${message}`);
const fail = (message) => {
  console.error(`[live-mirror] ${message}`);
  process.exit(1);
};
const git = (cwd, ...gitArgs) =>
  execFileSync("git", ["-C", cwd, ...gitArgs], {
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });

if (!args.out) fail("--out <dir> is required");
const out = resolve(args.out);
if (out === root || root.startsWith(`${out}/`)) {
  fail(`--out must not be the repository or one of its parents: ${out}`);
}

const config = JSON.parse(readFileSync(resolve(args.config), "utf8"));
const apps = args.apps
  ? args.apps
      .split(",")
      .map((app) => app.trim())
      .filter(Boolean)
  : config.apps;
if (!apps?.length) fail("no apps configured");

// The mode from `git ls-files -s` tells regular files (100644/100755),
// symlinks (120000) and submodule gitlinks (160000) apart.
const listIndex = (cwd, paths) =>
  git(cwd, "ls-files", "-s", "-z", "--", ...paths)
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      return {
        mode: line.slice(0, tab).split(" ")[0],
        path: line.slice(tab + 1),
      };
    });

const globToRegExp = (glob) => {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      // "**/" stands for any number of directories, including none
      if (glob[i + 2] === "/") {
        pattern += "(?:.*/)?";
        i += 2;
      } else {
        pattern += ".*";
        i += 1;
      }
    } else if (c === "*") pattern += "[^/]*";
    else if (c === "?") pattern += "[^/]";
    else pattern += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
};
const excludes = (config.excludeGlobs ?? []).map(globToRegExp);

// --- dependency closure ------------------------------------------------------

const graphFile = join(
  mkdtempSync(join(tmpdir(), "live-mirror-")),
  "graph.json"
);
execFileSync("npx", ["nx", "graph", `--file=${graphFile}`], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
});
const { nodes, dependencies } = JSON.parse(
  readFileSync(graphFile, "utf8")
).graph;

const unknown = apps.filter((app) => !nodes[app]);
if (unknown.length) fail(`not an nx project: ${unknown.join(", ")}`);

const projects = new Set();
const queue = [...apps];
while (queue.length) {
  const name = queue.pop();
  if (projects.has(name)) continue;
  projects.add(name);
  for (const { target } of dependencies[name] ?? []) {
    if (!target.startsWith("npm:")) queue.push(target);
  }
}
const projectRoots = [...projects].map((name) => nodes[name].data.root).sort();
const rootProject = [...projects].find((name) => nodes[name].data.root === ".");
if (rootProject)
  fail(`project ${rootProject} has the repository root as its root`);

// --- submodules --------------------------------------------------------------

const submoduleConfig = git(root, "config", "-f", ".gitmodules", "--list")
  .trim()
  .split("\n")
  .map((line) => /^submodule\.(.+)\.(path|url)=(.*)$/.exec(line))
  .filter(Boolean)
  .reduce((byName, [, name, key, value]) => {
    byName[name] = { ...byName[name], [key]: value };
    return byName;
  }, {});
const submodules = Object.fromEntries(
  Object.values(submoduleConfig).map(({ path, url }) => [path, url])
);
const undecided = Object.keys(submodules).filter(
  (path) => !config.submodules?.[path]
);
if (undecided.length) {
  fail(
    `submodules without "include" or "exclude" in the config: ${undecided.join(
      ", "
    )}`
  );
}

// --- collect -----------------------------------------------------------------

const files = new Map(); // tree path -> absolute source path
const links = new Map(); // tree path -> link target, as stored in git
const excluded = [];
const skippedSubmodules = [];
const missingInWorktree = [];
const sources = { carma: git(root, "rev-parse", "HEAD").trim() };

const add = (mode, treePath, sourcePath) => {
  if (excludes.some((re) => re.test(treePath))) {
    excluded.push(treePath);
  } else if (mode === "120000") {
    links.set(treePath, readlinkSync(sourcePath));
  } else if (!existsSync(sourcePath)) {
    missingInWorktree.push(treePath);
  } else {
    files.set(treePath, sourcePath);
  }
};

const rootPathEntries = new Map(config.rootPaths.map((path) => [path, 0]));
for (const { mode, path } of listIndex(root, [
  ...projectRoots,
  ...config.rootPaths,
])) {
  for (const rootPath of rootPathEntries.keys()) {
    if (path === rootPath || path.startsWith(`${rootPath}/`)) {
      rootPathEntries.set(rootPath, rootPathEntries.get(rootPath) + 1);
    }
  }
  if (mode !== "160000") {
    add(mode, path, join(root, path));
    continue;
  }
  if (config.submodules[path] !== "include") {
    skippedSubmodules.push(path);
    continue;
  }
  const submoduleRoot = join(root, path);
  if (!existsSync(join(submoduleRoot, ".git")))
    fail(`submodule ${path} is not initialised`);
  sources[posix.basename(submodules[path], ".git")] = git(
    submoduleRoot,
    "rev-parse",
    "HEAD"
  ).trim();
  for (const entry of listIndex(submoduleRoot, [])) {
    if (entry.mode === "160000")
      fail(`nested submodule ${path}/${entry.path} is not supported`);
    add(entry.mode, `${path}/${entry.path}`, join(submoduleRoot, entry.path));
  }
}
const untracked = [...rootPathEntries]
  .filter(([, count]) => !count)
  .map(([path]) => path);
if (untracked.length)
  fail(`rootPaths not tracked in git: ${untracked.join(", ")}`);

for (const [treePath, sourcePath] of Object.entries(config.files ?? {})) {
  files.set(treePath, join(root, sourcePath));
}

// --- check references ----------------------------------------------------------

const suffixes = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".d.ts",
];
const lookup = (paths, linkTargets) => {
  const known = new Set(paths);
  const dirs = new Set();
  for (const path of known) {
    for (
      let dir = posix.dirname(path);
      dir !== "." && !dirs.has(dir);
      dir = posix.dirname(dir)
    ) {
      dirs.add(dir);
    }
  }
  const throughLinks = (path) => {
    for (const [link, target] of linkTargets) {
      if (path === link || path.startsWith(`${link}/`)) {
        return (
          posix.join(posix.dirname(link), target) + path.slice(link.length)
        );
      }
    }
    return path;
  };
  const has = (path) => {
    const resolved = throughLinks(posix.normalize(path));
    return known.has(resolved) || dirs.has(resolved);
  };
  return {
    has,
    resolves: (base) =>
      !base.startsWith("../") &&
      (suffixes.some((suffix) => has(base + suffix)) ||
        suffixes.slice(1).some((suffix) => has(`${base}/index${suffix}`))),
  };
};
// The same lookup over the whole checkout tells a file the mirror left out
// apart from a reference that is broken in carma already (dead code, a stale
// story), which the mirror cannot fix and should not report as its own gap.
const carmaLinks = new Map();
const carmaPaths = [];
for (const { mode, path } of listIndex(root, [])) {
  if (mode === "120000") carmaLinks.set(path, readlinkSync(join(root, path)));
  if (mode !== "160000") carmaPaths.push(path);
}
for (const path of Object.keys(submodules)) {
  if (config.submodules[path] !== "include") continue;
  for (const entry of listIndex(join(root, path), []))
    carmaPaths.push(`${path}/${entry.path}`);
}
const carma = lookup(carmaPaths, carmaLinks);

const codeFile = /\.(?:[cm]?[jt]sx?)$/;

// --- path aliases ------------------------------------------------------------

// nx only records dependencies on projects. A wildcard alias such as
// "@carma-commons/*" also reaches folders without a project.json (e.g.
// libraries/commons/ui/tag-selection), so bare imports are resolved against
// the tsconfig paths and such folders are added, until nothing new turns up.
const tsconfigBase = JSON.parse(
  readFileSync(join(root, "tsconfig.base.json"), "utf8")
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "$1")
    .replace(/,(\s*[}\]])/g, "$1")
);
const baseUrl = tsconfigBase.compilerOptions?.baseUrl ?? ".";
const aliases = Object.entries(tsconfigBase.compilerOptions?.paths ?? {})
  .map(([key, targets]) => {
    const star = key.indexOf("*");
    return star === -1
      ? { key, targets, prefix: key, suffix: "", wildcard: false }
      : {
          key,
          targets,
          prefix: key.slice(0, star),
          suffix: key.slice(star + 1),
          wildcard: true,
        };
  })
  .sort((a, b) => b.prefix.length - a.prefix.length);
const resolveAlias = (specifier) => {
  const match =
    aliases.find((alias) => !alias.wildcard && alias.key === specifier) ??
    aliases.find(
      (alias) =>
        alias.wildcard &&
        specifier.length >= alias.prefix.length + alias.suffix.length &&
        specifier.startsWith(alias.prefix) &&
        specifier.endsWith(alias.suffix)
    );
  if (!match) return null;
  const middle = match.wildcard
    ? specifier.slice(
        match.prefix.length,
        specifier.length - match.suffix.length
      )
    : "";
  return match.targets.map((target) =>
    posix.normalize(posix.join(baseUrl, target.replace("*", middle)))
  );
};
const bareImport =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"'\n.][^"'\n]*)["']/g;

const aliasAdded = new Set();
const unresolvedAliases = [];
const scanned = new Set();
for (let grew = true; grew; ) {
  grew = false;
  const current = lookup([...files.keys(), ...links.keys()], links);
  for (const [treePath, sourcePath] of files) {
    if (scanned.has(treePath) || !codeFile.test(treePath)) continue;
    scanned.add(treePath);
    for (const [, specifier] of readFileSync(sourcePath, "utf8").matchAll(
      bareImport
    )) {
      const candidates = resolveAlias(specifier);
      if (!candidates || candidates.some((path) => current.resolves(path)))
        continue;
      const target = candidates.find((path) => carma.resolves(path));
      if (!target) {
        unresolvedAliases.push(`${treePath}: ${specifier}`);
        continue;
      }
      const unit = target.includes("/src/")
        ? target.slice(0, target.indexOf("/src/"))
        : posix.dirname(target);
      if (aliasAdded.has(unit)) continue;
      aliasAdded.add(unit);
      grew = true;
      for (const entry of listIndex(root, [unit])) {
        if (entry.mode === "160000")
          fail(`alias target ${unit} contains submodule ${entry.path}`);
        add(entry.mode, entry.path, join(root, entry.path));
      }
    }
  }
}

const tree = lookup([...files.keys(), ...links.keys()], links);

const danglingLinks = [...links]
  .filter(
    ([link, target]) => !tree.has(posix.join(posix.dirname(link), target))
  )
  .map(([link, target]) => `${link} -> ${target}`);

// Relative imports that leave the tree mean a dependency nx does not see, e.g.
// a vite config reaching into a sibling directory. A regex over the source is
// enough for a report; it does not have to be a parser.
const tsconfigFile = /(?:^|\/)tsconfig[^/]*\.json$/;
const importSpecifier =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"'\n]*)["']/g;
const tsconfigExtends = /"extends"\s*:\s*"(\.{1,2}\/[^"]+)"/g;

const danglingImports = [];
const brokenInCarma = [];
for (const [treePath, sourcePath] of files) {
  const pattern = codeFile.test(treePath)
    ? importSpecifier
    : tsconfigFile.test(treePath)
    ? tsconfigExtends
    : null;
  if (!pattern) continue;
  for (const [, specifier] of readFileSync(sourcePath, "utf8").matchAll(
    pattern
  )) {
    const base = posix.normalize(
      posix.join(posix.dirname(treePath), specifier.split("?")[0])
    );
    if (tree.resolves(base)) continue;
    (carma.resolves(base) ? danglingImports : brokenInCarma).push(
      `${treePath}: ${specifier}`
    );
  }
}

// --- write -------------------------------------------------------------------

if (existsSync(out)) {
  if (readdirSync(out).length && !args.force)
    fail(`${out} is not empty, pass --force to replace it`);
  rmSync(out, { recursive: true, force: true });
}
let bytes = 0;
for (const [treePath, sourcePath] of files) {
  const dest = join(out, treePath);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(sourcePath, dest);
  bytes += statSync(sourcePath).size;
}
for (const [treePath, target] of links) {
  const dest = join(out, treePath);
  mkdirSync(dirname(dest), { recursive: true });
  symlinkSync(target, dest);
}

const appList = apps
  .map((app) => `- \`${app}\` (\`${nodes[app].data.root}\`)`)
  .join("\n");
const sourceList = Object.entries(sources)
  .map(([name, sha]) => `- ${name}: \`${sha}\``)
  .join("\n");
for (const [treePath, templatePath] of Object.entries(config.templates ?? {})) {
  const dest = join(out, treePath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(
    dest,
    readFileSync(join(root, templatePath), "utf8")
      .replaceAll("{{apps}}", appList)
      .replaceAll("{{sources}}", sourceList)
  );
}

for (const [treePath, keys] of Object.entries(config.jsonOmit ?? {})) {
  const dest = join(out, treePath);
  if (!existsSync(dest)) fail(`jsonOmit: ${treePath} is not in the tree`);
  const json = JSON.parse(readFileSync(dest, "utf8"));
  for (const key of keys) delete json[key];
  writeFileSync(dest, `${JSON.stringify(json, null, 2)}\n`);
}

// --- npm packages ------------------------------------------------------------

// Packages only cismet can install (private registries) leave the mirror's
// package.json and lock. The lock then drops every entry nothing reachable
// needs any more, so `npm ci` gets a lock that matches package.json.
const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const packageJsonPath = join(out, "package.json");
const lockPath = join(out, "package-lock.json");
const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const lockPackages = lock.packages;
for (const name of config.npmOmit ?? []) {
  for (const section of dependencySections) {
    delete pkg[section]?.[name];
    delete lockPackages[""][section]?.[name];
  }
}

// Node resolution over lock keys: the nearest node_modules/<name> walking up
// from the package that asks for it.
const resolveInLock = (from, name) => {
  for (let base = from; ; ) {
    const key = base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
    if (lockPackages[key]) return key;
    if (!base) return null;
    const nested = base.lastIndexOf("/node_modules/");
    base = nested === -1 ? "" : base.slice(0, nested);
  }
};
const reachable = new Set([""]);
const lockQueue = [""];
while (lockQueue.length) {
  const key = lockQueue.pop();
  const entry = lockPackages[key];
  const sections =
    key === ""
      ? dependencySections
      : dependencySections.filter((s) => s !== "devDependencies");
  for (const section of sections) {
    for (const name of Object.keys(entry[section] ?? {})) {
      const target = resolveInLock(key, name);
      if (target && !reachable.has(target)) {
        reachable.add(target);
        lockQueue.push(target);
      }
    }
  }
}
const stillRequired = [...reachable].filter((key) =>
  (config.npmOmit ?? []).some((name) => key.endsWith(`node_modules/${name}`))
);
if (stillRequired.length)
  fail(`npmOmit: still required in the lock: ${stillRequired.join(", ")}`);
const droppedLockEntries = Object.keys(lockPackages).filter(
  (key) => !reachable.has(key)
);
for (const key of droppedLockEntries) delete lockPackages[key];
const nonPublicPackages = [...reachable]
  .filter(
    (key) =>
      lockPackages[key].resolved &&
      !lockPackages[key].resolved.startsWith("https://registry.npmjs.org/")
  )
  .map((key) => `${key} ${lockPackages[key].resolved}`);
writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

// --- secret scan ---------------------------------------------------------------

let secretScan = "skipped";
try {
  execFileSync("gitleaks", ["version"], { stdio: "ignore" });
  secretScan = "available";
} catch {
  if (args["require-secret-scan"]) fail("gitleaks is not installed");
  log("warning: gitleaks is not installed, secret scan skipped");
}
if (secretScan === "available") {
  try {
    const gitleaksConfig = config.gitleaksConfig
      ? ["--config", join(root, config.gitleaksConfig)]
      : [];
    execFileSync(
      "gitleaks",
      [
        "detect",
        "--no-git",
        "--source",
        out,
        "--redact",
        "--no-banner",
        ...gitleaksConfig,
      ],
      { stdio: "inherit" }
    );
    secretScan = "clean";
  } catch {
    fail("gitleaks reported possible secrets, see above");
  }
}

// --- report ------------------------------------------------------------------

const dirty = [
  git(
    root,
    "status",
    "--porcelain",
    "--",
    ...projectRoots,
    ...config.rootPaths
  ),
  ...Object.keys(submodules)
    .filter((path) => config.submodules[path] === "include")
    .map((path) => git(join(root, path), "status", "--porcelain")),
]
  .join("")
  .trim();

const summary = {
  apps,
  projects: projects.size,
  files: files.size,
  links: links.size,
  bytes,
  sources,
  skippedSubmodules,
  excluded: excluded.length,
  missingInWorktree,
  danglingLinks,
  danglingImports,
  brokenInCarma,
  aliasAdded: [...aliasAdded],
  unresolvedAliases,
  droppedLockEntries: droppedLockEntries.length,
  nonPublicPackages,
  secretScan,
  dirty: Boolean(dirty),
};
if (args.summary)
  writeFileSync(resolve(args.summary), `${JSON.stringify(summary, null, 2)}\n`);

log(`${apps.length} apps, ${projects.size} nx projects`);
log(
  `${files.size} files, ${links.size} symlinks, ${(bytes / 1024 / 1024).toFixed(
    1
  )} MiB -> ${out}`
);
for (const [name, sha] of Object.entries(sources)) log(`source ${name} ${sha}`);
if (config.npmOmit?.length) {
  log(
    `npm: dropped ${config.npmOmit.join(", ")} and ${
      droppedLockEntries.length
    } lock entries only they needed`
  );
}
for (const line of nonPublicPackages)
  log(`warning: lock entry not from registry.npmjs.org: ${line}`);
if (aliasAdded.size) {
  log(
    `added through tsconfig paths, no nx project: ${[...aliasAdded].join(", ")}`
  );
}
if (unresolvedAliases.length) {
  log(
    `${unresolvedAliases.length} alias imports resolve nowhere in the checkout (listed in --summary)`
  );
}
if (skippedSubmodules.length)
  log(`submodules left out: ${skippedSubmodules.join(", ")}`);
if (excluded.length) log(`${excluded.length} files excluded by excludeGlobs`);
if (dirty) log(`warning: uncommitted changes in mirrored paths:\n${dirty}`);
if (brokenInCarma.length) {
  log(
    `${brokenInCarma.length} relative imports are broken in carma too (listed in --summary)`
  );
}
for (const [label, list] of [
  ["tracked but missing in the worktree", missingInWorktree],
  ["symlinks pointing outside the tree", danglingLinks],
  ["relative imports to carma files the tree leaves out", danglingImports],
]) {
  if (!list.length) continue;
  log(`${list.length} ${label}:`);
  for (const line of list.slice(0, 40)) log(`  ${line}`);
  if (list.length > 40) log(`  ... ${list.length - 40} more`);
}
if (
  args.strict &&
  (missingInWorktree.length || danglingLinks.length || danglingImports.length)
) {
  process.exit(1);
}
