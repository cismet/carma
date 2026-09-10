# Worker throughput scaling

Generic, pool-independent Commons controller; Geoportal's terrain queue is its
first consumer. It replaces the queue's fixed two-worker ceiling, **not** its
module-worker protocol, priority ordering, cancellation, timeout or idle retirement.
No package dependency or root TypeScript alias was added.

## Policy

- Optimize **aggregate completed work / wall second**, never average per-worker
  speed. Callers provide consistent work units and workload classes. Terrain uses
  input sample/vertex counts, separately classified as decode/project/partition/stitch.
- Learn only with a saturated queue and warmed workers. Exclude cancelled/failed
  work, jobs carried into a newly saturated epoch, and its first settling window.
  Then use three windows of at least 250 ms and `max(6, 2 × concurrency)`
  completions per measurement. Two pool turnovers prevent slow synchronized jobs
  from aliasing into alternating one-/two-wave windows and blocking adaptation.
  Normal steady-stream window boundaries count completions, including jobs spanning
  neighbouring windows: dropping those would bias against long jobs/high concurrency.
- Compare **A → neighbouring B → A** median throughput. Reject >20% within-trial
  variation, >20% baseline drift and workload-mix L1 distance >0.2. Grow for >=5%
  aggregate gain; favour the smaller count on a <=2% throughput tie. This is a
  bounded local hill-climb, not proof of the global optimum of an arbitrary curve.
- Cruise at `max(1, floor(0.8 × learnedOptimum))`. Example: observed peak 8 → run 6;
  peak 4 → run 3. Integer rounding can reserve more than 20%; one worker is the floor.
- Probes are bounded by `max(1, min(8, hardwareConcurrency − 1))`: at least one
  reported hardware thread stays outside probes; eight bounds worker-local module,
  raster and WASM memory. `hardwareConcurrency` is a browser hint, not CPU telemetry.
  An optimum at the ceiling means **best tested within this budget**, not an uncapped
  machine optimum. Network and MapLibre worker counts are unchanged.
- After 30 seconds, sufficient queued work can recheck both neighbours. Idle ends
  an unfinished experiment, retaining only the learned optimum. No sampling timer
  runs while the pool is empty.
- While busy, a 100-ms timer watches main-thread scheduling delay. >50-ms lateness
  reduces the limit, no higher than reserved cruise capacity; hidden tabs start/run
  at one worker. Cool down for 30 seconds before a fresh throughput trial.
- Shrink by withholding new work; let active jobs finish. Constructor failure during
  growth keeps queued jobs on existing healthy workers. CPU conversion never silently
  falls back onto the browser main thread.

## Persistence and limits

Optional localStorage stores **only a validated optimum**, its workload/controller
version, reported hardware count and timestamp (seven-day expiry). Read once lazily,
write on changed learned optimum, tolerate denied/corrupt storage. No UA fingerprint,
per-tile samples or absolute timing history is stored. Hints start with headroom and
are revalidated against current load. Generator/output changes must update the
terrain adapter's workload version; geometry cache version is unrelated.

Browsers cannot reserve physical cores or account for all other applications. The
20% value is a **worker-count margin**, not guaranteed CPU idle percentage or FPS.
Short/variable terrain bursts may not establish an optimum; keeping a conservative
count is intentional. Task-size/mix changes and thermal/OS scheduling limit the
precision of observed throughput. Terrain shape, quality and sun-disc sampling
are not inputs to the controller and are not reduced.

## Evidence and prior art

- [Reproducible generic browser benchmark](../../../output/worker-scaling-20260905/README.md)
- Deterministic controller/monitor tests cover throughput plateaus, total-vs-per-worker
  gains, outside-load changes/recovery, mixed jobs, drift, headroom, hidden state,
  warm-up, idle/carry-in, storage, cancellation and queue-preserving capacity failure.
- The controlled service-load regression reproduces a learned peak of five failing
  to move down to two under sustained contention with the original fixed-six window.
  The two-turnover window passes that regression and the reverse recovery case;
  long mixed-size jobs keep bounded progress. These are service-model tests, not
  measured browser CPU/FPS results. Existing browser benchmark CSVs predate this
  v2 sampling-window fix and must not be presented as a v2 speed measurement.
  A separate v2 browser repeat is recorded alongside them: CPU2.41× / array2.26×
  over fixed2 including learning, zero checksum differences,8→6 workers and
  heartbeat P95~0.9ms. The map stayed loaded but idle; this is not a simulator trace.
- Inspired by the measured-throughput feedback principle in Microsoft's
  [ThreadPool controller](https://learn.microsoft.com/en-us/archive/msdn-magazine/2010/september/concurrency-throttling-concurrency-in-the-clr-4-0-threadpool),
  not a port of its spectral/noise estimator.
- [Browser hardware concurrency semantics](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency).
- Earlier local evaluation found workerpool, vis.gl WorkerPool, Effect and Poolifier
  useful lifecycle pools but no drop-in controller meeting this measured-throughput
  requirement. Replacing the already-tested terrain queue would add protocol/abort
  migration without supplying the requested learning policy.
