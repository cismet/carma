#!/usr/bin/env node
// Local immutable preview: fast development builds, serialized rebuilds, explicit reload.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  createReadStream,
  createWriteStream,
  readFileSync,
  watch,
} from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist/preview/geoportal");
// An explicitly configured wrapper is optional; default to the checkout Nx binary.
const wrapper = process.env.CARMA_BUILD_WRAPPER;
const useWrapper = Boolean(wrapper && existsSync(wrapper));
if (process.env.CARMA_BUILD_WRAPPER && !useWrapper) {
  throw new Error("CARMA_BUILD_WRAPPER does not point to an existing file");
}
const port = 4300;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
// Filesystem events include generated compiler files. Only changes to actual
// source inputs may invalidate a build or start another one.
const sourceSignature = () => {
  const hash = createHash("sha256")
    .update(git("rev-parse", "HEAD"))
    .update(git("diff", "HEAD", "--binary"));
  const untracked = git(
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    "apps",
    "libraries",
    "scripts"
  );
  for (const file of untracked.split("\0").filter(Boolean).sort()) {
    if (/\.timestamp[.-]/.test(file)) continue;
    hash.update(file).update(readFileSync(join(root, file)));
  }
  return hash.digest("hex");
};
const state = {
  current: null,
  building: null,
  paused: false,
  pending: false,
  error: null,
};
let lastAttemptSignature;
let timer;
let child;
let stopping = false;
const watchers = [];
await mkdir(output, { recursive: true });

async function rebuild() {
  if (stopping || state.paused || state.building || !state.pending) return;
  state.pending = false;
  const signature = sourceSignature();
  if (signature === lastAttemptSignature) return;
  lastAttemptSignature = signature;
  const head = git("rev-parse", "HEAD");
  const id = `${head.slice(0, 9)}-${Date.now()}`;
  const destination = join(output, id);
  state.building = id;
  state.error = null;
  await mkdir(destination, { recursive: true });
  const metadata = {
    id,
    head,
    started: new Date().toISOString(),
    status: git("status", "--short", "--untracked-files=normal"),
    diffSha256: createHash("sha256").update(git("diff", "HEAD")).digest("hex"),
    configuration: "development",
    dependencyTasks: false,
    sourceSignature: signature,
  };
  const logPath = join(output, `${id}.log`);
  const log = createWriteStream(logPath);
  console.log(`[preview] building ${id}`);
  child = spawn(
    useWrapper ? wrapper : process.execPath,
    [
      ...(useWrapper ? ["--raw", "nx"] : [join(root, "node_modules/nx/bin/nx.js")]),
      "build",
      "geoportal",
      "--configuration=development",
      `--outputPath=dist/preview/geoportal/${id}`,
      `--base=/build/${id}/`,
      "--excludeTaskDependencies",
      "--skip-nx-cache",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NX_DAEMON: "false",
        NX_ISOLATE_PLUGINS: "false",
        NODE_OPTIONS: "--max-old-space-size=16384",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const code = await new Promise((done) => {
    child.once("error", (error) => {
      state.error = error.message;
      done(1);
    });
    child.once("close", done);
  });
  log.end();
  child = null;
  metadata.finished = new Date().toISOString();
  metadata.exitCode = code;
  metadata.changedDuringBuild = sourceSignature() !== signature;
  state.pending = metadata.changedDuringBuild;
  await writeFile(
    join(destination, "build-info.json"),
    JSON.stringify(metadata, null, 2)
  );
  if (code === 0 && !metadata.changedDuringBuild) {
    state.current = id;
    console.log(`[preview] ready http://localhost:${port}/build/${id}/`);
  } else if (code !== 0) {
    state.error ??= `Build failed (${code}); see ${logPath}`;
    console.error(`[preview] ${state.error}`);
  } else {
    console.log(
      "[preview] sources changed during build; rebuilding before publication"
    );
  }
  state.building = null;
  if (state.pending) schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(
    () =>
      rebuild().catch((error) => {
        state.error = error.message;
        state.building = null;
        console.error(error);
      }),
    3000
  );
}

// Requests are confined to successful build directories. Older tabs keep their
// exact assets and workers; neither publication nor source edits reload a tab.
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${port}`);
    if (url.pathname === "/__preview/status") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(state));
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (!path.startsWith("/build/")) {
      if (!state.current) {
        response.writeHead(503).end("Preview build in progress");
        return;
      }
      response
        .writeHead(302, {
          Location: `/build/${state.current}${url.pathname}${url.search}`,
          "Cache-Control": "no-store",
        })
        .end();
      return;
    }
    const [, , id, ...parts] = path.split("/");
    if (!/^[a-f0-9]{9}(?:-\d+)?$/.test(id)) {
      response.writeHead(404).end();
      return;
    }
    const directory = join(output, id);
    const metadata = JSON.parse(
      await readFile(join(directory, "build-info.json"), "utf8")
    );
    if (metadata.exitCode !== 0 || metadata.changedDuringBuild) {
      response.writeHead(404).end();
      return;
    }
    const file = resolve(directory, parts.join("/") || "index.html");
    if (!file.startsWith(directory + sep)) {
      response.writeHead(403).end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-cache",
      "X-Preview-Build": id,
    });
    if (request.method === "HEAD") response.end();
    else
      createReadStream(file)
        .on("error", () => response.destroy())
        .pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done, fail) => {
  server.once("error", fail);
  server.listen(port, "localhost", done);
});
console.log(
  `[preview] http://localhost:${port}; PID ${process.pid}; SIGUSR1 pauses rebuilds, SIGUSR2 resumes`
);

for (const directory of ["apps", "libraries", "scripts"]) {
  watchers.push(
    watch(join(root, directory), { recursive: true }, (_event, filename) => {
      if (
        !filename ||
        /(^|\/)(node_modules|dist|coverage|\.git)(\/|$)/.test(
          String(filename)
        ) ||
        /\.timestamp-|\.timestamp\./.test(String(filename))
      )
        return;
      state.pending = true;
      schedule();
    })
  );
}
for (const filename of [
  "tsconfig.base.json",
  "nx.json",
  "package.json",
  "package-lock.json",
]) {
  watchers.push(
    watch(join(root, filename), () => {
      state.pending = true;
      schedule();
    })
  );
}
process.on("SIGUSR1", () => {
  state.paused = true;
  clearTimeout(timer);
  console.log(
    "[preview] rebuilds paused; wait for building=null before measuring"
  );
});
process.on("SIGUSR2", () => {
  state.paused = false;
  schedule();
  console.log("[preview] rebuilds resumed");
});
function shutdown() {
  stopping = true;
  clearTimeout(timer);
  watchers.forEach((watcher) => watcher.close());
  child?.kill("SIGTERM");
  server.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
state.pending = true;
await rebuild().catch((error) => {
  state.error = error.message;
  state.building = null;
  console.error(error);
});
