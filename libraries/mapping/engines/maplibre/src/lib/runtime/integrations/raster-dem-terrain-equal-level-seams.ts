import { Box3, BufferAttribute, Mesh, Sphere, Vector3 } from "three";

import { TerrainMemoryDeferredError } from "../../core/terrain-memory-admission";
import type { TerrainTileId } from "../../core/raster-dem-tile";
import type { TerrainStitchInput } from "./terrain-boundary-stitch";
import { terrainTileKey } from "./raster-dem-terrain-tile-source";
import { TERRAIN_WORKER_TASK_KIND } from "../../core/terrain-worker-protocol";
import { runTerrainWorkerTask } from "./terrain-worker-client";

export type TerrainSeamMeshRecord = {
  id: TerrainTileId;
  stitchBase: Pick<
    TerrainStitchInput,
    "positions" | "normals" | "indices"
  > | null;
  reliefMesh: Mesh | null;
  boundaryEdges: TerrainStitchInput["boundaryEdges"];
  boundaryBaseHeights: TerrainStitchInput["boundaryBaseHeights"];
  equalLevelShell?: TerrainStitchInput;
  equalLevelSignature?: string;
};

export const prepareEqualLevelTerrainBoundaries = async (
  meshes: ReadonlyMap<string, TerrainSeamMeshRecord>,
  keys: ReadonlySet<string>,
  current: () => boolean,
  signal: AbortSignal,
  admitRetainedBytes: (additionalBytes: number) => boolean = () => true
) => {
  const records = [...keys].flatMap((key) => {
    const record = meshes.get(key);
    return record?.stitchBase && record.reliefMesh ? [{ key, record }] : [];
  });
  const byId = new Set(records.map(({ record }) => terrainTileKey(record.id)));
  const adjacent = records.filter(({ record: { id } }) =>
    [-1, 0, 1].some((dx) =>
      [-1, 0, 1].some(
        (dy) =>
          (dx || dy) &&
          byId.has(terrainTileKey({ ...id, x: id.x + dx, y: id.y + dy }))
      )
    )
  );
  if (!adjacent.length) return;
  // Bound full-payload preparation in flight. Shells live with the evictable
  // mesh record and are reused by subsequent small boundary-only jobs.
  const preparedShells = new Map<string, TerrainStitchInput>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, adjacent.length) }, async () => {
      while (next < adjacent.length && current()) {
        const { key, record } = adjacent[next++];
        if (record.equalLevelShell) continue;
        const result = await runTerrainWorkerTask(
          {
            kind: TERRAIN_WORKER_TASK_KIND.STITCH,
            prepareEqualLevelShells: true,
            inputs: [
              {
                key,
                id: record.id,
                ...record.stitchBase!,
                boundaryEdges: record.boundaryEdges,
                boundaryBaseHeights: record.boundaryBaseHeights,
              },
            ],
          },
          signal
        );
        if (result.kind !== TERRAIN_WORKER_TASK_KIND.STITCH)
          throw new Error("Unexpected terrain shell result");
        if (result.shells?.[0]) preparedShells.set(key, result.shells[0]);
      }
    })
  );
  if (!current()) return;
  const signatures = new Map(
    adjacent.map(({ key, record }) => [
      key,
      records
        .filter(
          (other) =>
            other.record.id.level === record.id.level &&
            Math.abs(other.record.id.x - record.id.x) <= 1 &&
            Math.abs(other.record.id.y - record.id.y) <= 1
        )
        .map((other) => other.key)
        .sort()
        .join(";"),
    ])
  );
  const dirty = adjacent.filter(
    ({ key, record }) => record.equalLevelSignature !== signatures.get(key)
  );
  if (!dirty.length) return;
  // Two tile rings contain every incident face contribution at target corners.
  // Neighbour tiles are read-only context; only changed neighbourhoods publish.
  const inputs = adjacent
    .filter(({ record }) =>
      dirty.some(
        (target) =>
          target.record.id.level === record.id.level &&
          Math.abs(target.record.id.x - record.id.x) <= 2 &&
          Math.abs(target.record.id.y - record.id.y) <= 2
      )
    )
    .flatMap(({ key, record }) => {
      const shell = record.equalLevelShell ?? preparedShells.get(key);
      return shell ? [shell] : [];
    });
  const result = await runTerrainWorkerTask(
    {
      kind: TERRAIN_WORKER_TASK_KIND.STITCH,
      sameLevelOnly: true,
      inputs,
      outputKeys: dirty.map((t) => t.key),
    },
    signal
  );
  if (!current()) return;
  if (result.kind !== TERRAIN_WORKER_TASK_KIND.STITCH)
    throw new Error("Unexpected equal-level terrain result");
  // Shell ownership and copy-on-write native arrays are one publication.
  // Never mutate the old cut, or pin a partial shell batch, before it fits.
  const retainedBuffers = new Set<ArrayBufferLike>();
  const addShellBuffers = (shell: TerrainStitchInput) => {
    for (const array of [
      shell.positions,
      shell.normals,
      shell.indices,
      shell.sourceIndices,
      shell.normalTargets,
      ...Object.values(shell.boundaryEdges),
      ...Object.values(shell.boundaryBaseHeights),
    ])
      if (array) retainedBuffers.add(array.buffer);
  };
  for (const record of meshes.values()) {
    for (const array of [
      record.stitchBase?.positions,
      record.stitchBase?.normals,
      record.stitchBase?.indices,
      ...Object.values(record.boundaryEdges),
      ...Object.values(record.boundaryBaseHeights),
      (
        record.reliefMesh?.geometry.getAttribute("position") as
          | BufferAttribute
          | undefined
      )?.array,
      (
        record.reliefMesh?.geometry.getAttribute("normal") as
          | BufferAttribute
          | undefined
      )?.array,
      record.reliefMesh?.geometry.index?.array,
    ])
      if (array) retainedBuffers.add(array.buffer);
    if (record.equalLevelShell) addShellBuffers(record.equalLevelShell);
  }
  const existingBytes = [...retainedBuffers].reduce(
    (sum, buffer) => sum + buffer.byteLength,
    0
  );
  for (const shell of preparedShells.values()) addShellBuffers(shell);
  let additionalBytes =
    [...retainedBuffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) -
    existingBytes;
  for (const update of result.updates) {
    const record = meshes.get(update.key);
    const geometry = record?.reliefMesh?.geometry;
    if (!geometry) continue;
    for (const [name, borrowed] of [
      ["position", record?.stitchBase?.positions],
      ["normal", record?.stitchBase?.normals],
    ] as const) {
      const attribute = geometry.getAttribute(name) as BufferAttribute;
      if (attribute.array === borrowed)
        additionalBytes += attribute.array.byteLength;
    }
  }
  if (!admitRetainedBytes(Math.max(0, additionalBytes)))
    throw new TerrainMemoryDeferredError();
  for (const [key, shell] of preparedShells) {
    const record = meshes.get(key);
    if (record) record.equalLevelShell = shell;
  }
  for (const update of result.updates) {
    const record = meshes.get(update.key);
    const shell = record?.equalLevelShell,
      geometry = record?.reliefMesh?.geometry;
    if (!shell?.sourceIndices || !shell.normalTargets || !geometry) continue;
    const position = geometry.getAttribute("position") as BufferAttribute;
    const normal = geometry.getAttribute("normal") as BufferAttribute;
    const patch = (
      attribute: BufferAttribute,
      values: Float32Array,
      targets: Iterable<number>,
      borrowed?: Float32Array
    ) => {
      const sorted = [...new Set(targets)].sort(
        (a, b) => shell.sourceIndices![a] - shell.sourceIndices![b]
      );
      let start = -1,
        end = -1;
      for (const i of sorted) {
        const dst = shell.sourceIndices![i] * 3;
        if (
          attribute.array[dst] === values[i * 3] &&
          attribute.array[dst + 1] === values[i * 3 + 1] &&
          attribute.array[dst + 2] === values[i * 3 + 2]
        )
          continue;
        // Only real changes copy and invalidate the pristine native buffer.
        if (attribute.array === borrowed)
          attribute.array = attribute.array.slice();
        attribute.array[dst] = values[i * 3];
        attribute.array[dst + 1] = values[i * 3 + 1];
        attribute.array[dst + 2] = values[i * 3 + 2];
        if (dst !== end) {
          if (start >= 0) attribute.addUpdateRange(start, end - start);
          start = dst;
        }
        end = dst + 3;
      }
      if (start >= 0) attribute.addUpdateRange(start, end - start);
      if (start >= 0) attribute.needsUpdate = true;
      return start >= 0;
    };
    const positionsChanged = patch(
      position,
      update.positions,
      Object.values(shell.boundaryEdges).flatMap((edge) => [...edge]),
      record.stitchBase?.positions
    );
    patch(
      normal,
      update.normals,
      shell.normalTargets,
      record.stitchBase?.normals
    );
    if (positionsChanged)
      geometry.boundingBox?.union(
        new Box3(
          new Vector3().fromArray(update.box.min),
          new Vector3().fromArray(update.box.max)
        )
      );
    if (positionsChanged && geometry.boundingBox)
      geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(
        new Sphere()
      );
  }
  for (const { key, record } of dirty)
    record.equalLevelSignature = signatures.get(key);
};
