import * as THREE from "three";
import { createShadowReceiverMask } from "../src/lib/core/shadow-receiver-mask";

/** Run from the existing Vite page. Synthetic metadata-only microbenchmark;
 * not an end-to-end loading, GPU, or persistent-store comparison. */
export async function benchmarkCorridorMembership() {
  const projection = new THREE.Matrix4();
  const sources = Array.from({ length: 64 }, (_, i) => ({
    bounds: new THREE.Box3(
      new THREE.Vector3((i % 8) * 20, Math.floor(i / 8) * 20, 0),
      new THREE.Vector3((i % 8) * 20 + 12, Math.floor(i / 8) * 20 + 12, 8)
    ),
    maximumCasterDistance: 1000,
    geometricError: 1,
    centerness: 1,
  }));
  const candidates = Array.from({ length: 512 }, (_, i) => ({
    key: {},
    bounds: new THREE.Box3(
      new THREE.Vector3((i % 32) * 6, Math.floor(i / 32) * 10, 30),
      new THREE.Vector3((i % 32) * 6 + 4, Math.floor(i / 32) * 10 + 4, 40)
    ),
  }));
  const mask = createShadowReceiverMask(sources, projection, 0.0047)!;
  const target = {
    receiverGeometricError: Infinity,
    receiverCenterness: 0,
    lightFacing: 0,
  };
  const scan = (cached: boolean) =>
    candidates.map((candidate) =>
      mask.match(
        candidate.bounds,
        target,
        projection,
        cached ? { key: candidate.key } : undefined
      )
    );
  const expected = scan(false);
  if (JSON.stringify(scan(true)) !== JSON.stringify(expected))
    throw new Error("Membership mismatch");
  const measure = (cached: boolean) => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) scan(cached);
    return (performance.now() - start) / 100;
  };
  measure(false);
  measure(true);
  const uncached: number[] = [],
    cached: number[] = [],
    dispatch: number[] = [];
  const url = URL.createObjectURL(
    new Blob(["onmessage = ({data}) => postMessage(data, [data.buffer]);"], {
      type: "text/javascript",
    })
  );
  const worker = new Worker(url);
  const roundTrip = () =>
    new Promise<number>((resolve, reject) => {
      const data = new Float64Array(512 * 6);
      const start = performance.now();
      const timeout = setTimeout(
        () => reject(new Error("Worker timeout")),
        10000
      );
      worker.onmessage = () => {
        clearTimeout(timeout);
        resolve(performance.now() - start);
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Worker failed"));
      };
      worker.postMessage(data, [data.buffer]);
    });
  try {
    await roundTrip();
    for (let i = 0; i < 9; i++) {
      uncached.push(measure(false));
      cached.push(measure(true));
      dispatch.push(await roundTrip());
    }
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
  const summary = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { median: sorted[4], maximum: sorted[8], runs: values };
  };
  const storageReads: number[] = [];
  const cacheName = `carma-corridor-benchmark-${crypto.randomUUID()}`;
  const cacheKey = new URL(
    "/__corridor_membership_benchmark__",
    location.origin
  ).href;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(
      cacheKey,
      new Response(new Uint8Array(expected.map(Number)))
    );
    await (await cache.match(cacheKey))!.arrayBuffer();
    for (let i = 0; i < 9; i++) {
      const start = performance.now();
      const result = new Uint8Array(
        await (await cache.match(cacheKey))!.arrayBuffer()
      );
      storageReads.push(performance.now() - start);
      if (!result.every((v, index) => v === Number(expected[index])))
        throw new Error("Storage mismatch");
    }
  } finally {
    await caches.delete(cacheName);
  }
  return {
    candidates: 512,
    receivers: 64,
    repeats: 9,
    warmupExcluded: true,
    parity: true,
    browser: navigator.userAgent,
    logicalCores: navigator.hardwareConcurrency,
    millisecondsPer512Queries: {
      uncached: summary(uncached),
      memory: summary(cached),
    },
    workerTransferOnlyMs: summary(dispatch),
    cacheStorageWarmReadMs: summary(storageReads),
    note: "Warm transfer-only lower bound: excludes worker intersection compute and cold worker startup. Cache Storage tested with final 512-byte answers; IndexedDB/OPFS not evaluated.",
  };
}
