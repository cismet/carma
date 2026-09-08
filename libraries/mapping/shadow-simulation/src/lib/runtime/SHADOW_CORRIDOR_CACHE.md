# Persistent corridor visibility

ID: PERSISTENT-CORRIDOR-20260908 / 2026-09-08 / implemented storage boundary

Context and constraints: Completed hard and finite-disc shadow visibility must
survive reload independently of camera position, shader albedo and basemap. GPU
captures currently cover a screen crop, not every surface in the world corridor.

Decision: Store lossless Float32 visibility and receiver depth with capture
matrix, crop and scene-to-world basis. The caller supplies date/time, source,
geometry, corridor, resolution and sample identities. One optional worker owns
pixel validation, the shared typed-binary codec and the shared derived-buffer
cache registration. The shared 256 MiB disk policy spans producer namespaces;
individual payloads are limited to 32 MiB. Admission has no queue. Transfer inputs
must be dedicated buffers. Restore returns a candidate; it never declares scene
readiness or complete receiver coverage.

Presentation readback uses an RGBA32F packing pass (visibility in R, depth in G)
and Three's asynchronous PBO readback. The worker deinterleaves those channels.
One GPU readback runs at a time, with a 32 MiB packed-payload cap and explicit
GPU-plus-CPU transient accounting. Four optional write jobs drain the retained
captures; metadata does not retain another copy of their render targets. Native
cell capture count is limited by bytes, not by the old 64-corridor grid count.
Restored DataTextures count both their CPU backing buffers and GPU storage.

The stored capture transform is reconstructed as `captureMatrix * inverse(storedWorldBasis) * currentWorldBasis`.
A restored record counts as a complete hit only when its current identity,
expected capture matrix and crop coverage match. Otherwise it can only provide
depth-tested display continuity. A newer publication wins any race against an
older restore, and disposal/identity changes reject pending reads and writes.

Production requires immutable hashed identities of both the main GPU producer
and entry worker. Development/HMR fails closed for persistence and disposes
workers. Mutable source URLs need caller-owned source revisions or a stable
content fingerprint. Cache keys must not contain session counters. Geometry
changes or a different date/time must produce different keys. One sample and
multi-sample results have distinct identities.

Alternatives and disposition: Terrain worker pool reuse is incompatible by
inspection because its task union, priority/preemption and codec contracts are
terrain-specific. Commons worker-scaling supplies throughput measurement, not a
generic worker transport; a pool is unnecessary for one optional operation.
Synchronous main-thread serialization is rejected by the task's responsiveness
constraint. Full world-space atlas generation remains outside this storage
boundary; capture matrices and depth tests preserve current reprojection limits.

Evidence: Focused record and transport tests cover key separation, corrupt
payload rejection, transferable ownership, bounded busy calls, timeout/disposal,
stale replies and development disabling. No throughput benchmark or browser/GPU
readback measurement is claimed. Renderer readback still runs where the WebGL
context lives, including its final PBO-to-ArrayBuffer copy; only subsequent
validation, encoding/decoding and IndexedDB work move off the rendering thread.

Revisit when: A world-space atlas replaces screen crops, another consumer needs
the transport, or measurements justify different payload/I/O budgets.
