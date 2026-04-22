#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const mode = process.argv.includes("--fix") ? "fix" : "check";
const rootDir = process.cwd();

const appTsScope = {
  include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"],
  exclude: [
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
  ],
};

const appLegacyScope = {
  include: ["src/**/*.js", "src/**/*.jsx", "src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"],
  exclude: [
    "src/**/*.spec.js",
    "src/**/*.spec.jsx",
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "src/**/*.test.js",
    "src/**/*.test.jsx",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
  ],
};

const libTsScope = {
  include: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"],
  exclude: [
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/*.stories.ts",
    "src/**/*.stories.tsx",
  ],
};

const libLegacyScope = {
  include: ["src/**/*.js", "src/**/*.jsx", "src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"],
  exclude: [
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "src/**/*.spec.js",
    "src/**/*.spec.jsx",
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "src/**/*.test.js",
    "src/**/*.test.jsx",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/*.stories.js",
    "src/**/*.stories.jsx",
    "src/**/*.stories.ts",
    "src/**/*.stories.tsx",
  ],
};

const libShellScope = {
  include: [
    "index.js",
    "index.jsx",
    "index.ts",
    "index.tsx",
    "*/index.js",
    "*/index.jsx",
    "*/index.ts",
    "*/index.tsx",
    ...libLegacyScope.include,
  ],
  exclude: libLegacyScope.exclude,
};

const specTsScope = {
  include: [
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx",
    "src/**/*.d.ts",
  ],
};

const specLegacyScope = {
  include: [
    "vite.config.ts",
    "vite.config.mts",
    "vitest.config.ts",
    "vitest.config.mts",
    "src/**/*.test.js",
    "src/**/*.spec.js",
    "src/**/*.test.jsx",
    "src/**/*.spec.jsx",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx",
    "src/**/*.d.ts",
  ],
};

const genericStorybookScope = {
  include: [
    "src/**/*.stories.ts",
    "src/**/*.stories.js",
    "src/**/*.stories.jsx",
    "src/**/*.stories.tsx",
    ".storybook/*.js",
    ".storybook/*.ts",
  ],
  exclude: [
    "src/**/*.spec.ts",
    "src/**/*.test.ts",
    "src/**/*.spec.js",
    "src/**/*.test.js",
    "src/**/*.spec.tsx",
    "src/**/*.test.tsx",
    "src/**/*.spec.jsx",
    "src/**/*.test.jsx",
  ],
};

const storiesStorybookScope = {
  include: [
    "stories/**/*.stories.ts",
    "stories/**/*.stories.tsx",
    "stories/**/*.stories.mdx",
    ".storybook/*.ts",
  ],
  exclude: ["stories/**/*.spec.ts", "stories/**/*.spec.tsx"],
};

const e2eScope = {
  include: ["src/**/*.ts", "playwright.config.ts"],
};

const rootScanDirs = ["apps", "libraries", "playgrounds", "services", "envirometrics", "e2e"];

const projectConfigFiles = [];

for (const dir of rootScanDirs) {
  const absDir = path.join(rootDir, dir);
  if (fs.existsSync(absDir)) {
    collectConfigs(absDir);
  }
}

const mismatches = [];

for (const absFile of projectConfigFiles) {
  const relFile = toPosix(path.relative(rootDir, absFile));
  const expected = getExpectedScope(relFile);
  if (!expected) {
    continue;
  }

  const current = JSON.parse(fs.readFileSync(absFile, "utf8"));
  const problems = [];

  if (!sameArray(current.include, expected.include)) {
    problems.push({ field: "include", expected: expected.include, actual: current.include ?? null });
  }

  if (!sameArray(current.exclude, expected.exclude)) {
    problems.push({ field: "exclude", expected: expected.exclude ?? null, actual: current.exclude ?? null });
  }

  if ("files" in current) {
    problems.push({ field: "files", expected: null, actual: current.files });
  }

  if (problems.length === 0) {
    continue;
  }

  mismatches.push({ relFile, problems });

  if (mode === "fix") {
    current.include = expected.include;
    if (expected.exclude) {
      current.exclude = expected.exclude;
    } else {
      delete current.exclude;
    }
    delete current.files;
    fs.writeFileSync(absFile, `${JSON.stringify(current, null, 2)}\n`);
  }
}

if (mismatches.length === 0) {
  console.log(`[check-tsconfig-scope-patterns] OK (${projectConfigFiles.length} files checked)`);
  process.exit(0);
}

if (mode === "fix") {
  console.log(`[check-tsconfig-scope-patterns] fixed ${mismatches.length} file(s)`);
  process.exit(0);
}

console.error(`[check-tsconfig-scope-patterns] found ${mismatches.length} file(s) with non-canonical scope patterns`);
for (const mismatch of mismatches) {
  console.error(`- ${mismatch.relFile}`);
  for (const problem of mismatch.problems) {
    console.error(`  ${problem.field}: expected ${format(problem.expected)}, got ${format(problem.actual)}`);
  }
}
process.exit(1);

function collectConfigs(absDir) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const absEntry = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === "dist" ||
        entry.name === ".git" ||
        absEntry.includes("-submodule")
      ) {
        continue;
      }
      collectConfigs(absEntry);
      continue;
    }

    if (
      /^tsconfig\.(app|lib|spec|storybook)\.json$/.test(entry.name) ||
      (entry.name === "tsconfig.json" && toPosix(absEntry).includes("/e2e/"))
    ) {
      projectConfigFiles.push(absEntry);
    }
  }
}

function getExpectedScope(relFile) {
  const projectDir = path.dirname(relFile);
  const hasLegacySource = detectLegacySource(projectDir);

  if (relFile.startsWith("e2e/") && path.basename(relFile) === "tsconfig.json") {
    return e2eScope;
  }

  switch (path.basename(relFile)) {
    case "tsconfig.app.json":
      return hasLegacySource ? appLegacyScope : appTsScope;
    case "tsconfig.lib.json":
      if (hasShellEntries(projectDir)) {
        return libShellScope;
      }
      return hasLegacySource ? libLegacyScope : libTsScope;
    case "tsconfig.spec.json":
      return hasLegacySource ? specLegacyScope : specTsScope;
    case "tsconfig.storybook.json":
      return relFile === "playgrounds/stories/tsconfig.storybook.json"
        ? storiesStorybookScope
        : genericStorybookScope;
    default:
      return null;
  }
}

function detectLegacySource(projectDir) {
  const absSrcDir = path.join(rootDir, projectDir, "src");
  if (!fs.existsSync(absSrcDir)) {
    return false;
  }

  const stack = [absSrcDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absEntry = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absEntry);
        continue;
      }
      if (/\.(js|jsx)$/.test(entry.name)) {
        return true;
      }
    }
  }

  return false;
}

function hasShellEntries(projectDir) {
  const absProjectDir = path.join(rootDir, projectDir);
  for (const rel of ["index.js", "index.jsx", "index.ts", "index.tsx"]) {
    if (fs.existsSync(path.join(absProjectDir, rel))) {
      return true;
    }
  }

  for (const entry of fs.readdirSync(absProjectDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "src" || entry.name.startsWith(".")) {
      continue;
    }
    for (const rel of ["index.js", "index.jsx", "index.ts", "index.tsx"]) {
      if (fs.existsSync(path.join(absProjectDir, entry.name, rel))) {
        return true;
      }
    }
  }

  return false;
}

function sameArray(actual, expected) {
  if (expected == null) {
    return actual == null;
  }
  return JSON.stringify(actual ?? null) === JSON.stringify(expected);
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function format(value) {
  return JSON.stringify(value);
}
