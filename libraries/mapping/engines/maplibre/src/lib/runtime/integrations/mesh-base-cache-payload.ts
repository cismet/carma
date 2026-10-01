import type { Tile } from "3d-tiles-renderer/core";
import type { Object3D } from "three";
import {
  restoreMeshBaseRenderRecord,
  type MeshBaseRenderRecord,
} from "../../core/mesh-base-render-record";
import { closeMeshBaseRecord } from "./mesh-base-cache-request";
import type { RuntimeTilesRenderer } from "./three-tiles-runtime-types";

export type MeshBaseNativeRenderer = RuntimeTilesRenderer & {
  parseTile: (
    buffer: ArrayBuffer,
    tile: Tile,
    extension: string,
    url: string,
    signal: AbortSignal
  ) => Promise<void>;
};
const marker = 0x3172626d; // Private parseToMesh payload, never persisted.
export const meshBasePayloadId = (buffer: ArrayBuffer): number | null =>
  buffer.byteLength === 8 && new DataView(buffer).getUint32(0, true) === marker
    ? new DataView(buffer).getUint32(4, true)
    : null;
export const createMeshBasePayload = (id: number) => {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, marker, true);
  view.setUint32(4, id, true);
  return buffer;
};

/** Native parsing still owns processTileModel hooks, publication and disposal.
 * A rejected cache record falls back once to the original source. */
export const parseMeshBasePayload = (
  tiles: MeshBaseNativeRenderer,
  input: {
    buffer: ArrayBuffer;
    tile: Tile;
    extension: string;
    url: string;
    signal: AbortSignal;
  },
  fetchSource: (url: string, options: RequestInit) => Promise<Response>,
  onInvalid: () => void
): Promise<void> | null => {
  const { buffer, tile, extension, url, signal } = input;
  if (meshBasePayloadId(buffer) === null) return null;
  return tiles
    .parseTile(buffer, tile, extension, url, signal)
    .catch(async () => {
      onInvalid();
      signal.throwIfAborted();
      const response = await fetchSource(url, {
        ...tiles.fetchOptions,
        signal,
      });
      if (!response.ok) throw new Error(`Tile response ${response.status}`);
      return tiles.parseTile(
        await response.arrayBuffer(),
        tile,
        extension,
        url,
        signal
      );
    });
};

export const restoreMeshBasePayload = (record: MeshBaseRenderRecord) => {
  const start = performance.now();
  let scene: Object3D & { featureTable?: object; batchTable?: object };
  try {
    scene = restoreMeshBaseRenderRecord(record);
  } catch (error) {
    closeMeshBaseRecord(record);
    throw error;
  }
  return {
    model: {
      scene,
      featureTable: scene.featureTable,
      batchTable: scene.batchTable,
    },
    restoreMs: performance.now() - start,
  };
};
