import { Box3, Vector3, Vector4 } from "three";
import {
  bestImageAreaCell,
  certifyBestImageAreaOwner,
} from "../../core/best-image-area-proof";
import {
  scoreAxisBoundarySite,
  type AxisBoundarySite,
} from "./shared-three-axis-boundaries";
import {
  createAxisCellCache,
  type AxisCellCache,
  type AxisCellQueryResult,
} from "./shared-three-axis-cell-cache";

export type BestImageAreaMatch = Readonly<{
  id: string;
  index: number;
  site: AxisBoundarySite;
  /** Canonical cosine similarity: higher wins. */
  score: number;
  /** Full-sensor bottom-left UV. */
  imagePoint: Readonly<{ x: number; y: number }>;
}>;
export type BestImageAreaQueryOptions = Readonly<{
  activeId?: string | null;
  signal?: AbortSignal;
  /** Per-consumer eligibility; omitted means every admitted source. */
  eligibleIds?: ReadonlySet<string>;
}>;
type QuerySnapshot = Omit<BestImageAreaQueryOptions, "eligibleIds"> &
  Readonly<{
    eligibilityKey: number;
    eligibilityMask?: Uint32Array;
  }>;
export type BestImageAreaCandidates = AxisCellQueryResult &
  Readonly<{
    geometryRevision: number;
    axisRevision: number;
  }>;
export type BestImageAreaCacheOptions = Readonly<{
  /** Borrowed, exclusively configured for this field; disposal retains it. */
  cellCache?: AxisCellCache;
  maxProofCells?: number;
  maxPointResults?: number;
}>;

const limit = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : fallback;
const pointKey = (point: Vector3, options: QuerySnapshot) =>
  JSON.stringify([
    point.x,
    point.y,
    point.z,
    options.activeId ?? null,
    options.eligibilityKey,
  ]);
const cellKey = (box: Box3, options: QuerySnapshot) =>
  JSON.stringify([...box.min.toArray(), options.eligibilityKey]);
const finitePoint = (point: Vector3) =>
  [point.x, point.y, point.z].every(Number.isFinite);
const validSite = (site: AxisBoundarySite) =>
  finitePoint(site.eye) &&
  finitePoint(site.direction) &&
  site.sceneToImage.elements.every(Number.isFinite) &&
  site.direction.lengthSq() > 0 &&
  Number.isFinite(site.direction.lengthSq());
const store = <T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maximum: number
) => {
  if (!maximum) return;
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maximum) cache.delete(cache.keys().next().value!);
};
const read = <T>(cache: Map<string, T>, key: string): T | undefined => {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
};

/** One shared admission index, plus bounded exact-result/certified-owner caches.
 * Sites and points are in a caller-fixed metric frame: no map, DEM or receiver
 * lifecycle is used to build the field. Borrow all readField data read-only. */
export const createBestImageAreaCache = (
  options: BestImageAreaCacheOptions = {}
) => {
  const cellCache = options.cellCache ?? createAxisCellCache();
  const maxProofs = limit(options.maxProofCells, 2048);
  const maxPoints = limit(options.maxPointResults, 512);
  const proofs = new Map<string, number | null>();
  const points = new Map<string, BestImageAreaMatch | null>();
  const pending = new Set<AbortController>();
  // Intern compact source-index masks; never repeat whole ID lists in every
  // point/cell key. Different set iteration orders have the same identity.
  const eligibility = new Map<string, { key: number; mask: Uint32Array }>();
  let nextEligibilityKey = 1;
  let sourceIndices = new Map<string, number>();
  let sites: readonly AxisBoundarySite[] = [];
  let activePersistenceKey: string | undefined;
  let geometryRevision = 0,
    axisRevision = 0,
    disposed = false;
  let exactEvaluations = 0,
    proofHits = 0,
    pointHits = 0;
  const epoch = () => `${geometryRevision}:${axisRevision}`;
  const current = (revision: string, signal?: AbortSignal) =>
    !disposed && !signal?.aborted && epoch() === revision;
  const snapshotOptions = (
    options: BestImageAreaQueryOptions
  ): QuerySnapshot => {
    const common = { activeId: options.activeId, signal: options.signal };
    if (!options.eligibleIds) return { ...common, eligibilityKey: 0 };
    const indices = [...options.eligibleIds]
      .flatMap((id) => {
        const index = sourceIndices.get(id);
        return index === undefined ? [] : [index];
      })
      .sort((a, b) => a - b);
    const key = indices.join(",");
    let snapshot = read(eligibility, key);
    if (!snapshot) {
      const mask = new Uint32Array(Math.ceil(sites.length / 32));
      for (const index of indices) mask[index >>> 5] |= 1 << (index & 31);
      snapshot = { key: nextEligibilityKey++, mask };
      store(eligibility, key, snapshot, 16);
    }
    return {
      ...common,
      eligibilityKey: snapshot.key,
      eligibilityMask: snapshot.mask,
    };
  };
  const makeMatch = (
    index: number,
    point: Vector3,
    score: number
  ): BestImageAreaMatch => {
    const site = sites[index];
    const projected = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
      site.sceneToImage
    );
    return Object.freeze({
      id: site.id,
      index,
      site,
      score,
      imagePoint: Object.freeze({
        x: projected.x / projected.w,
        y: projected.y / projected.w,
      }),
    });
  };
  const query = async (
    bounds: Box3 | null,
    signal?: AbortSignal
  ): Promise<BestImageAreaCandidates | null> => {
    const revision = epoch();
    if (!current(revision, signal)) return null;
    const controller = new AbortController();
    const abort = () => controller.abort();
    pending.add(controller);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const result = await cellCache.queryBounds(
        bounds?.clone() ?? null,
        controller.signal
      );
      if (!result || !current(revision, signal)) return null;
      return {
        ...result,
        sites: Array.from(result.indices, (index) => sites[index]),
        geometryRevision,
        axisRevision,
      };
    } finally {
      pending.delete(controller);
      signal?.removeEventListener("abort", abort);
    }
  };
  const ordered = (
    a: BestImageAreaMatch,
    b: BestImageAreaMatch,
    activeId?: string | null
  ) => {
    if (a.score !== b.score) return b.score - a.score;
    if (activeId && (a.id === activeId) !== (b.id === activeId))
      return a.id === activeId ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  const filter = (
    admitted: BestImageAreaCandidates,
    options: QuerySnapshot
  ): BestImageAreaCandidates =>
    options.eligibilityMask
      ? {
          ...admitted,
          indices: admitted.indices.filter(
            (index) =>
              (options.eligibilityMask![index >>> 5] & (1 << (index & 31))) !==
              0
          ),
        }
      : admitted;
  const score = async (
    point: Vector3,
    indices: Uint32Array,
    revision: string,
    queryOptions: BestImageAreaQueryOptions,
    all: boolean
  ) => {
    const ranks: BestImageAreaMatch[] = [];
    let started = performance.now();
    for (let at = 0; at < indices.length; at++) {
      if (at % 128 === 0) {
        if (!current(revision, queryOptions.signal)) return undefined;
        if (performance.now() - started >= 4) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          started = performance.now();
          if (!current(revision, queryOptions.signal)) return undefined;
        }
      }
      const index = indices[at],
        site = sites[index];
      if (!site) continue;
      const value = scoreAxisBoundarySite(site, point);
      exactEvaluations++;
      if (value === null) continue;
      const match = makeMatch(index, point, value);
      if (all) ranks.push(match);
      else if (
        !ranks.length ||
        ordered(match, ranks[0], queryOptions.activeId) < 0
      )
        ranks[0] = match;
    }
    if (!current(revision, queryOptions.signal)) return undefined;
    if (all) ranks.sort((a, b) => ordered(a, b, queryOptions.activeId));
    return ranks;
  };
  const resolveAdmitted = async (
    point: Vector3,
    box: Box3 | null,
    admitted: BestImageAreaCandidates,
    revision: string,
    queryOptions: QuerySnapshot
  ) => {
    if (!current(revision, queryOptions.signal)) return undefined;
    if (!finitePoint(point)) return null;
    const key = pointKey(point, queryOptions),
      cached = read(points, key);
    if (cached !== undefined) {
      pointHits++;
      return cached;
    }
    const proofKey = box && cellKey(box, queryOptions);
    let owner = proofKey === null ? undefined : read(proofs, proofKey);
    if (typeof owner === "number") proofHits++;
    else if (owner === undefined && box && proofKey !== null) {
      const proof = certifyBestImageAreaOwner(sites, admitted.indices, box);
      let started = performance.now();
      let step = proof.next();
      while (!step.done) {
        if (performance.now() - started >= 4) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          started = performance.now();
          if (!current(revision, queryOptions.signal)) return undefined;
        }
        step = proof.next();
      }
      owner = step.value ?? null;
      store(proofs, proofKey, owner, maxProofs);
    }
    let result: BestImageAreaMatch | null;
    if (typeof owner === "number") {
      const value = scoreAxisBoundarySite(sites[owner], point);
      exactEvaluations++;
      // A conservative certificate still never bypasses exact sensor checks.
      if (value !== null) result = makeMatch(owner, point, value);
      else {
        if (proofKey !== null) proofs.delete(proofKey);
        const ranks = await score(
          point,
          admitted.indices,
          revision,
          queryOptions,
          false
        );
        if (!ranks) return undefined;
        result = ranks[0] ?? null;
      }
    } else {
      const ranks = await score(
        point,
        admitted.indices,
        revision,
        queryOptions,
        false
      );
      if (!ranks) return undefined;
      result = ranks[0] ?? null;
    }
    if (!current(revision, queryOptions.signal)) return undefined;
    store(points, key, result, maxPoints);
    return result;
  };

  return {
    updateSites(
      input: readonly AxisBoundarySite[],
      persistenceKey?: string
    ): boolean {
      if (disposed) return false;
      const next = [...input]
        .filter(validSite)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (
        next.some((site, index) => index > 0 && site.id === next[index - 1].id)
      )
        throw new Error("Best-image area sites require unique stable IDs");
      const geometryChanged =
        next.length !== sites.length ||
        next.some(
          (site, index) =>
            site.id !== sites[index].id ||
            !site.eye.equals(sites[index].eye) ||
            !site.sceneToImage.equals(sites[index].sceneToImage)
        );
      const changed =
        geometryChanged ||
        next.some(
          (site, index) => !site.direction.equals(sites[index].direction)
        );
      if (!changed && persistenceKey === activePersistenceKey) return false;
      activePersistenceKey = persistenceKey;
      sites = Object.freeze(
        next.map((site) =>
          Object.freeze({
            id: site.id,
            eye: site.eye.clone(),
            direction: site.direction.clone(),
            sceneToImage: site.sceneToImage.clone(),
          })
        )
      );
      if (geometryChanged) {
        geometryRevision++;
        sourceIndices = new Map(sites.map((site, index) => [site.id, index]));
        eligibility.clear();
      }
      axisRevision++;
      proofs.clear();
      points.clear();
      for (const controller of pending) controller.abort();
      cellCache.setSites(sites, persistenceKey);
      return true;
    },
    query,
    async resolve(
      point: Vector3,
      options: BestImageAreaQueryOptions = {}
    ): Promise<BestImageAreaMatch | null | undefined> {
      const queryOptions = snapshotOptions(options);
      const revision = epoch();
      if (!current(revision, queryOptions.signal)) return undefined;
      const value = point.clone();
      if (!finitePoint(value)) return null;
      const cached = read(points, pointKey(value, queryOptions));
      if (cached !== undefined) {
        pointHits++;
        return cached;
      }
      const box = bestImageAreaCell(value);
      const owner = box && read(proofs, cellKey(box, queryOptions));
      if (typeof owner === "number") {
        const valueScore = scoreAxisBoundarySite(sites[owner], value);
        exactEvaluations++;
        if (valueScore !== null) {
          proofHits++;
          const result = makeMatch(owner, value, valueScore);
          store(points, pointKey(value, queryOptions), result, maxPoints);
          return result;
        }
        proofs.delete(cellKey(box!, queryOptions));
      }
      const admitted = await query(box, queryOptions.signal);
      if (!admitted || !current(revision, queryOptions.signal))
        return undefined;
      return resolveAdmitted(
        value,
        box,
        filter(admitted, queryOptions),
        revision,
        queryOptions
      );
    },
    async rank(
      point: Vector3,
      options: BestImageAreaQueryOptions = {}
    ): Promise<readonly BestImageAreaMatch[] | undefined> {
      const queryOptions = snapshotOptions(options);
      const revision = epoch();
      if (!current(revision, queryOptions.signal)) return undefined;
      const value = point.clone();
      if (!finitePoint(value)) return [];
      const admitted = await query(
        bestImageAreaCell(value),
        queryOptions.signal
      );
      if (!admitted || !current(revision, queryOptions.signal))
        return undefined;
      return score(
        value,
        filter(admitted, queryOptions).indices,
        revision,
        queryOptions,
        true
      );
    },
    async resolveSamples(
      input: readonly Vector3[],
      options: BestImageAreaQueryOptions = {}
    ): Promise<readonly (BestImageAreaMatch | null)[] | undefined> {
      const queryOptions = snapshotOptions(options);
      const revision = epoch();
      if (!current(revision, queryOptions.signal)) return undefined;
      const values = input.map((point) => point.clone());
      const boxes = values.map(bestImageAreaCell);
      const bounds = new Box3();
      boxes.forEach((box) => {
        if (box) bounds.union(box);
      });
      const unbounded = values.some(
        (point, index) => finitePoint(point) && !boxes[index]
      );
      const admitted = await query(
        unbounded ? null : bounds,
        queryOptions.signal
      );
      if (!admitted || !current(revision, queryOptions.signal))
        return undefined;
      const eligible = filter(admitted, queryOptions);
      const result: (BestImageAreaMatch | null)[] = [];
      let started = performance.now();
      for (let index = 0; index < values.length; index++) {
        if (performance.now() - started >= 4) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          started = performance.now();
        }
        const match = await resolveAdmitted(
          values[index],
          boxes[index],
          eligible,
          revision,
          queryOptions
        );
        if (match === undefined) return undefined;
        result.push(match);
      }
      return result;
    },
    readField() {
      return {
        sites,
        geometryRevision,
        axisRevision,
        cellCache,
        statistics: {
          proofCells: [...proofs.values()].filter((owner) => owner !== null)
            .length,
          boundaryCells: [...proofs.values()].filter((owner) => owner === null)
            .length,
          cachedCells: proofs.size,
          pointResults: points.size,
          eligibilitySets: eligibility.size,
          exactEvaluations,
          proofHits,
          pointHits,
        },
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of pending) controller.abort();
      proofs.clear();
      points.clear();
      eligibility.clear();
      sourceIndices.clear();
      sites = [];
      if (!options.cellCache) cellCache.dispose();
    },
  };
};

export type BestImageAreaCache = ReturnType<typeof createBestImageAreaCache>;
