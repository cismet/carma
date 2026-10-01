import { Box3, BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three";
import { resolveDerivedCacheAssetEpoch } from "@carma-commons/utils";
import type { TerrainTile } from "../../core/raster-dem-tile";
import type { TerrainTileId } from "../../core/raster-dem-tile";
import { terrainCacheTree } from "./terrain-cache-tree";
import type {
  TerrainEcefCacheInput,
  TerrainEcefCacheRequest,
  TerrainEcefCacheResponse,
  TerrainEcefGeometryRecord,
} from "./terrain-ecef-geometry-cache.worker";

export type TerrainEcefCacheOptions = Readonly<{
  sourceUrl: string;
  producerAssetUrl: string;
  conversionMode: string;
  heightOffsetIdentity?: string;
  sourceRevision?: string;
  minimumSourceLevel?: number;
}>;
const VERSION = "terrain-ecef-v0.1";
const READ_DEADLINE_MS = 50;
const WRITE_DEADLINE_MS = 5_000;
// A 512-cell tile can retain a shared prepared backing larger than its views.
// Admit that baseline size, while bounding all outstanding worker copies.
const PENDING_BYTES_LIMIT = 64 * 1024 ** 2;
const geometryVersion = (geometry: BufferGeometry) =>
  [
    geometry.id,
    (geometry.getAttribute("position") as BufferAttribute)?.id,
    (geometry.getAttribute("position") as BufferAttribute)?.version,
    (geometry.getAttribute("normal") as BufferAttribute)?.id,
    (geometry.getAttribute("normal") as BufferAttribute)?.version,
    geometry.index?.id,
    geometry.index?.version,
  ].join(":");
const inputBytes = (cacheInput: TerrainEcefCacheInput) =>
  [...new Set(cacheInput.arrays.map((array) => array.buffer))].reduce(
    (sum, buffer) => sum + buffer.byteLength,
    0
  );

/** Raw upload-ready arrays only. Native raster arrays are transient fingerprint
 * inputs; they are never stored again in the derived record.
 */
export const createTerrainEcefGeometryCache = (
  origin: readonly [number, number],
  options: TerrainEcefCacheOptions
) => {
  const producer = resolveDerivedCacheAssetEpoch({
    production: import.meta.env.PROD,
    assetUrl: options.producerAssetUrl,
  });
  let worker: Worker | null = null;
  let disabled = !producer || !options.sourceUrl || !options.conversionMode;
  let nextId = 0;
  let pendingBytes = 0;
  const identity = JSON.stringify([
    VERSION,
    producer,
    options.sourceUrl,
    options.sourceRevision ?? null,
    options.conversionMode,
    options.heightOffsetIdentity ?? "ellipsoid",
    options.minimumSourceLevel ?? 0,
    origin,
  ]);
  const identities = new Set<string>();
  const requiredNodes = new Map<string, Set<string>>();
  const jobs = new Map<
    number,
    { complete: (value: TerrainEcefCacheResponse["value"]) => void }
  >();
  const close = () => {
    disabled = true;
    worker?.terminate();
    worker = null;
    for (const job of [...jobs.values()]) job.complete(null);
    jobs.clear();
    identities.clear();
    requiredNodes.clear();
  };
  const input = (
    geometry: BufferGeometry,
    tile: TerrainTile
  ): TerrainEcefCacheInput | null => {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const index = geometry.index;
    if (
      !(position?.array instanceof Float32Array) ||
      !(normal?.array instanceof Float32Array) ||
      !(
        index?.array instanceof Uint32Array ||
        index?.array instanceof Uint16Array
      ) ||
      position.itemSize !== 3 ||
      normal.itemSize !== 3 ||
      normal.count !== position.count
    )
      return null;
    if (
      ![tile.u, tile.v, tile.heightMeters].every(
        (array) => array instanceof Float32Array
      )
    )
      return null;
    const accuracyIdentity = JSON.stringify([
      identity,
      tile.maximumMeshErrorMeters ?? null,
    ]);
    identities.add(accuracyIdentity);
    const tree = terrainCacheTree(
      accuracyIdentity,
      tile.id,
      options.minimumSourceLevel
    );
    const nodes = requiredNodes.get(accuracyIdentity) ?? new Set<string>();
    nodes.add(tree.node);
    requiredNodes.set(accuracyIdentity, nodes);
    return {
      tree,
      context: JSON.stringify([
        options.sourceUrl,
        options.conversionMode,
        options.heightOffsetIdentity ?? "ellipsoid",
        origin,
        tile.id,
        tile.bounds,
        tile.maximumMeshErrorMeters ?? null,
      ]),
      arrays: [
        position.array,
        normal.array,
        index.array,
        tile.u,
        tile.v,
        tile.heightMeters,
      ],
    };
  };
  const run = (
    cacheInput: TerrainEcefCacheInput,
    record?: TerrainEcefGeometryRecord,
    recomputeMs?: number,
    signal?: AbortSignal,
    protectedNodes?: readonly string[],
    usedNodes?: readonly string[]
  ): Promise<TerrainEcefCacheResponse["value"]> => {
    const bytes =
      inputBytes(cacheInput) +
      (record
        ? record.positions.byteLength +
          record.normals.byteLength +
          record.indices.byteLength
        : 0);
    if (
      disabled ||
      signal?.aborted ||
      jobs.size >= 4 ||
      bytes > PENDING_BYTES_LIMIT - pendingBytes
    )
      return Promise.resolve(null);
    try {
      if (!worker) {
        worker = new Worker(
          new URL("./terrain-ecef-geometry-cache.worker.ts", import.meta.url),
          { type: "module" }
        );
        worker.onmessage = ({ data }: MessageEvent<TerrainEcefCacheResponse>) =>
          jobs.get(data.id)?.complete(data.value);
        worker.onerror = close;
        worker.onmessageerror = close;
      }
      const id = nextId++;
      pendingBytes += bytes;
      return new Promise((resolve) => {
        let done = false;
        const expire = () => {
          if (done) return;
          done = true;
          signal?.removeEventListener("abort", abort);
          // The worker still owns its cloned inputs. Keep their admission
          // accounting until its reply, even though foreground already fell back.
          resolve(null);
        };
        const complete = (value: TerrainEcefCacheResponse["value"]) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          jobs.delete(id);
          pendingBytes -= bytes;
          if (!done) {
            done = true;
            resolve(value);
          }
        };
        const abort = expire;
        const timer = setTimeout(
          expire,
          record ? WRITE_DEADLINE_MS : READ_DEADLINE_MS
        );
        jobs.set(id, { complete });
        signal?.addEventListener("abort", abort, { once: true });
        const request: TerrainEcefCacheRequest = {
          id,
          input: cacheInput,
          record,
          producer: producer!,
          version: VERSION,
          recomputeMs,
          protectedNodes,
          usedNodes,
        };
        try {
          worker!.postMessage(request);
        } catch {
          complete(null);
        }
      });
    } catch {
      close();
      return Promise.resolve(null);
    }
  };
  return {
    async markUsed(ids: readonly TerrainTileId[]) {
      const nodes = ids.map((id) => terrainCacheTree(identity, id).node);
      await Promise.all(
        [...identities].map((accuracyIdentity) =>
          run(
            {
              context: accuracyIdentity,
              arrays: [],
              tree: terrainCacheTree(accuracyIdentity, {
                level: 0,
                x: 0,
                y: 0,
              }),
            },
            undefined,
            undefined,
            undefined,
            undefined,
            nodes
          )
        )
      );
    },
    async protectBaseline(ids: readonly TerrainTileId[]) {
      if (disabled) return false;
      const nodes = ids.map((id) => terrainCacheTree(identity, id).node);
      const outcomes = await Promise.all(
        [...identities].map(
          async (accuracyIdentity) =>
            (await run(
              {
                context: accuracyIdentity,
                arrays: [],
                tree: terrainCacheTree(accuracyIdentity, {
                  level: 0,
                  x: 0,
                  y: 0,
                }),
              },
              undefined,
              undefined,
              undefined,
              nodes.filter((node) =>
                requiredNodes.get(accuracyIdentity)?.has(node)
              )
            )) === true
        )
      );
      // Empty native tiles have no derived buffers to protect.
      return outcomes.every(Boolean);
    },
    async restore(
      geometry: BufferGeometry,
      tile: TerrainTile,
      signal?: AbortSignal
    ) {
      if (disabled) return null;
      const before = geometryVersion(geometry);
      const cacheInput = input(geometry, tile);
      if (!cacheInput) return null;
      const cached = await run(cacheInput, undefined, undefined, signal);
      if (
        disabled ||
        signal?.aborted ||
        before !== geometryVersion(geometry) ||
        !cached ||
        typeof cached !== "object" ||
        !(cached.positions instanceof Float32Array) ||
        !(cached.normals instanceof Float32Array) ||
        !(
          cached.indices instanceof Uint16Array ||
          cached.indices instanceof Uint32Array
        ) ||
        cached.positions.length !==
          geometry.getAttribute("position").count * 3 ||
        cached.normals.length !== cached.positions.length ||
        cached.indices.length !== geometry.index!.count ||
        !cached.positions.every(Number.isFinite) ||
        !cached.normals.every(Number.isFinite) ||
        cached.indices.some((index) => index >= cached.positions.length / 3) ||
        !Array.isArray(cached.bounds) ||
        cached.bounds.length !== 6 ||
        !cached.bounds.every(Number.isFinite) ||
        cached.bounds.some(
          (value, index) => index < 3 && value > cached.bounds[index + 3]
        ) ||
        !Array.isArray(cached.sphere) ||
        cached.sphere.length !== 4 ||
        !cached.sphere.every(Number.isFinite) ||
        cached.sphere[3] < 0
      )
        return null;
      const restored = new BufferGeometry();
      restored.setAttribute(
        "position",
        new BufferAttribute(cached.positions, 3)
      );
      restored.setAttribute("normal", new BufferAttribute(cached.normals, 3));
      restored.setIndex(
        new BufferAttribute(
          cached.indicesUnchanged ? geometry.index!.array : cached.indices,
          1
        )
      );
      restored.boundingBox = new Box3(
        new Vector3().fromArray(cached.bounds),
        new Vector3().fromArray(cached.bounds, 3)
      );
      restored.boundingSphere = new Sphere(
        new Vector3().fromArray(cached.sphere),
        cached.sphere[3]
      );
      return restored;
    },
    async offer(
      native: BufferGeometry,
      derived: BufferGeometry,
      tile: TerrainTile,
      recomputeMs: number
    ) {
      if (disabled) return false;
      const cacheInput = input(native, tile);
      const position = derived.getAttribute("position");
      const normal = derived.getAttribute("normal");
      const index = derived.index;
      const box = derived.boundingBox;
      const sphere = derived.boundingSphere;
      if (!cacheInput || !position || !normal || !index || !box || !sphere)
        return false;
      // Check before copying optional payloads; writes never detach live geometry.
      const bytes =
        inputBytes(cacheInput) +
        position.array.byteLength +
        normal.array.byteLength +
        index.array.byteLength;
      if (bytes > PENDING_BYTES_LIMIT - pendingBytes) return false;
      const record: TerrainEcefGeometryRecord = {
        positions: Float32Array.from(position.array),
        normals: Float32Array.from(normal.array),
        indices:
          index.array instanceof Uint16Array
            ? Uint16Array.from(index.array)
            : Uint32Array.from(index.array),
        bounds: [...box.min.toArray(), ...box.max.toArray()],
        sphere: [...sphere.center.toArray(), sphere.radius],
      };
      return (await run(cacheInput, record, recomputeMs)) === true;
    },
    close,
  };
};
