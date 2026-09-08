# Derived buffer cache: API and decisions

Date: 2026-09-07. Status: client-local format selection, producer-epoch isolation and idle maintenance implemented; native component audits recorded. No whole-app performance or automatic backend-switch claim.

## DBC-08 — Optional cache must not hold up terrain

Date: 2026-09-07. Status: implemented, focused timeout/fallback tests passed.

**Context.** The measured desktop favors binary Blob; the current product scope
does not require an automatic backend search on every device. A slow, blocked or
unavailable cache must not turn this optimization into a terrain availability
dependency. A read deadline alone is insufficient if all workers are blocked in
optional writes when foreground conversion arrives.

**Decision.** Terrain uses binary Blob initially and retains actual-cost feedback.
Insufficient measured benefit removes the record and suppresses repeated writes
of that exact key for this worker/epoch session (bounded FIFO of 256 keys).
The main terrain-cache adapter additionally gives a read 50 ms total, including
same-key pending writes, worker queueing and restoration. Exceeding this limit
returns a miss, cancels its optional cache jobs and bypasses get/set for this
module session; late payloads are not adopted. This is a timer/monotonic deadline,
not a hard real-time promise while JavaScript itself is blocked. Ordinary misses
and storage errors remain retryable and do not disable source computation.

Under foreground pressure, when every occupied slot runs optional cache I/O,
the worker pool reclaims one optional read/write/cost/calibration worker and
dispatches terrain first. It never terminates an active terrain conversion.
Native cache transactions remain atomic; losing an optional write is acceptable.
No repaint, persisted failure blacklist, retry storm or quality reduction is
introduced. Generic registrations still own their execution/deadline boundary;
the storage manager itself is not a foreground task scheduler.

**Alternatives.** Per-machine backend auto-selection, pressure-driven codec
switching and recompressing existing records: outside the explicitly narrowed
scope. Waiting up to the normal 60-second worker deadline for optional cache I/O,
or timing out a caller while leaving all its workers occupied: rejected.

**Evidence.** 41 focused geometry-cache/worker tests cover a 49-ms hit, total
50-ms timeout, same-key writes, delayed replies, storage failure/recovery and
cache-only foreground preemption. A further 50 strategy tests cover binary
routing, unavailable codecs, measured slow-key suppression and bounded audit
state; 16 quota tests protect valuable records from unknown candidates. These
are deterministic regression tests, not a new whole-app performance benchmark.
The existing v5 native-browser measurement remains the format-selection evidence.

**Revisit.** Reassess the deadline on materially slower supported devices if
beneficial reads are often bypassed. Only add another backend after equivalent
correctness and complete-path benefit measurements, not because its API appears
lower-level.

## Public registration API

Import `createDerivedBufferCache` from `@carma-commons/utils`. Create clients with the same database name/policy and their immutable `producerEpoch`, then call `register(namespace, version)`. Registrations expose `get`, `put`, `remove`, `updateCosts` and metadata-only `inspect`; they cannot override identity or request global cleanup. The default database is `carma-derived-buffer-cache`. Its budget spans namespaces, connections and producer epochs, not one budget per registration/build.

This worker fragment assumes the host supplied `producerEpoch: string | null` for the complete producer graph (terrain combines the worker entry and main-runtime chunk; DBC-06), plus owned buffers and caller-measured costs:

```ts
import { createDerivedBufferCache } from "@carma-commons/utils";

const manager = createDerivedBufferCache({
  capacityBytes: 256 * 1024 ** 2,
  producerEpoch: producerEpoch ?? undefined,
  enabled: producerEpoch !== null, // Unknown identity must not become unscoped.
});
const components = manager.register("example-component", "generator-v1");

async function persistComponent(
  key: string,
  owned: Float32Array,
  costs: { recomputeMs: number; restoreMs?: number }
) {
  return components.put(key, owned, {
    bytes: owned.buffer.byteLength,
    ...costs,
  });
}

async function sendComponent(key: string) {
  const hit = await components.get<Float32Array>(key);
  if (!hit) return;
  // This read owns its clone; transfer detaches only this worker's buffer.
  self.postMessage({ key, values: hit.value }, [hit.value.buffer as ArrayBuffer]);
}

// After actual same-boundary reuse measurements:
// await components.updateCosts(key, { recomputeMs, restoreMs });
// await components.inspect(); // Metadata only; no payload deserialization.

async function maintainAfterIdle() {
  return manager.cleanupObsoleteEpochs(); // Skip live epochs; requires Web Locks.
}

function disposeWorkerClient() {
  manager.close(); // Close IDB and release this epoch's shared lease.
}
```

The example assumes ordinary `ArrayBuffer`-backed arrays, not `SharedArrayBuffer`. IndexedDB structured cloning preserves typed arrays; it does not make storage zero-copy. Keep write values valid and stable until `put` resolves. A transferred input is no longer owned by its sender. Count unique retained backing buffers, including unused portions of a shared view, rather than summing overlapping views; `bytes` is caller accounting, not exact database overhead. Validate payloads at the consumer boundary: the generic `get<T>` type is not a runtime schema check. Unsupported/blocked storage and failed operations return miss/false/null defaults; source recomputation remains available.

The central manager also exposes `stats`, `inspect(namespace?)`, `invalidateNamespace`, `trim` and `cleanupObsoleteEpochs`. Inspection is bounded to metadata (maximum 4,096 entries), scoped to the caller's epoch and exposes logical namespace names; `stats` covers the shared budget. Physical slots include epoch, namespace and key. Version mismatch misses; replacement affects only that epoch's slot. The first operation persists the policy; conflicting clients fail closed. Normal reads increment persisted hits; `get(key, { touch: false })` leaves hits/priority unchanged so trials cannot count themselves as reuse. `trim` is producer-scoped; obsolete-epoch cleanup is a separate root-manager operation.

## DBC-01 — Admission, replacement and shared storage

**Context.** Derived components compete for disk space but differ in size and removable work. A network miss is an inappropriate recomputation baseline when the source is already locally available.

**Decision.** Require measured positive savings of at least 5% by default: `restoreMs <= 0.95 * recomputeMs`, with consistent caller-defined boundaries. Missing timing is unknown, not an estimated benefit. Unknown candidates may occupy spare capacity without policy eviction and are the first eviction candidates. Once both costs exist, `updateCosts` removes non-beneficial records. The generic policy does not collect samples or select medians itself.

Rank known entries using `priority = evictionAge + max(0, recomputeMs - restoreMs) / bytes`; refresh priority/access time on a hit and advance age on eviction. This is GreedyDual-Size-inspired, not a theoretical optimality, latency or hit-rate guarantee. A candidate cannot displace a known entry with equal/higher priority. Under capacity pressure, trim toward the configured 80% low-water target; count is capped at 4,096. Terrain currently configures one shared **256 MiB accounted-payload budget**, independent of GPU and RAM budgets.

Native IndexedDB transactions atomically update metadata, payload and shared budget across clients. On actual `QuotaExceededError`, an aborted write changes nothing. Unknown-benefit writes stop without trim or retry, even when the application budget still has space. Only a measured candidate can trigger one current-producer trim (at least 20% of current bytes and entry count), followed by one retry if anything was removed. Other errors do not evict. Scoped registrations cannot request manager-level trim.

**Alternatives.** Pure LRU and per-client budgets: rejected by design because they ignore saved work or duplicate capacity. Unknown speculative benefit: rejected. Dynamic capacity from `navigator.storage.estimate()`: deferred and **not implemented**; the application cap plus native quota feedback is the current behavior.

**Evidence.** [Policy](./derived-cache-policy.ts), [storage](./derived-cache-storage.ts), and [native core audit v3: 47 checks](../../../../../../output/derived-cache-20260907/storage-audit-v3-results.json), reproduced by [its worker](../../../../../../output/derived-cache-20260907/storage-audit.worker.ts). Checks cover typed-array preservation, scoped identities, 4% rejection, unknown admission, accounting, clone-failure rollback, stale cost feedback, concurrent trims/connections and connection restart. The separate [quota regression spec](./derived-cache-storage.spec.ts) injects synchronous and asynchronous write failures to check rollback, unknown-benefit preservation and the one-retry bound. These mocks do not fill an origin; the native audit uses separate connections within one worker, not multiple tabs or real quota exhaustion.

**Revisit.** Reassess accounting, aging and capacity with real heterogeneous workloads, origin-pressure observations and device-specific reuse samples. Add quota-pressure evidence before claiming that recovery is validated against a full browser origin.

## DBC-02 — Native, binary Blob and Meshopt formats

**Context.** Smaller serialized data can cost more CPU and latency to restore. Persistent complete records contain topology, geometry and metadata beyond a transport-only mesh.

**Decision.** Use complete binary Blob as the initial terrain write format, based on the measured target desktop; do not first write a slower native record solely to discover this format. The worker still decodes native records and supports locally profiled native/binary/Meshopt alternatives (DBC-04). Missing browser/Blob/storage support, profile-read failure or encode failure skips the cache write and preserves source computation, rather than silently trying another format. Do not enable full-record gzip or Meshopt+deflate globally. Historical `meets50Percent` flags describe an obsolete analysis; the current guard is **5%**, not 50%.

**Alternatives.** Whole-record gzip and Meshopt+fflate level-1 deflate: measured rejection at full resolution. Binary Blob: implemented candidate with a measured full-record win on this client, despite essentially unchanged byte size. Meshopt: implemented candidate, but production validation removes the earlier microbenchmark advantage on this client. Quantized geometry and lossy GPU texture formats are not equivalent-output substitutes for DEM/geometry buffers. WASM SIMD is CPU acceleration, not GPU decompression; no hardware speedup is assumed.

**Evidence.** [Production codec results, v5](../../../../../../output/derived-cache-20260907/production-codec-results.json), [harness](../../../../../../output/derived-cache-20260907/benchmark.js) and [worker](../../../../../../output/derived-cache-20260907/cache.worker.ts): Chrome 152, Apple M4 Max/Metal, 14 reported logical processors; three real PNG fixtures at 128/512 segments, three warmups and 15 trials, rotated order. Complete tile/geometry/mask metadata and arrays were bit-exact. The following full-resolution rows come from this one run; `managed-*` includes the registered manager and production codecs.

| v5 mode | Accounted bytes per record | Median restore/preparation | p95 |
| --- | ---: | ---: | ---: |
| `source`: local PNG → native geometry | 315,230–400,316 encoded source bytes | 29.9–30.6 ms | 31.6–33.9 ms |
| `managed`: native structured record | 22,415,588 | 22.2–23.3 ms | 24.0–26.5 ms |
| `managed-binary`: complete binary Blob | 22,416,792–22,416,808 | 9.8–10.0 ms | 11.8–12.5 ms |
| `managed-meshopt`: production Meshopt Blob | 7,162,458–7,789,314 | 29.5–30.2 ms | 31.8–38.9 ms |

Binary encoding plus write costs 9.9–10.4 ms per full record in v5; production Meshopt costs 48.1–51.2 ms. Read trials start after writes and exclude codec initialization; preparation records include the first encode's initialization. Wall times include worker transfers, validation, Three buffer reconstruction and WebGL2 upload plus `gl.finish`, but exclude HTTP, terrain sampler construction/use, final mixed-LOD stitching, shader draws, complete frames, final shadows and whole-app startup. These timings predate the combined-epoch/lease wiring and are not a complete current-app benchmark. At 128 segments, `managed-binary` has a 5.3 ms p95 on one fixture and fails that fixture's 5% tail guard: it is not a universal winner.

Keep earlier scopes separate: [v3 managed-native](../../../../../../output/derived-cache-20260907/managed-results.json) measured 23.8–24.3 ms full restore; [v4 Meshopt](../../../../../../output/derived-cache-20260907/meshopt-results.json) measured the benchmark-specific `meshopt` path at 17.7–18.4 ms (7.16–7.79 MB), not the production validated path. Its `meshopt-deflate` needed 49.8–52.7 ms despite 3.23–3.62 MB. The older [compression run](../../../../../../output/derived-cache-20260907/compression-results.json) measured full gzip at 41.1–44.9 ms versus its own 23.7–25.1 ms source baseline. Do not mix these runs into one speedup ratio or equate their framed payload sizes.

The separate [server-precomputation assessment](../../../../../../output/derived-cache-20260907/PRECOMPUTATION.md) records approximately eightfold TIN transfer size in the tested lossless mesh format, 25/100 Mbit/s arithmetic and the Node/browser measurement boundary. Static min/max hierarchies remain promising but have no integrated speedup evidence.

**Revisit.** Measure complete candidate formats with output parity, representative devices, write amortization and actual saved reuse cost. Do not infer a full-app gain from these component timings.

## DBC-03 — Terrain integration and remaining scope

**Context.** Moving persistent access to a worker avoids main-thread deserialization/validation, but ownership transfers, runtime reconstruction and rendering remain separate costs.

**Decision.** Integrate projected terrain components through [the cache record owner](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/projected-terrain-cache-record.ts), [runtime wrapper](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/projected-terrain-geometry-cache.ts) and [worker dispatcher](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/terrain-worker-client.ts). Identity includes the combined producer epoch (DBC-06), source, exact projection origin, NoData convention, tile and reconstruction revision. Reads deserialize/validate in the worker and transfer owned buffers; main-thread reconstruction attaches those arrays without an additional geometry copy.

When transformed persistence is enabled, live source arrays remain source-cache-owned and are structured-cloned on dispatch. Geometry/mask write snapshots are still created on the main thread, then transferred. The pending-write cap is 32 MiB and includes source buffers, but is not a bound on total app heap or an individual clone's pause. In dev/HMR or with unknown producer identity, transformed persistence fails closed before cache-only main-thread snapshots; this does not remove copies required by ordinary terrain work. Raw HTTP pixels and user settings are unaffected.

Runtime recomputation timing starts after source loading and measures projection/relief preparation, excluding network and source-cache lookup; it is narrower than the PNG baseline in DBC-02. Restore feedback includes actual worker wait/transfer and reconstruction and is persisted from the **first actual hit**, then refined by a rolling median of at most five reads. It does not wait for three hits or manufacture extra recomputations. GPU upload, final seams and shadows are outside that runtime feedback. Keep these boundaries distinct.

**Alternatives.** Legacy-store cleanup is limited to the old derived `projected_tiles` store; obsolete producer epochs are reclaimed separately (DBC-06). Other legacy contents remain untouched and outside the new budget. Automatically allocating the origin's available quota: deferred. Persistent shadow components: future consumers of this API, **not implemented by this terrain integration**. The renderer still has global RGB soft-shadow accumulation; component caching does not make the final colored image independent of camera/scene invalidation or provide fully reusable per-page soft shadows.

**Evidence.** Current integration source and DBC-02 component artifacts establish the implemented boundaries. [Tiled shadow notes](../../../../../mapping/shadow-simulation/three/TILED_SHADOW_PAGES.md) describe separate rendering limitations. No complete new reload/pan/shadow-convergence benchmark is claimed. This document change ran no tests or builds.

**Revisit.** Profile main-thread snapshots, queue latency, long-session memory and final shadow work in the running app. Extend registration to other components only with complete invalidation keys and same-boundary local-source measurements; certify conservative hierarchy bounds before using them to exclude casters.

## DBC-04 — Per-client calibration, not a universal strategy

Date: 2026-09-07. Status: implemented; local preselection, not full-app validation.

**Context.** Codec preparation must pay back through observed reuse. Browser, size class and validation costs change the winner; foreground source/restore feedback and worker-only format trials have different boundaries.

**Decision.** The pure [calibration selector](./derived-cache-calibration.ts) requires at least five finite positive timings per baseline/candidate, verified parity, at least 5% improvement in both median and nearest-rank p95, and `observedReuseCount * (baselineMedian - candidateMedian) > prepareMs`. Preparation includes caller-measured encoding, writing and startup. Unknown reuse fails closed; output retains reasons, cost savings and the first profitable whole reuse count. Rank eligible formats by median, p95, bytes, then ID.

The [terrain strategy](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/projected-terrain-cache-strategy.ts) runs after visible shadow/terrain and bounded neighbor preparation settle. A non-waiting origin-wide Web Lock permits only one idle profile job; without Web Locks, no automatic experiment runs. One warmup plus five measured reads compare `binary`/`meshopt` against `native` prepared-record storage/restore, with exact parity checked outside the timed interval. This **worker-storage-restore** scope excludes foreground queue/transfer/reconstruction, GPU and source recomputation; it only preselects a format. The separate actual source/restore guard remains authoritative.

Terrain records, profiles and temporary probes share the same combined producer epoch and central budget. Trials use existing eligible records, observed persisted hits and `touch: false`; they cannot increase their own reuse count. Unknown probes use spare capacity and are removed afterward. Profiles are additionally versioned/keyed by user agent/reported concurrency, reconstruction revision and size class, expiring after seven days or on environment mismatch. Without a valid profile, binary Blob is the measured-target default; dev/HMR or unavailable storage does not persist transformed records in another format. These keys are not a device identity or a guarantee for every tile.

An insufficient actual hit may supply one worker-owned, transient calibration seed before normal cost feedback removes the disk record. The feedback job peeks without adding a hit; it does not copy the foreground transfer. At most one pending seed spans all producer strategies, retaining at most 32 MiB of unique buffer backing; it expires after 60 seconds and is released on consumption or strategy disposal. Its measured read/decode cost joins preparation amortization. This enables comparison after rejection without privileged disk retention or invented reuse. A session-/epoch-local FIFO set suppresses further writes for at most 256 exact keys whose actual feedback missed the saving guard; it is cleared on strategy disposal and is not a device-wide format blacklist. `inspectProjectedTerrainCacheProfiles` reads the two small audit profiles with `touch: false`, reports their worker-only scope, pending-seed metadata and suppressed-key count, and never loads terrain payloads.

**Alternatives.** Hard-coded universal winner, predicted reuse, foreground calibration and independent profile budgets: rejected. The current scope targets the measured desktop hardware: binary Blob is its supported optimization, not a claim about every device. Additional source-sample collection, pressure-driven format switching, old-record recompression and automatic backend selection are deliberately out of scope. Unsupported storage is a cache miss; non-beneficial actual feedback removes the persistent entry so later requests recompute. Automatic origin-quota sizing and cross-device profile reuse are not implemented.

**Evidence.** Selector, [worker strategy spec](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/projected-terrain-cache-strategy.spec.ts) and DBC-02 artifacts. The focused mock pipeline covers native rejection against source, transient-seed calibration, exact reuse count, seed-cost amortization and a subsequent beneficial binary hit. It does not establish a new client performance result. No new whole-app reload/pan/shadow-convergence result validates the scheduling or chosen format universally.

**Revisit.** Recalibrate after version/environment/age invalidation and measured behavior changes; retain actual-hit feedback even when a local profile passed. Include contention and complete foreground costs before making application-level claims.

## DBC-05 — Native backend comparison

Date: 2026-09-07. Status: payload comparison complete; IndexedDB retained for the measured target, not a universal backend ranking.

**Context.** A fast Blob read and a metadata-bearing managed cache are not the same operation; Storage Buckets are policy/grouping over existing engines, not another engine.

**Decision.** Keep the central native IndexedDB manager. Do **not** automatically switch to OPFS or Cache Storage. [Storage results](../../../../../../output/derived-cache-20260907/storage-results.json) exercise seven available Chrome-152 variants, each with raw binary and Meshopt framing. Full raw `idb-blob-relaxed:raw` restores in 9.9–10.1 ms versus 12.1–12.2 ms for sync OPFS open/read/close, 15.0–15.2 ms for async OPFS and 23.4–24.3 ms for IDB ArrayBuffer. This payload-level comparison excludes shared-budget/metadata/locking policy. DBC-02's later v5 confirms the binary Blob advantage through the actual manager on this client; it does not validate an OPFS/Cache manager with equivalent publication and concurrency guarantees.

**Alternatives.** OPFS async/sync, retained sync handles, Cache Storage and bucket OPFS: measured payload candidates, not rejected universally and not implemented as automatic production backends. Other bucket endpoints require their own actual probe/measurements; seven available variants do not establish all bucket combinations.

**Evidence.** [Storage research, exact matrix and safety requirements](../../../../../../output/derived-cache-20260907/STORAGE_RESEARCH.md), [capability probe](../../../../../../output/derived-cache-20260907/capability-results.json), and DBC-02's v3/v4/v5 scopes. On this installed client, CompressionStream construction accepts gzip/deflate/deflate-raw, not brotli/zstd/lz4; this is not evidence about HTTP content decoding or other browsers.

**Revisit.** Benchmark any proposed backend through equivalent atomic publication, accounting, cleanup and concurrent-client behavior before switching. Keep same-client median/p95 and positive amortized benefit gates; none of these results proves faster final shadows.

## DBC-06 — Combined producer epochs and idle reclamation

Date: 2026-09-07. Status: automatic producer identity and epoch isolation; cleanup is idle-only, never blocking startup.

**Context.** A schema constant alone misses unversioned changes to projection, winding, kernels or codecs. A worker hash alone also misses main-thread preparation and snapshot wiring. Build hashes have no temporal ordering; an old tab can outlive or reopen after a new deployment.

**Decision.** The [main runtime](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/raster-dem-terrain-runtime.ts) supplies its immutable producer chunk URL; the worker [record owner](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/projected-terrain-cache-record.ts) combines it with its top-level entry URL as `JSON.stringify([mainAssetUrl, workerAssetUrl])`. The worker identity covers its complete imported graph, including inline WASM; the main identity covers preparation/snapshot wiring. An unrelated lazy codec chunk's URL is insufficient. [Asset URL validation](./derived-cache-epoch.ts) is a configured Vite-shape check, not proof that an arbitrary URL has content-addressed provenance. Dev/HMR, unversioned URLs and unknown identity disable transformed persistence, including cache-only main-thread copy costs; raw HTTP pixels/settings retain their existing behavior.

The generic manager qualifies physical namespaces by epoch while preserving logical public names and a shared budget. Late old tabs can read/write only their own epoch; they cannot reinterpret a newer build's payload or format profile. Every cooperative client acquires a shared Web Lock lease for its database/epoch; `close()` releases it and cancels a queued lease. Idle `cleanupObsoleteEpochs()` tries an exclusive `ifAvailable` lock per foreign epoch, skips live leases and atomically removes inactive payload/metadata while balancing the budget. No hash comparison, timestamp ordering or universal “latest build” marker is used. Without Web Locks, automatic cleanup does nothing; isolation still applies. Leases protect obsolete-epoch cleanup, not normal capacity eviction.

The separately scoped [legacy helper](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/projected-terrain-cache-maintenance.ts) targets only `carma-terrain-geometry-cache / projected_tiles`. Native enumeration avoids opening a missing database; upgrade races abort, and a one-second deadline closes late opens. It never deletes the database or unrelated stores/settings. True confirms transaction completion; false does not prove no commit occurred near a deadline. Historical non-cooperative tabs may repopulate that old derived store.

**Alternatives.** Worker-only identity, manual revision bumps alone, deleting active foreign epochs, monotonically ordering hashes, deleting whole databases and clearing unrelated stores: rejected. Producer graph identity remains the integration's responsibility, not a generic semantic hash parser.

**Evidence.** [Native epoch audit: 26 checks](../../../../../../output/derived-cache-20260907/storage-epoch-results.json) covers cross-epoch isolation, shared accounting, live-lease preservation, inactive cleanup, late old clients, disabled-cache side effects and same-epoch restart. [Core audit v3: 47 checks](../../../../../../output/derived-cache-20260907/storage-audit-v3-results.json) covers the manager's transaction behavior. These are native IndexedDB/Web Locks with separate connections inside one worker, not a multi-tab audit, quota-exhaustion test or validation of Vite's complete graph hashing. The legacy helper has a separate [mock spec](../../../../../mapping/engines/maplibre/src/lib/runtime/integrations/projected-terrain-cache-maintenance.spec.ts).

**Revisit.** Recheck identity coverage when producer work moves across chunks or WASM stops being inlined. Validate deployed multi-tab/idle behavior and reclaimed storage separately from buffer-upload timings; additional deletion targets need explicit scope. This documentation update runs no tests or builds.
