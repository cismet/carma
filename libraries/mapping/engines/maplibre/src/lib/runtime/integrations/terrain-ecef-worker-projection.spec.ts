import { Box3, BufferGeometry } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createTerrainEcefSeamReprojection,
  type projectTerrainEcefInWorker,
} from "./terrain-ecef-worker-projection";

type Projection = Awaited<ReturnType<typeof projectTerrainEcefInWorker>>;
const projected = (): Projection => ({
  geometry: new BufferGeometry(),
  nativeBaseHeights: new Float32Array(),
  ecefBounds: new Box3(),
  recomputeMs: 1,
});

describe("ECEF seam worker handover", () => {
  it("keeps the old publication and coalesces intermediate generations", async () => {
    let version = "first",
      publishedVersion = "base";
    const jobs: ((projection: Projection) => void)[] = [];
    const publish = vi.fn((_projection, version) => {
      publishedVersion = version;
    });
    const onError = vi.fn();
    const queue = createTerrainEcefSeamReprojection({
      version: () => version,
      publishedVersion: () => publishedVersion,
      project: () =>
        new Promise((resolve) => {
          jobs.push(resolve);
        }),
      publish,
      onError,
    });
    queue.sync();
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    version = "second";
    queue.sync();
    version = "latest";
    queue.sync();
    expect(jobs).toHaveLength(1);
    const obsolete = projected();
    const dispose = vi.fn();
    obsolete.geometry.addEventListener("dispose", dispose);
    jobs[0](obsolete);
    await vi.waitFor(() => expect(jobs).toHaveLength(2));
    expect(dispose).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    expect(publishedVersion).toBe("base");
    const latest = projected();
    jobs[1](latest);
    await queue.settled();
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(latest, "latest");
    expect(onError).not.toHaveBeenCalled();
    queue.dispose();
    latest.geometry.dispose();
  });

  it("aborts removed-tile work and disposes a late result without publishing", async () => {
    let finish!: (projection: Projection) => void;
    let signal!: AbortSignal;
    const publish = vi.fn();
    const queue = createTerrainEcefSeamReprojection({
      version: () => "changed",
      publishedVersion: () => "base",
      project: (inputSignal) => {
        signal = inputSignal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      publish,
      onError: vi.fn(),
    });
    queue.sync();
    await vi.waitFor(() => expect(signal).toBeDefined());
    queue.dispose();
    expect(signal.aborted).toBe(true);
    const late = projected();
    const dispose = vi.fn();
    late.geometry.addEventListener("dispose", dispose);
    finish(late);
    await queue.settled();
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(publish).not.toHaveBeenCalled();
  });
  it("admits only one tile before copying its seam payload", async () => {
    const jobs: ((projection: Projection) => void)[] = [];
    const create = () =>
      createTerrainEcefSeamReprojection({
        version: () => "changed",
        publishedVersion: () => "base",
        project: () =>
          new Promise((resolve) => {
            jobs.push(resolve);
          }),
        publish: (result) => result.geometry.dispose(),
        onError: vi.fn(),
      });
    const first = create(),
      second = create();
    first.sync();
    second.sync();
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    jobs[0](projected());
    await vi.waitFor(() => expect(jobs).toHaveLength(2));
    jobs[1](projected());
    await Promise.all([first.settled(), second.settled()]);
    first.dispose();
    second.dispose();
  });
});
