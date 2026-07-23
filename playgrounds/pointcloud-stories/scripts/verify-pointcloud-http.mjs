#!/usr/bin/env node

const BASE_URL =
  process.env.POINTCLOUD_PUBLIC_BASE_URL ??
  "https://wupp-3d-data.cismet.de/mesh2024/pointclouds";
const ORIGIN = process.env.POINTCLOUD_VERIFY_ORIGIN ?? "http://localhost:4200";
const MANIFEST_FILE =
  "pointcloud-mesh2024-ao-v1-4ff94626bf67.manifest.json";
const ASSETS = [
  {
    file: "kaiser-wilhelm-hain-rgb-mesh2024-ao-v1-084aca0cfdcf.copc.laz",
    bytes: 64_315_546,
  },
  {
    file: "awg-2-segmentierung-mesh2024-ao-v1-c7b7ccc83cb8.copc.laz",
    bytes: 96_364_489,
  },
  {
    file: "wuppertal-oelberg-mls-2025-09-11-mesh2024-ao-v1-8a2e89b90856.copc.laz",
    bytes: 11_465_093_116,
  },
  {
    file: "nordbahntrasse-2025-12-segments-mesh2024-ao-v1-48badd4f8e68.copc.laz",
    bytes: 625_866_998,
  },
];

const results = [];
for (const asset of ASSETS) {
  const url = `${BASE_URL.replace(/\/$/, "")}/${asset.file}`;
  const response = await fetch(url, {
    headers: { Origin: ORIGIN, Range: "bytes=0-1023" },
  });
  const body = new Uint8Array(await response.arrayBuffer());
  const contentRange = response.headers.get("content-range");
  const acceptRanges = response.headers.get("accept-ranges");
  const allowOrigin = response.headers.get("access-control-allow-origin");
  const cacheControl = response.headers.get("cache-control") ?? "";
  const contentType = response.headers.get("content-type") ?? "";
  const expectedContentRange = `bytes 0-1023/${asset.bytes}`;
  const signature = new TextDecoder("ascii").decode(body.subarray(0, 4));

  if (response.status !== 206) {
    throw new Error(`${asset.file}: expected HTTP 206, got ${response.status}`);
  }
  if (body.byteLength !== 1024 || signature !== "LASF") {
    throw new Error(`${asset.file}: invalid LAS range payload`);
  }
  if (contentRange !== expectedContentRange) {
    throw new Error(
      `${asset.file}: expected ${expectedContentRange}, got ${contentRange}`
    );
  }
  if (allowOrigin !== ORIGIN && allowOrigin !== "*") {
    throw new Error(`${asset.file}: CORS does not allow ${ORIGIN}`);
  }
  if (!cacheControl.includes("immutable")) {
    throw new Error(`${asset.file}: immutable cache policy missing`);
  }
  results.push({
    file: asset.file,
    status: response.status,
    contentRange,
    acceptRanges,
    allowOrigin,
    cacheControl,
    contentType,
  });
}

const manifestResponse = await fetch(
  `${BASE_URL.replace(/\/$/, "")}/${MANIFEST_FILE}`,
  { headers: { Origin: ORIGIN } }
);
const manifest = await manifestResponse.json();
const manifestAllowOrigin = manifestResponse.headers.get(
  "access-control-allow-origin"
);
if (manifestResponse.status !== 200) {
  throw new Error(
    `${MANIFEST_FILE}: expected HTTP 200, got ${manifestResponse.status}`
  );
}
if (manifestAllowOrigin !== ORIGIN && manifestAllowOrigin !== "*") {
  throw new Error(`${MANIFEST_FILE}: CORS does not allow ${ORIGIN}`);
}
if (
  manifest.schema !== "carma.pointcloud-publication" ||
  manifest.assets?.length !== ASSETS.length ||
  !ASSETS.every((asset) =>
    manifest.assets.some(
      (entry) =>
        entry.publicationFile === asset.file && entry.bytes === asset.bytes
    )
  )
) {
  throw new Error(`${MANIFEST_FILE}: publication entries do not match assets`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      assets: results,
      manifest: {
        file: MANIFEST_FILE,
        status: manifestResponse.status,
        allowOrigin: manifestAllowOrigin,
        assetCount: manifest.assets.length,
      },
    },
    null,
    2
  )}\n`
);
