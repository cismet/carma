import type {
  ObliqueDataset,
  ObliqueDirectionalCatalog,
} from "../../core/types";
import {
  resolveDirectionalCatalog,
  type CatalogPriority,
} from "../../core/utils/directional-catalog";
import type { ObliqueData } from "./load-oblique-series";

type Status = {
  id: string;
  isLoading: boolean;
  error: string | null;
  imageCount: number;
};
type Request = { promise: Promise<ObliqueData>; release: () => void };
type Job = {
  key: string;
  dataset: ObliqueDataset;
  group?: ObliqueDirectionalCatalog;
  state: "deferred" | "pending" | "loading" | "done" | "failed";
  promise: Promise<void>;
  resolve: () => void;
};

/** One foreground group, then one idle request at a time; urgent requests reorder the queue. */
export const createDirectionalCatalogQueue = ({
  datasets,
  priority,
  acquire,
  publish,
  merge,
}: {
  datasets: readonly ObliqueDataset[];
  priority: CatalogPriority;
  acquire: (dataset: ObliqueDataset) => Request;
  publish: (
    parts: ReadonlyMap<string, ObliqueData>,
    statuses: Status[],
    data: ObliqueData | null
  ) => void;
  merge: (parts: Iterable<ObliqueData>) => ObliqueData;
}) => {
  let cancelled = false;
  let active = false;
  let idleCancel: (() => void) | undefined;
  const urgent = new Set<Job>();
  const releases: (() => void)[] = [];
  const parts = new Map<string, ObliqueData>();
  const errors = new Map<string, string>();
  const makeJob = (
    dataset: ObliqueDataset,
    group?: ObliqueDirectionalCatalog
  ): Job => {
    let resolve = () => {};
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return {
      key: `${dataset.id}:${group?.id ?? "canonical"}`,
      dataset,
      group,
      state: group?.sector === "nadir" ? "deferred" : "pending",
      promise,
      resolve,
    };
  };
  const jobs = datasets.flatMap((dataset) =>
    dataset.directionalCatalogs?.length
      ? dataset.directionalCatalogs.map((group) => makeJob(dataset, group))
      : [makeJob(dataset)]
  );
  const queue = [...jobs];
  let partsRevision = 0;
  let publishedPartsRevision = -1;
  let currentSnapshot: ObliqueData | null = null;
  const snapshot = () => currentSnapshot;
  const notify = () => {
    if (cancelled) return;
    if (publishedPartsRevision !== partsRevision) {
      currentSnapshot = parts.size ? merge(parts.values()) : null;
      publishedPartsRevision = partsRevision;
    }
    publish(
      parts,
      datasets.map((dataset) => ({
        id: dataset.id,
        isLoading: jobs.some(
          (job) =>
            job.dataset.id === dataset.id &&
            (job.state === "pending" || job.state === "loading")
        ),
        error:
          jobs
            .filter(
              (job) => job.dataset.id === dataset.id && errors.has(job.key)
            )
            .map(
              (job) => `${job.group?.id ?? dataset.id}: ${errors.get(job.key)}`
            )
            .join("; ") || null,
        imageCount: [...parts.values()].reduce(
          (count, data) =>
            count +
            (data.datasets.has(dataset.id) ? data.imageRecords.size : 0),
          0
        ),
      })),
      currentSnapshot
    );
  };
  const schedule = () => {
    if (
      cancelled ||
      active ||
      idleCancel ||
      !queue.some((job) => job.state === "pending")
    )
      return;
    if (typeof requestIdleCallback === "function") {
      const token = requestIdleCallback(
        () => {
          idleCancel = undefined;
          start();
        },
        { timeout: 1500 }
      );
      idleCancel = () => cancelIdleCallback(token);
    } else {
      const token = setTimeout(() => {
        idleCancel = undefined;
        start();
      }, 32);
      idleCancel = () => clearTimeout(token);
    }
  };
  const start = () => {
    if (cancelled || active) return;
    const job = queue.find((candidate) => candidate.state === "pending");
    if (!job) return;
    job.state = "loading";
    active = true;
    const source = job.group
      ? {
          ...job.dataset,
          directionalCatalogs: undefined,
          directionalCatalogPriority: undefined,
          exteriorOrientationsURI: job.group.exteriorOrientationsURI,
          compressedCatalogURI: job.group.compressedCatalogURI,
          // Whole-series footprints must not delay the first independent group.
          footprintsURI: undefined,
        }
      : job.dataset;
    const request = acquire(source);
    releases.push(request.release);
    void request.promise
      .then(
        (data) => {
          if (cancelled) return;
          const resolved = data.datasets.get(job.dataset.id);
          if (resolved)
            data.datasets.set(job.dataset.id, {
              ...resolved,
              exteriorOrientationsURI: job.dataset.exteriorOrientationsURI,
              compressedCatalogURI: job.dataset.compressedCatalogURI,
              directionalCatalogs: job.dataset.directionalCatalogs,
              directionalCatalogPriority:
                job.dataset.directionalCatalogPriority,
              footprintsURI: job.dataset.footprintsURI,
            });
          parts.set(job.key, data);
          partsRevision++;
          errors.delete(job.key);
          job.state = "done";
          job.resolve();
          notify();
        },
        (error: unknown) => {
          if (cancelled) return;
          errors.set(
            job.key,
            error instanceof Error
              ? error.message
              : "Metadaten konnten nicht geladen werden."
          );
          job.state = "failed";
          job.resolve();
          notify();
        }
      )
      .finally(() => {
        request.release();
        active = false;
        if (!cancelled) {
          if ([...urgent].some((candidate) => candidate.state === "pending"))
            start();
          else schedule();
        }
      });
  };
  const reopen = (job: Job) => {
    job.promise = new Promise<void>((resolve) => {
      job.resolve = resolve;
    });
    job.state = "pending";
    errors.delete(job.key);
    notify();
  };
  const promote = async (
    next: CatalogPriority & { retry?: boolean }
  ): Promise<ObliqueData | null> => {
    if (cancelled) return null;
    const targets = datasets
      .filter(
        (dataset) =>
          !next.prioritySeriesId || dataset.id === next.prioritySeriesId
      )
      .map((dataset) => {
        const group = resolveDirectionalCatalog(dataset, next);
        return jobs.find(
          (job) => job.dataset.id === dataset.id && job.group?.id === group?.id
        );
      })
      .filter((job): job is Job => !!job);
    if (!targets.length) return null;
    for (const job of targets) {
      if (job.state === "deferred" || (job.state === "failed" && next.retry))
        reopen(job);
    }
    for (const job of [...targets]
      .filter((job) => job.state === "pending" || job.state === "loading")
      .reverse()) {
      if (job.state !== "done") urgent.add(job);
      const index = queue.indexOf(job);
      if (index >= 0) queue.splice(index, 1);
      queue.unshift(job);
    }
    if (
      targets.some((job) => job.state === "pending" || job.state === "loading")
    ) {
      idleCancel?.();
      idleCancel = undefined;
      start();
    }
    await Promise.all(targets.map((job) => job.promise));
    return cancelled || targets.some((job) => job.state === "failed")
      ? null
      : snapshot();
  };
  // Only the preferred series/group may start before the first publication.
  const initialDataset =
    datasets.find((dataset) => dataset.id === priority.prioritySeriesId) ??
    datasets[0];
  void promote({ ...priority, prioritySeriesId: initialDataset?.id });
  return {
    promote,
    async all(options?: { retry?: boolean; includeNadir?: boolean }) {
      if (cancelled) return null;
      const targets = jobs.filter(
        (job) => options?.includeNadir || job.group?.sector !== "nadir"
      );
      for (const job of targets) {
        if (
          job.state === "deferred" ||
          (job.state === "failed" && options?.retry)
        )
          reopen(job);
        if (job.state === "pending" || job.state === "loading") urgent.add(job);
      }
      idleCancel?.();
      idleCancel = undefined;
      start();
      await Promise.all(targets.map((job) => job.promise));
      return cancelled || targets.some((job) => job.state === "failed")
        ? null
        : snapshot();
    },
    cancel() {
      cancelled = true;
      idleCancel?.();
      idleCancel = undefined;
      for (const release of releases) release();
      for (const job of jobs) job.resolve();
    },
  };
};
