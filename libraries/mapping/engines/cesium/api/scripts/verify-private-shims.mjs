import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../../../..");
const rootPackageJsonPath =
  process.env.CARMA_CESIUM_VERIFY_ROOT_PACKAGE_JSON ||
  resolve(repoRoot, "package.json");
const privateShimsPath =
  process.env.CARMA_CESIUM_VERIFY_PRIVATE_SHIMS ||
  resolve(repoRoot, "libraries/mapping/engines/cesium/api/src/lib/private-shims.ts");
const installedCesiumPackageJsonPath =
  process.env.CARMA_CESIUM_VERIFY_INSTALLED_CESIUM_PACKAGE_JSON ||
  resolve(repoRoot, "node_modules/cesium/package.json");

const privateShimsSource = readFileSync(privateShimsPath, "utf8");
const verifiedVersionMatch = privateShimsSource.match(
  /VERIFIED_PRIVATE_SHIMS_CESIUM_VERSION\s*=\s*"([^"]+)"/
);

if (!verifiedVersionMatch) {
  console.error(
    "[verify-cesium-private-shims] Could not find VERIFIED_PRIVATE_SHIMS_CESIUM_VERSION in private-shims.ts."
  );
  process.exit(1);
}

const verifiedVersion = verifiedVersionMatch[1];
const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf8"));
const declaredCesiumRange =
  rootPackageJson.dependencies?.cesium ||
  rootPackageJson.devDependencies?.cesium ||
  null;

if (typeof declaredCesiumRange !== "string") {
  console.error(
    "[verify-cesium-private-shims] Root package.json does not declare a cesium dependency."
  );
  process.exit(1);
}

const allowedDeclaredRanges = new Set([
  verifiedVersion,
  `^${verifiedVersion}`,
  `~${verifiedVersion}`,
]);

if (!allowedDeclaredRanges.has(declaredCesiumRange)) {
  console.error(
    [
      "[verify-cesium-private-shims] Cesium dependency drift detected.",
      `Declared root cesium range: ${declaredCesiumRange}`,
      `Verified private-shims version: ${verifiedVersion}`,
      "Re-verify private-shims.ts against the upgraded Cesium package and then bump VERIFIED_PRIVATE_SHIMS_CESIUM_VERSION.",
    ].join("\n")
  );
  process.exit(1);
}

if (!existsSync(installedCesiumPackageJsonPath)) {
  console.error(
    [
      "[verify-cesium-private-shims] Installed node_modules/cesium/package.json is missing.",
      "Install dependencies before building cesium-api.",
    ].join("\n")
  );
  process.exit(1);
}

const installedCesiumPackageJson = JSON.parse(
  readFileSync(installedCesiumPackageJsonPath, "utf8")
);
const installedCesiumVersion = installedCesiumPackageJson.version;

if (installedCesiumVersion !== verifiedVersion) {
  console.error(
    [
      "[verify-cesium-private-shims] Installed Cesium version is not verified for private shims.",
      `Installed Cesium version: ${installedCesiumVersion}`,
      `Verified private-shims version: ${verifiedVersion}`,
      "Re-verify private-shims.ts against the installed Cesium package and then bump VERIFIED_PRIVATE_SHIMS_CESIUM_VERSION.",
    ].join("\n")
  );
  process.exit(1);
}

console.log(
  `[verify-cesium-private-shims] OK: verified Cesium version ${verifiedVersion}`
);
