import {
  createDerivedBufferCache,
  resolveDerivedCacheAssetEpoch,
} from "@carma-commons/utils";
import type { ObliqueDataset } from "../../core/types";
import { loadObliqueSeriesData, type ObliqueData } from "./load-oblique-series";
import {
  OBLIQUE_CATALOG_CACHE_VERSION,
  OBLIQUE_CATALOG_FRESHNESS_MS,
} from "./oblique-series-cache-version";

const CAPACITY_BYTES = 192 * 1024 ** 2;
const STORAGE_DEADLINE_MS = 1000;
const HEADER_DEADLINE_MS = 6000;
type SourceValidator = {
  url: string;
  etag: string | null;
  modified: string | null;
  length: string | null;
};
type CachedCatalog = {
  data: ObliqueData;
  fetchedAt: number;
  sources: SourceValidator[];
};
const readValidator = (url: string, response?: Response): SourceValidator => ({
  url,
  etag: response?.ok ? response.headers.get("ETag") : null,
  modified: response?.ok ? response.headers.get("Last-Modified") : null,
  length: response?.ok ? response.headers.get("Content-Length") : null,
});
const catalogKey = (dataset: ObliqueDataset) => {
  // Compression selects a transport, not a different parsed document or cache epoch.
  const {
    compressedCatalogURI: _compressedTransport,
    directionalCatalogs: _directionalTransport,
    directionalCatalogPriority: _directionalPriority,
    ...definition
  } = dataset;
  return JSON.stringify({ ...definition, animations: {} }, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left.localeCompare(right)
          )
        )
      : value
  );
};
const isCatalog = (
  value: CachedCatalog | undefined,
  primaryUrls: string[],
  footprintUrl?: string
): value is CachedCatalog => {
  const allowed = new Set([
    ...primaryUrls,
    ...(footprintUrl ? [footprintUrl] : []),
  ]);
  const expectedCount =
    footprintUrl && !primaryUrls.includes(footprintUrl) ? 2 : 1;
  return (
    !!value &&
    value.data?.imageRecords instanceof Map &&
    value.data?.centers instanceof Map &&
    value.data?.datasets instanceof Map &&
    Number.isFinite(value.fetchedAt) &&
    Array.isArray(value.sources) &&
    value.sources.length === expectedCount &&
    value.sources.some((source) => primaryUrls.includes(source?.url)) &&
    (!footprintUrl ||
      value.sources.some((source) => source?.url === footprintUrl)) &&
    value.sources.every((source) => allowed.has(source?.url))
  );
};

const revalidate = async (
  catalog: CachedCatalog,
  signal?: AbortSignal
): Promise<boolean> => {
  const age = Date.now() - catalog.fetchedAt;
  const withinTtl = age >= 0 && age < OBLIQUE_CATALOG_FRESHNESS_MS;
  const matches = await Promise.all(
    catalog.sources.map(async (source) => {
      if (!source.etag && !source.modified) return withinTtl;
      const controller = new AbortController();
      const onAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      const timer = setTimeout(() => controller.abort(), HEADER_DEADLINE_MS);
      try {
        const response = await fetch(source.url, {
          method: "HEAD",
          cache: "no-cache",
          signal: controller.signal,
        });
        // Servers without HEAD support may reuse only the bounded fresh GET.
        if (response.status === 405 || response.status === 501)
          return withinTtl;
        if (!response.ok) return false;
        const current = readValidator(source.url, response);
        return source.etag
          ? current.etag === source.etag
          : current.modified === source.modified &&
              current.length === source.length;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    })
  );
  signal?.throwIfAborted();
  return matches.every(Boolean);
};

/** Restore structured-cloned Maps in the metadata worker; parsing remains the SSOT. */
export const loadCachedObliqueSeriesData = async (
  dataset: ObliqueDataset,
  signal?: AbortSignal
): Promise<ObliqueData> => {
  signal?.throwIfAborted();
  const manager = createDerivedBufferCache({
    databaseName: "carma-oblique-catalog-cache-192m",
    capacityBytes: CAPACITY_BYTES,
    maxEntries: 6,
    producerEpoch:
      resolveDerivedCacheAssetEpoch({
        assetUrl: typeof self !== "undefined" ? self.location.href : "",
        production: import.meta.env.PROD,
      }) ?? OBLIQUE_CATALOG_CACHE_VERSION,
  });
  const records = manager.register(
    "parsed-oblique-catalog",
    OBLIQUE_CATALOG_CACHE_VERSION
  );
  let storageAvailable = true;
  const optionalStorage = async <T>(
    work: () => Promise<T>,
    fallback: T
  ): Promise<T> => {
    if (!storageAvailable) return fallback;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort = () => {};
    try {
      return await Promise.race([
        work(),
        new Promise<T>((resolve) => {
          onAbort = () => {
            storageAvailable = false;
            manager.close();
            resolve(fallback);
          };
          signal?.addEventListener("abort", onAbort, { once: true });
          if (signal?.aborted) onAbort();
          timer = setTimeout(onAbort, STORAGE_DEADLINE_MS);
        }),
      ]);
    } catch {
      storageAvailable = false;
      manager.close();
      return fallback;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
  try {
    const key = catalogKey(dataset);
    const primaryUrls = [
      dataset.exteriorOrientationsURI,
      dataset.compressedCatalogURI,
    ].filter((url): url is string => !!url);
    const successfulPrimary = new Set<string>();
    const urls = [
      ...new Set(
        [...primaryUrls, dataset.footprintsURI].filter(
          (url): url is string => !!url
        )
      ),
    ];
    const cached = await optionalStorage(
      () => records.get<CachedCatalog>(key),
      null
    );
    signal?.throwIfAborted();
    if (
      isCatalog(cached?.value, primaryUrls, dataset.footprintsURI) &&
      cached.value.data.datasets.has(dataset.id) &&
      (await revalidate(cached.value, signal))
    )
      return cached.value.data;
    const observed = new Map(urls.map((url) => [url, readValidator(url)]));
    const fetchSource: typeof fetch = async (input, init) => {
      const response = await fetch(input, { ...init, cache: "no-cache" });
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;
      if (observed.has(url)) observed.set(url, readValidator(url, response));
      if (response.ok && primaryUrls.includes(url)) successfulPrimary.add(url);
      return response;
    };
    const data = await loadObliqueSeriesData(dataset, signal, fetchSource);
    signal?.throwIfAborted();
    // Conservative caller-accounted clone size; the shared manager enforces both bounds.
    const bytes =
      data.imageRecords.size * 2048 +
      data.centers.size * 256 +
      key.length * 2 +
      4096;
    if (bytes <= CAPACITY_BYTES) {
      const stored: CachedCatalog = {
        data: {
          ...data,
          datasets: new Map(
            [...data.datasets].map(([id, value]) => [
              id,
              { ...value, animations: {} },
            ])
          ),
        },
        fetchedAt: Date.now(),
        sources: [
          ...new Set([
            successfulPrimary.has(dataset.exteriorOrientationsURI)
              ? dataset.exteriorOrientationsURI
              : dataset.compressedCatalogURI ?? dataset.exteriorOrientationsURI,
            ...(dataset.footprintsURI ? [dataset.footprintsURI] : []),
          ]),
        ].map((url) => observed.get(url) ?? readValidator(url)),
      };
      await optionalStorage(() => records.put(key, stored, { bytes }), false);
    }
    signal?.throwIfAborted();
    return data;
  } finally {
    manager.close();
  }
};
