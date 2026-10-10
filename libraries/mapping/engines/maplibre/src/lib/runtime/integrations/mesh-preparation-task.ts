import type { PreparedBinaryTile } from "../../core/mesh-binary-preparation";
import type {
  SurfaceNormalizationPart,
  SurfaceNormalizationResult,
} from "../../core/separated-surface-normalization";

export type {
  PreparedBinaryTile,
  PreparedBinaryTable,
} from "../../core/mesh-binary-preparation";
export type {
  SurfaceNormalizationPart,
  SurfaceNormalizationResult,
} from "../../core/separated-surface-normalization";
export type MeshPreparationTask =
  | { kind: "binary"; buffer: ArrayBuffer }
  | { kind: "surfaces"; parts: SurfaceNormalizationPart[] };
export type MeshPreparationResult =
  | { kind: "binary"; data: PreparedBinaryTile }
  | { kind: "surfaces"; data: SurfaceNormalizationResult };
export type MeshPreparationRequest = { id: number; task: MeshPreparationTask };
export type MeshPreparationReply =
  | { id: number; result: MeshPreparationResult }
  | { id: number; error: { name: string; message: string } };

const ownedBuffers = (buffers: ArrayBufferLike[]): ArrayBuffer[] => {
  if (buffers.some((buffer) => !(buffer instanceof ArrayBuffer)))
    throw new TypeError(
      "Mesh preparation requires privately owned ArrayBuffers"
    );
  return [...new Set(buffers)] as ArrayBuffer[];
};
export const meshPreparationTaskTransfers = (task: MeshPreparationTask) =>
  ownedBuffers(
    task.kind === "binary"
      ? [task.buffer]
      : task.parts.flatMap((part) => [
          part.positions.buffer,
          part.featureIds.buffer,
          part.indices.buffer,
        ])
  );
export const meshPreparationResultTransfers = (result: MeshPreparationResult) =>
  ownedBuffers(
    result.kind === "binary"
      ? [
          result.data.binary,
          result.data.featureTable?.buffer,
          result.data.batchTable?.buffer,
        ].filter((buffer): buffer is ArrayBuffer => !!buffer)
      : result.data.parts.flatMap((part) => [
          part.indices.buffer,
          part.normals.buffer,
        ])
  );

/** Dynamic imports keep the heavy kernels out of the main-thread client. */
export async function executeMeshPreparationTask(
  task: MeshPreparationTask,
  signal?: AbortSignal
): Promise<MeshPreparationResult> {
  signal?.throwIfAborted();
  if (task.kind === "binary") {
    const { prepareMeshBinary } = await import(
      "../../core/mesh-binary-preparation"
    );
    signal?.throwIfAborted();
    return { kind: "binary", data: prepareMeshBinary(task.buffer) };
  }
  const { normalizeSeparatedSurfaceParts } = await import(
    "../../core/separated-surface-normalization"
  );
  signal?.throwIfAborted();
  return { kind: "surfaces", data: normalizeSeparatedSurfaceParts(task.parts) };
}
