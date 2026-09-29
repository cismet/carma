import { describe, expect, it } from "vitest";
import {
  executeTerrainBoundaryStitch,
  stitchTerrainBoundaries,
  type TerrainBoundaryStitchOptions,
  type TerrainStitchInput,
} from "./terrain-boundary-stitch";
import {
  prepareTerrainBoundaryStitch,
  runBatchedTerrainBoundaryStitch,
  type TerrainBoundaryStitchState,
} from "./terrain-boundary-stitch-batching";
import { grid, square } from "./terrain-boundary-stitch-fixtures";
import {
  executeTerrainWorkerTask,
  terrainResultTransfers,
} from "./terrain-worker-task";

describe("incremental terrain boundary stitching", () => {
  const checkTransition = (
    inputs: TerrainStitchInput[],
    previous: TerrainBoundaryStitchState = new Map(),
    published = new Map<
      string,
      ReturnType<typeof stitchTerrainBoundaries>[number]
    >()
  ) => {
    const original = structuredClone(inputs);
    const plan = prepareTerrainBoundaryStitch(inputs, previous);
    const probe = executeTerrainBoundaryStitch(
      structuredClone(plan.probeInputs),
      {
        captureBoundaryState: true,
        prepareShellKeys: plan.prepareShellKeys,
        probeOnly: !plan.allNew,
      }
    );
    const work = plan.resolve(probe.updates, probe.shells);
    const rawUpdates = plan.allNew
      ? probe.updates
      : work.outputKeys.length
      ? stitchTerrainBoundaries(structuredClone(work.inputs), {
          outputKeys: work.outputKeys,
        })
      : [];
    const updates = rawUpdates.map(
      ({ key, positions, normals, indices, box, sphere }) => ({
        key,
        positions,
        normals,
        indices,
        box,
        sphere,
      })
    );
    const compact = stitchTerrainBoundaries(
      structuredClone([...work.state.values()].map(({ shell }) => shell)),
      { captureBoundaryState: true }
    );
    for (const result of compact)
      expect(result.boundaryState).toEqual(
        work.state.get(result.key)!.boundaryState
      );
    const next = new Map(
      [...published].filter(([key]) =>
        inputs.some((input) => input.key === key)
      )
    );
    updates.forEach((update) => next.set(update.key, update));
    for (const expected of stitchTerrainBoundaries(structuredClone(inputs))) {
      // Byte-identical typed arrays, topology, bounds and sphere, not tolerance.
      expect(next.get(expected.key)).toEqual(expected);
    }
    expect(inputs).toEqual(original);
    return { state: work.state, published: next, updates, work };
  };

  it("limits updates across additions/removals and restores immutable edge bases", () => {
    const tiles = Array.from({ length: 16 }, (_, i) =>
      grid(i % 4, Math.floor(i / 4))
    );
    let current = checkTransition(tiles);
    expect(current.updates).toHaveLength(16);
    current = checkTransition(tiles.slice(1), current.state, current.published);
    expect(current.updates.length).toBeLessThan(15);
    expect(current.updates.map((update) => update.key)).not.toContain(
      tiles[15].key
    );
    current = checkTransition(tiles, current.state, current.published);
    expect(current.updates.length).toBeLessThan(16);
    current = checkTransition(tiles, current.state, current.published);
    expect(current.updates).toEqual([]);
    // A changed iteration order can change Float32 sums at junctions.
    checkTransition([...tiles].reverse(), current.state, current.published);
  });

  it.each([2, 4])(
    "preserves exact 1:%i mixed-LOD refinements and four-way corners",
    (ratio) => {
      const coarse = [grid(0, 0), grid(0, 1)];
      const fine = Array.from({ length: ratio * 2 }, (_, i) =>
        grid(1, i / ratio, 2 + Math.log2(ratio), 1 / ratio)
      );
      let current = checkTransition([...coarse, ...fine]);
      current = checkTransition(
        [...coarse, ...fine.slice(1)],
        current.state,
        current.published
      );
      current = checkTransition(
        [...coarse, ...fine],
        current.state,
        current.published
      );
      checkTransition([coarse[0], ...fine], current.state, current.published);
    }
  );

  it("invalidates same-key replacement even when only the interior changes", () => {
    const tiles = [grid(0, 0), grid(1, 0), grid(8, 8)];
    const current = checkTransition(tiles);
    const replacement = structuredClone(tiles[0]);
    replacement.positions[(4 * 9 + 4) * 3 + 1] += 42;
    const next = checkTransition(
      [replacement, ...tiles.slice(1)],
      current.state,
      current.published
    );
    expect(next.updates.map((update) => update.key)).toEqual([replacement.key]);
    expect(next.work.inputs[2].positions.length).toBeLessThan(
      tiles[2].positions.length
    );
  });

  it("does not publish a discarded plan or retain removed tiles in the next state", () => {
    const a = grid(0, 0),
      b = grid(1, 0),
      c = grid(0, 1);
    const initial = checkTransition([a, b]);
    checkTransition([a, b, c], initial.state, initial.published); // stale result, not accepted
    const accepted = checkTransition([a, c], initial.state, initial.published);
    expect([...accepted.state.keys()]).toEqual([a.key, c.key]);
    expect(accepted.updates.map((update) => update.key)).toContain(c.key);
  });

  it("matches changing multi-level frontiers, holes and source replacement", () => {
    const roots = [grid(0, 0), grid(1, 0), grid(0, 1), grid(1, 1)];
    roots[0].indices = roots[0].indices.filter(
      (_, offset) =>
        !roots[0].indices
          .subarray(Math.floor(offset / 3) * 3, Math.floor(offset / 3) * 3 + 3)
          .includes(0)
    );
    roots[0].normals.fill(0, 0, 3);
    let frontier = roots;
    let current = checkTransition(frontier);
    for (let step = 0; step < 8; step++) {
      const candidates = frontier.filter((tile) => tile.id.level < 4);
      const tile = candidates[step % candidates.length];
      const size = 2 ** (2 - tile.id.level) / 2;
      const children = Array.from({ length: 4 }, (_, i) =>
        grid(
          tile.positions[0] + (i % 2) * size,
          tile.positions[2] + Math.floor(i / 2) * size,
          tile.id.level + 1,
          size
        )
      );
      frontier = [...frontier.filter((entry) => entry !== tile), ...children];
      if (step % 2) frontier.reverse();
      current = checkTransition(frontier, current.state, current.published);
    }
    current = checkTransition(
      frontier.slice(2),
      current.state,
      current.published
    );
    checkTransition(roots, current.state, current.published);
  });

  it("transfers pristine generated shells and probe state without aliasing scratch geometry", async () => {
    const input = grid(0, 0);
    const plan = prepareTerrainBoundaryStitch([input]);
    const result = await executeTerrainWorkerTask(
      structuredClone({
        kind: "stitch",
        inputs: plan.probeInputs,
        prepareShellKeys: plan.prepareShellKeys,
        captureBoundaryState: true,
        probeOnly: true,
      })
    );
    expect(result.kind).toBe("stitch");
    if (result.kind !== "stitch") throw new Error("Expected stitch response");
    const received = structuredClone(result, {
      transfer: terrainResultTransfers(result),
    });
    expect(result.updates[0].positions.byteLength).toBe(0);
    expect(result.shells![0].positions.byteLength).toBe(0);
    const work = plan.resolve(received.updates, received.shells);
    const full = stitchTerrainBoundaries(structuredClone(work.inputs));
    expect(full).toEqual(stitchTerrainBoundaries(structuredClone([input])));
    expect(work.state.get(input.key)!.shell.normals[1]).toBe(1);
  });
});

describe("byte-bounded terrain boundary stitching", () => {
  const inputBytes = (inputs: TerrainStitchInput[]) => {
    const buffers = new Set<ArrayBufferLike>();
    for (const input of inputs)
      for (const array of [
        input.positions,
        input.normals,
        input.indices,
        ...Object.values(input.boundaryEdges),
        ...Object.values(input.boundaryBaseHeights),
      ])
        buffers.add(array.buffer);
    return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  };
  const execute = async (
    inputs: TerrainStitchInput[],
    options: TerrainBoundaryStitchOptions
  ) => {
    const result = await executeTerrainWorkerTask(
      structuredClone({ kind: "stitch", inputs, ...options })
    );
    if (result.kind !== "stitch") throw new Error("Expected stitch response");
    return result;
  };

  it.each([2, 4])(
    "keeps exact 1:%i seams and corners across byte-bounded full-geometry batches",
    async (ratio) => {
      const inputs = [
        grid(0, 0, 2, 1, 32),
        grid(0, 1, 2, 1, 24),
        ...Array.from({ length: ratio * 2 }, (_, i) =>
          grid(1, i / ratio, 2 + Math.log2(ratio), 1 / ratio, 16 + i * 2)
        ),
      ];
      const original = structuredClone(inputs);
      const shells = executeTerrainBoundaryStitch(structuredClone(inputs), {
        prepareShellKeys: inputs.map((input) => input.key),
        prepareOnly: true,
      }).shells!;
      const contextBytes = inputBytes(shells);
      const maximumInputBytes =
        contextBytes +
        Math.max(
          ...inputs.map(
            (input, index) => inputBytes([input]) - inputBytes([shells[index]])
          )
        );
      const calls: Array<{
        bytes: number;
        options: TerrainBoundaryStitchOptions;
      }> = [];
      const run = (
        batch: TerrainStitchInput[],
        options: TerrainBoundaryStitchOptions
      ) => {
        calls.push({ bytes: inputBytes(batch), options });
        return execute(batch, options);
      };
      let result = await runBatchedTerrainBoundaryStitch(
        inputs,
        new Map(),
        run,
        { maximumInputBytes }
      );
      expect(
        calls.filter(({ options }) => options.applyBoundaryStates).length
      ).toBeGreaterThan(1);
      expect(calls.every(({ bytes }) => bytes <= maximumInputBytes)).toBe(true);
      expect(result.updates).toEqual(
        stitchTerrainBoundaries(structuredClone(inputs))
      );
      expect(inputs).toEqual(original);

      const published = new Map(
        result.updates.map((update) => [update.key, update])
      );
      calls.length = 0;
      const next = inputs.slice(1).reverse();
      result = await runBatchedTerrainBoundaryStitch(next, result.state, run, {
        maximumInputBytes,
      });
      expect(calls.some(({ options }) => options.prepareOnly)).toBe(false);
      expect(calls.every(({ bytes }) => bytes <= maximumInputBytes)).toBe(true);
      for (const update of result.updates) published.set(update.key, update);
      for (const expected of stitchTerrainBoundaries(structuredClone(next)))
        expect(published.get(expected.key)).toEqual(expected);
      expect(inputs).toEqual(original);
    }
  );

  it("counts backing buffers, keeping an individually oversized tile out of a multi-tile clone", async () => {
    const inputs = [grid(0, 0), grid(1, 0), grid(0, 1)];
    for (const input of inputs) {
      const backing = new Float32Array(32_768);
      backing.set(input.positions);
      input.positions = backing.subarray(0, input.positions.length);
    }
    const maximumInputBytes = 64 * 1024;
    const preparationSizes: number[] = [];
    const result = await runBatchedTerrainBoundaryStitch(
      inputs,
      new Map(),
      (batch, options) => {
        if (options.prepareOnly) preparationSizes.push(batch.length);
        if (inputBytes(batch) > maximumInputBytes) {
          expect(
            batch.filter(
              (input) => input.positions.buffer.byteLength > maximumInputBytes
            )
          ).toHaveLength(1);
        }
        return execute(batch, options);
      },
      { maximumInputBytes }
    );
    expect(preparationSizes).toEqual([1, 1, 1]);
    expect(result.updates).toEqual(
      stitchTerrainBoundaries(structuredClone(inputs))
    );
    expect(inputs[0].positions.buffer.byteLength).toBe(131_072);
  });

  it("runs two independent batches concurrently and publishes the same complete cut", async () => {
    const inputs = [grid(0, 0), grid(1, 0), grid(0, 1)];
    let running = 0;
    let peak = 0;
    const result = await runBatchedTerrainBoundaryStitch(
      inputs,
      new Map(),
      async (batch, options) => {
        running += 1;
        peak = Math.max(peak, running);
        await Promise.resolve();
        try {
          return await execute(batch, options);
        } finally {
          running -= 1;
        }
      },
      { maximumInputBytes: 1 }
    );
    expect(peak).toBe(2);
    expect(result.updates).toEqual(
      stitchTerrainBoundaries(structuredClone(inputs))
    );
  });

  it.each([1, 4, 8])(
    "allows %i independent batches without a two-worker gate",
    async (concurrency) => {
      const inputs = Array.from({ length: 12 }, (_, i) => grid(i, 0));
      let running = 0,
        peak = 0;
      await runBatchedTerrainBoundaryStitch(
        inputs,
        new Map(),
        async (batch, options) => {
          peak = Math.max(peak, ++running);
          await Promise.resolve();
          try {
            return await execute(batch, options);
          } finally {
            running--;
          }
        },
        { maximumInputBytes: 1, concurrency }
      );
      expect(peak).toBe(concurrency);
    }
  );

  it("applies solved boundaries only to selected transition tiles", async () => {
    const inputs = [
      grid(0, 0, 2, 1, 32),
      grid(1, 0, 3, 0.5, 16),
      grid(4, 4, 2, 1, 32),
    ];
    const targetKeys = new Set(inputs.slice(0, 2).map((input) => input.key));
    const result = await runBatchedTerrainBoundaryStitch(
      inputs,
      new Map(),
      async (batch, options) => {
        if (options.applyBoundaryStates)
          expect(batch.every((input) => targetKeys.has(input.key))).toBe(true);
        return execute(batch, options);
      },
      { maximumInputBytes: 1, targetKeys }
    );
    expect(result.updates).toEqual(
      stitchTerrainBoundaries(structuredClone(inputs)).filter((update) =>
        targetKeys.has(update.key)
      )
    );
    expect([...result.state.keys()].every((key) => targetKeys.has(key))).toBe(
      true
    );
  });

  it("rejects stale work after a batch without returning a partial publication", async () => {
    const inputs = [grid(0, 0), grid(1, 0), grid(0, 1)];
    const original = structuredClone(inputs);
    const controller = new AbortController();
    let outputBatches = 0;
    const previous: TerrainBoundaryStitchState = new Map();
    const pending = runBatchedTerrainBoundaryStitch(
      inputs,
      previous,
      async (batch, options) => {
        const result = await execute(batch, options);
        if (options.applyBoundaryStates) {
          outputBatches += 1;
          controller.abort(new DOMException("Stale terrain cut", "AbortError"));
        }
        return result;
      },
      { maximumInputBytes: 1, signal: controller.signal }
    );
    await expect(pending).rejects.toThrow("Stale terrain cut");
    expect(outputBatches).toBe(2);
    expect(previous.size).toBe(0);
    expect(inputs).toEqual(original);
  });
});
