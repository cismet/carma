import {
  executeTerrainBoundaryStitch,
  stitchTerrainBoundaries,
  type TerrainBoundaryStitchOptions,
  type TerrainStitchInput,
} from "./terrain-boundary-stitch";

type TerrainStitchUpdate = ReturnType<typeof stitchTerrainBoundaries>[number];
type TerrainBoundaryStitchEntry = {
  base: TerrainStitchInput;
  shell: TerrainStitchInput;
  boundaryState: Float32Array;
};
export type TerrainBoundaryStitchState = ReadonlyMap<
  string,
  TerrainBoundaryStitchEntry
>;

const sameStitchBase = (a: TerrainStitchInput, b: TerrainStitchInput) =>
  a.id.level === b.id.level &&
  a.id.x === b.id.x &&
  a.id.y === b.id.y &&
  a.positions === b.positions &&
  a.normals === b.normals &&
  a.indices === b.indices &&
  a.boundaryEdges === b.boundaryEdges &&
  a.boundaryBaseHeights === b.boundaryBaseHeights;

const sameStitchArray = (
  a: Float32Array | Uint16Array | Uint32Array | undefined,
  b: Float32Array | Uint16Array | Uint32Array | undefined
) =>
  !!a &&
  !!b &&
  a.constructor === b.constructor &&
  a.length === b.length &&
  a.every((value, index) => Object.is(value, b[index]));

/** Prepare from immutable bases; publish `state` only after the result is accepted. */
export const prepareTerrainBoundaryStitch = (
  inputs: TerrainStitchInput[],
  previous: TerrainBoundaryStitchState = new Map()
) => {
  const prepareShellKeys: string[] = [];
  const probeInputs = inputs.map((input) => {
    const cached = previous.get(input.key);
    if (cached && sameStitchBase(cached.base, input)) return cached.shell;
    prepareShellKeys.push(input.key);
    return input;
  });
  return {
    probeInputs,
    prepareShellKeys,
    allNew: prepareShellKeys.length === inputs.length,
    resolve: (
      probes: TerrainStitchUpdate[],
      shells: TerrainStitchInput[] = []
    ) => {
      const byKey = new Map(probes.map((probe) => [probe.key, probe]));
      const shellByKey = new Map(shells.map((shell) => [shell.key, shell]));
      const state = new Map<string, TerrainBoundaryStitchEntry>();
      const outputKeys: string[] = [];
      const workInputs = inputs.map((base) => {
        const old = previous.get(base.key);
        const sameBase = old && sameStitchBase(old.base, base);
        const shell = sameBase ? old.shell : shellByKey.get(base.key);
        if (!shell) throw new Error("Missing terrain boundary shell");
        const probe = byKey.get(base.key);
        if (!probe?.boundaryState)
          throw new Error("Missing terrain boundary probe");
        const unchanged =
          sameBase && sameStitchArray(old.boundaryState, probe.boundaryState);
        state.set(base.key, {
          base,
          shell,
          boundaryState: probe.boundaryState,
        });
        if (unchanged) return shell;
        outputKeys.push(base.key);
        return base;
      });
      return { inputs: workInputs, outputKeys, state };
    },
  };
};

const stitchInputBytes = (input: TerrainStitchInput) =>
  [
    ...new Set([
      input.positions.buffer,
      input.normals.buffer,
      input.indices.buffer,
      ...Object.values(input.boundaryEdges).map((edge) => edge.buffer),
      ...Object.values(input.boundaryBaseHeights).map(
        (heights) => heights.buffer
      ),
    ]),
  ].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);

/**
 * Bound each full-geometry clone, retaining the complete old cut until all
 * results are ready. Shell context preserves global seam/corner accumulation
 * order. One indivisible tile plus that context may exceed the byte target.
 */
export const runBatchedTerrainBoundaryStitch = async (
  inputs: TerrainStitchInput[],
  previous: TerrainBoundaryStitchState,
  execute: (
    inputs: TerrainStitchInput[],
    options: TerrainBoundaryStitchOptions
  ) => Promise<ReturnType<typeof executeTerrainBoundaryStitch>>,
  {
    signal,
    maximumInputBytes = 16 * 1024 * 1024,
    concurrency = 2,
    targetKeys,
    forceOutput = false,
  }: {
    signal?: AbortSignal;
    maximumInputBytes?: number;
    concurrency?: number;
    targetKeys?: ReadonlySet<string>;
    forceOutput?: boolean;
  } = {}
) => {
  const run = async (
    batch: TerrainStitchInput[],
    options: TerrainBoundaryStitchOptions
  ) => {
    signal?.throwIfAborted();
    const result = await execute(batch, options);
    signal?.throwIfAborted();
    return result;
  };
  const batches = <T>(
    items: T[],
    bytes: (item: T) => number,
    contextBytes = 0
  ) => {
    const result: T[][] = [];
    let batch: T[] = [];
    let total = contextBytes;
    for (const item of items) {
      const size = bytes(item);
      if (batch.length && total + size > maximumInputBytes) {
        result.push(batch);
        batch = [];
        total = contextBytes;
      }
      batch.push(item);
      total += size;
    }
    if (batch.length) result.push(batch);
    return result;
  };
  const plan = prepareTerrainBoundaryStitch(inputs, previous);
  // Preserve the one-pass cold-start path for small cuts; no need to send each
  // full geometry twice when the complete immutable input already fits.
  if (
    !targetKeys &&
    !forceOutput &&
    inputs.reduce((sum, input) => sum + stitchInputBytes(input), 0) <=
      maximumInputBytes
  ) {
    const probe = await run(plan.probeInputs, {
      captureBoundaryState: true,
      prepareShellKeys: plan.prepareShellKeys,
      probeOnly: !plan.allNew,
    });
    const work = plan.resolve(probe.updates, probe.shells);
    const result = plan.allNew
      ? probe
      : work.outputKeys.length
      ? await run(work.inputs, { outputKeys: work.outputKeys })
      : { updates: [] };
    return { updates: result.updates, state: work.state };
  }

  // Keep enough independent work queued for the adaptive worker pool to probe
  // throughput. Divide the clone budget across its maximum useful width.
  concurrency = Math.max(1, Math.min(8, Math.floor(concurrency) || 1));
  maximumInputBytes = Math.max(1, Math.floor(maximumInputBytes / concurrency));
  const parallelBatches = async <T, R>(
    items: T[],
    executeBatch: (item: T) => Promise<R>
  ) => {
    const results: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (next < items.length) {
          signal?.throwIfAborted();
          const index = next++;
          results[index] = await executeBatch(items[index]);
        }
      })
    );
    return results;
  };
  const newKeys = new Set(plan.prepareShellKeys);
  const shells = new Map<string, TerrainStitchInput>();
  const preparedBatches = await parallelBatches(
    batches(
      inputs.filter((input) => newKeys.has(input.key)),
      stitchInputBytes
    ),
    (batch) =>
      run(batch, {
        prepareShellKeys: batch.map((input) => input.key),
        prepareOnly: true,
      })
  );
  for (const prepared of preparedBatches) {
    for (const shell of prepared.shells ?? []) shells.set(shell.key, shell);
  }
  const context = plan.probeInputs.map(
    (input) => shells.get(input.key) ?? input
  );
  const probe = await run(context, { captureBoundaryState: true });
  const work = plan.resolve(probe.updates, [...shells.values()]);
  const outputKeys = new Set(
    forceOutput ? inputs.map((input) => input.key) : work.outputKeys
  );
  const updates: TerrainStitchUpdate[] = [];
  const outputs = (forceOutput ? inputs : work.inputs).filter(
    (input) =>
      outputKeys.has(input.key) && (!targetKeys || targetKeys.has(input.key))
  );
  // Solve shared boundary relationships once, then apply independently per tile.
  // No full-cut context is cloned or recalculated for each output batch.
  const states = new Map(
    probe.updates.map((update) => [update.key, update.boundaryState!])
  );
  const outputBatches = await parallelBatches(
    batches(outputs, stitchInputBytes),
    (batch) =>
      run(batch, {
        applyBoundaryStates: Object.fromEntries(
          batch.map((input) => [input.key, states.get(input.key)!])
        ),
      })
  );
  for (const result of outputBatches) updates.push(...result.updates);
  const state = targetKeys
    ? new Map([...work.state].filter(([key]) => targetKeys.has(key)))
    : work.state;
  return { updates, state };
};
