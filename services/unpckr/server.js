const http = require("http");
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const PORT = Number(process.env.PORT ?? 3000);
const TOKEN = process.env.UNPCKR_TOKEN;
const BASE_DIR = process.env.UNPCKR_BASE_DIR ?? "/data";

if (!TOKEN) {
  console.error("UNPCKR_TOKEN environment variable is required");
  process.exit(1);
}

const resolvedBase = path.resolve(BASE_DIR);

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function respond(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    return respond(res, 200, { status: "ok" });
  }

  if (req.method !== "POST" || req.url !== "/unpack") {
    return respond(res, 404, { error: "Not found" });
  }

  // Auth check
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${TOKEN}`) {
    return respond(res, 401, { error: "Unauthorized" });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    return respond(res, 400, { error: "Invalid JSON body" });
  }

  const { file } = body;
  if (!file || typeof file !== "string") {
    return respond(res, 400, { error: "Missing 'file' parameter" });
  }

  // Path traversal protection
  const resolved = path.resolve(resolvedBase, file);
  if (!resolved.startsWith(resolvedBase + path.sep)) {
    return respond(res, 403, { error: "Path outside base directory" });
  }

  // Only allow .tar.gz / .tgz
  if (!resolved.endsWith(".tar.gz") && !resolved.endsWith(".tgz")) {
    return respond(res, 400, { error: "Only .tar.gz / .tgz files allowed" });
  }

  if (!fs.existsSync(resolved)) {
    return respond(res, 404, { error: `File not found: ${file}` });
  }

  const targetDir = path.dirname(resolved);

  try {
    console.log(`Unpacking ${resolved} into ${targetDir}`);
    execFileSync("tar", ["xzf", resolved, "-C", targetDir], {
      timeout: 300000,
    });
    fs.unlinkSync(resolved);
    console.log(`Done. Removed ${resolved}`);
    respond(res, 200, { status: "ok", file, target: targetDir });
  } catch (err) {
    console.error(`Unpack failed: ${err.message}`);
    respond(res, 500, { error: `Unpack failed: ${err.message}` });
  }
});

server.listen(PORT, () => {
  console.log(`unpckr listening on port ${PORT}`);
  console.log(`Base directory: ${resolvedBase}`);
});
