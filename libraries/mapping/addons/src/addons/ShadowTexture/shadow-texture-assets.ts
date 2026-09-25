import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { BRUECKENENTWURF_GLB } from "@carma-commons/resources";
import { getFromWGS84ToWebMercator } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";

import { DZ_B_PRM_EPSG3857_CENTER } from "./shadow-texture-georef";
import type { ModelCollectionState } from "../ModelCollection";

export const DZ_B_PRM_GLB_PARTS = [
  { id: "environment", label: "Umgebung", filename: "environment.glb" },
  { id: "zoo", label: "Zoo", filename: "zoo.glb" },
  { id: "bridge", label: "Brücke", filename: "bridge.glb" },
  { id: "catalogBridge", label: "Brücke Katalog 2025", filename: "bridge.glb" },
  {
    id: "bridgeExisting",
    label: "Brücke Bestand",
    filename: "bridge-existing.glb",
  },
  { id: "station", label: "Bergstation", filename: "station.glb" },
] as const;

export type DzbPrmGlbPartId = (typeof DZ_B_PRM_GLB_PARTS)[number]["id"];
export type DzbPrmGlbVisibility = Record<DzbPrmGlbPartId, boolean>;
export const getDzbPrmShadowVisibility = (
  state: ModelCollectionState,
  {
    useCatalogBridgeCaster = state.bridge === "catalog",
  }: { useCatalogBridgeCaster?: boolean } = {}
): DzbPrmGlbVisibility => ({
  // The optional 3D display does not change the offscreen shadow geometry.
  environment: true,
  zoo: true,
  station: true,
  bridge: state.bridge !== "existing" && !useCatalogBridgeCaster,
  bridgeExisting: state.bridge === "existing" || useCatalogBridgeCaster,
  catalogBridge: state.bridge !== "existing" && useCatalogBridgeCaster,
});
export type DzbPrmGlbLoadProgress = {
  loaded: number;
  total: number;
  cached: number;
  activePartLabel?: string;
  activePartBytes?: number;
  activePartTotalBytes?: number;
  state: "idle" | "loading" | "ready" | "error";
};

const dracoLoader = new DRACOLoader().setDecoderPath(
  new URL(
    "assets/draco/",
    new URL(import.meta.env.BASE_URL, globalThis.location.origin)
  ).href
);
const loader = new GLTFLoader()
  .setMeshoptDecoder(MeshoptDecoder)
  .setDRACOLoader(dracoLoader);
const templateCache = new Map<string, Promise<THREE.Group>>();

const partName = (label: string) => `DZ_B_PRM ${label}`;

const getTemplate = (
  url: string,
  onTransfer?: (loaded: number, total: number) => void
) => {
  const cached = templateCache.get(url);
  if (cached) return cached;
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    if (url.endsWith(".glb.gz")) {
      // Decision: decode the exact GLB while accounting for HTTP gzip; see
      // apps/geoportal/scripts/README.dz-b-prm.md#asset-packaging-decision.
      void fetch(url)
        .then(async (response) => {
          if (!response.ok || !response.body) {
            throw new Error(`GLB HTTP ${response.status}: ${url}`);
          }
          const total = Number(response.headers.get("content-length")) || 0;
          let loaded = 0;
          const progress = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              loaded += chunk.byteLength;
              onTransfer?.(loaded, total);
              controller.enqueue(chunk);
            },
          });
          // Static servers may advertise Content-Encoding and let fetch
          // transparently decode this file before the body reaches us.
          const bytes = response.body.pipeThrough(progress);
          const decoded =
            response.headers.get("content-encoding") === "gzip"
              ? bytes
              : bytes.pipeThrough(new DecompressionStream("gzip"));
          return new Response(decoded).arrayBuffer();
        })
        .then((buffer) =>
          loader.parse(
            buffer,
            new URL(".", new URL(url, globalThis.location.href)).href,
            (gltf) => resolve(gltf.scene),
            reject
          )
        )
        .catch(reject);
      return;
    }
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      (event) => onTransfer?.(event.loaded, event.total),
      reject
    );
  }).catch((error: unknown) => {
    templateCache.delete(url);
    throw error;
  });
  templateCache.set(url, promise);
  return promise;
};

export const setDzbPrmGlbVisibility = (
  root: THREE.Group,
  visibility: DzbPrmGlbVisibility
) => {
  for (const child of root.children) {
    const id = child.userData.dzbPrmGlbPartId as DzbPrmGlbPartId | undefined;
    if (id) child.visible = visibility[id];
  }
};

// The parsed GLB templates share geometry and materials with their scene
// clones. Detach only; do not dispose shared GPU resources when toggling.
export const disposeDzbPrmGlbRoot = (root: THREE.Group) => {
  root.removeFromParent();
  root.clear();
};

export const loadDzbPrmGlbPartsIntoRoot = async ({
  root,
  assetBaseUrl,
  visibility,
  isCancelled,
  onProgress,
}: {
  root: THREE.Group;
  assetBaseUrl: string;
  visibility: DzbPrmGlbVisibility;
  isCancelled: () => boolean;
  onProgress?: (progress: DzbPrmGlbLoadProgress) => void;
}) => {
  const visibleParts = DZ_B_PRM_GLB_PARTS.filter(({ id }) => visibility[id]);
  let loaded = visibleParts.filter(({ label }) =>
    Boolean(root.getObjectByName(partName(label)))
  ).length;
  let cached = 0;
  const report = (
    state: DzbPrmGlbLoadProgress["state"],
    activePartLabel?: string,
    activePartBytes?: number,
    activePartTotalBytes?: number
  ) =>
    onProgress?.({
      loaded,
      total: visibleParts.length,
      cached,
      state,
      activePartLabel,
      activePartBytes,
      activePartTotalBytes,
    });
  report(loaded === visibleParts.length ? "ready" : "loading");

  await Promise.all(
    visibleParts.map(async (part) => {
      if (root.getObjectByName(partName(part.label))) return;
      const filename =
        /\/(5m|original)\/?$/.test(assetBaseUrl) && part.id === "environment"
          ? `${part.filename}.gz`
          : part.filename;
      const url =
        part.id === "catalogBridge"
          ? BRUECKENENTWURF_GLB.model.uri
          : `${assetBaseUrl.replace(/\/$/, "")}/${filename}`;
      const wasCached = templateCache.has(url);
      report("loading", part.label);
      return getTemplate(url, (received, total) =>
        report("loading", part.label, received, total)
      ).then((template) => {
        if (isCancelled() || root.getObjectByName(partName(part.label))) return;
        const clone = template.clone(true);
        clone.name = partName(part.label);
        clone.userData.dzbPrmGlbPartId = part.id;
        if (part.id === "catalogBridge") {
          const [easting, northing] = getFromWGS84ToWebMercator([
            BRUECKENENTWURF_GLB.position.longitude,
            BRUECKENENTWURF_GLB.position.latitude,
          ] as unknown as Parameters<typeof getFromWGS84ToWebMercator>[0]);
          clone.position.set(
            easting - DZ_B_PRM_EPSG3857_CENTER.x,
            BRUECKENENTWURF_GLB.position.altitude,
            DZ_B_PRM_EPSG3857_CENTER.y - northing
          );
          clone.rotation.y = degToRadNumeric(
            90 - BRUECKENENTWURF_GLB.orientation.heading
          );
          const projectedMetersPerLocalMeter =
            1 /
            Math.cos(degToRadNumeric(BRUECKENENTWURF_GLB.position.latitude));
          clone.scale.set(
            projectedMetersPerLocalMeter,
            1,
            projectedMetersPerLocalMeter
          );
        }
        root.add(clone);
        loaded += 1;
        if (wasCached) cached += 1;
        report("loading");
      });
    })
  );
  if (!isCancelled()) {
    setDzbPrmGlbVisibility(root, visibility);
    report("ready");
  }
  return root;
};
