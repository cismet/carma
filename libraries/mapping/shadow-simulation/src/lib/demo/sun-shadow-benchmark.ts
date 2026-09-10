import type { WebGLRenderer } from "three";

export type SunShadowBenchmarkCase =
  | "full"
  | "full-rgb-reference"
  | "one-percent-color"
  | "cached-shadow-map"
  | "tiled-cold"
  | "tiled-warm";
export type SunShadowBenchmarkResult = Readonly<{
  case: SunShadowBenchmarkCase;
  timing: "gpu-query" | "synchronized-readback";
  medianMilliseconds: number;
  measurements: readonly number[];
}>;

const CASES: readonly SunShadowBenchmarkCase[] = [
  "full",
  "one-percent-color",
  "cached-shadow-map",
];

// Unlike the general repaint wait, cancellation must release benchmark-owned
// GPU resources even when a hidden tab stops delivering animation frames.
export const waitForSunShadowBenchmarkFrame = (
  signal: AbortSignal,
  deadline?: number
): Promise<void> =>
  new Promise((resolve, reject) => {
    let frame: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (timeout !== undefined) clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Benchmark cancelled", "AbortError"));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    frame = requestAnimationFrame(() => {
      cleanup();
      resolve();
    });
    if (deadline !== undefined) {
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error("GPU timer timed out"));
      }, Math.max(0, deadline - performance.now()));
    }
  });

/**
 * Default cases are cost attribution only. The latter two intentionally do NOT produce a
 * correct image: they bound possible savings before implementing a classifier.
 * A 1%-colour pass still generates every full-resolution sun-direction depth map.
 * The cached-depth pass omits those maps, demonstrating their share of the cost.
 * Tiled callers register tiled-cold/tiled-warm instead: those retain the exact
 * per-direction depth data and do produce equivalent images, subject to parity checks.
 */
export const benchmarkSunShadowPasses = async (
  renderer: WebGLRenderer,
  rounds: number,
  render: (round: number, mode: SunShadowBenchmarkCase) => void,
  reset: () => void,
  signal: AbortSignal,
  onProgress: (message: string) => void,
  options: Readonly<{
    cases?: readonly SunShadowBenchmarkCase[];
    batchRounds?: 4 | 16 | 32;
  }> = {}
): Promise<readonly SunShadowBenchmarkResult[]> => {
  const context = renderer.getContext();
  if (!(context instanceof WebGL2RenderingContext))
    throw new Error("This benchmark requires a WebGL2 context");
  const gl = context;
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  const pixel = new Uint8Array(4);
  const requireContext = () => {
    if (signal.aborted)
      throw new DOMException("Benchmark cancelled", "AbortError");
    if (gl.isContextLost())
      throw new Error("WebGL context lost; timing is invalid");
  };
  const readback = () =>
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  const waitForQuery = async (query: WebGLQuery): Promise<number> => {
    const deadline = performance.now() + 15_000;
    while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      requireContext();
      if (performance.now() > deadline) throw new Error("GPU timer timed out");
      await waitForSunShadowBenchmarkFrame(signal, deadline);
    }
    if (timer && gl.getParameter(timer.GPU_DISJOINT_EXT))
      throw new Error("Disjoint GPU timer; timing is invalid");
    return Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1_000_000;
  };
  const cases = options.cases ?? CASES;
  const batchRounds = options.batchRounds ?? 4;
  const measurements = new Map(cases.map((mode) => [mode, [] as number[]]));
  // Interleave repetitions to reduce shader warm-up / thermal ordering bias.
  // Queries exclude JS scheduling; a synchronous readback is the fallback.
  // Neither is used by the interactive runtime. gl.finish() alone is not a
  // reliable cross-browser wall-clock timing barrier.
  for (let repetition = -1; repetition < 5; repetition += 1) {
    for (let order = 0; order < cases.length; order += 1) {
      const mode = cases[(order + repetition + 1) % cases.length];
      reset();
      let elapsed = 0;
      for (let start = 0; start < rounds; start += batchRounds) {
        if (signal.aborted)
          throw new DOMException("Benchmark cancelled", "AbortError");
        await waitForSunShadowBenchmarkFrame(signal);
        if (signal.aborted)
          throw new DOMException("Benchmark cancelled", "AbortError");
        requireContext();
        if (!timer) readback();
        const query = timer ? gl.createQuery() : null;
        if (timer && !query) throw new Error("Could not allocate GPU timer");
        const started = performance.now();
        try {
          if (timer && query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          try {
            for (
              let round = start;
              round < Math.min(start + batchRounds, rounds);
              round += 1
            ) {
              render(round, mode);
            }
          } finally {
            if (timer && query) gl.endQuery(timer.TIME_ELAPSED_EXT);
          }
          if (!query) readback();
          elapsed += query
            ? await waitForQuery(query)
            : performance.now() - started;
        } finally {
          if (query) gl.deleteQuery(query);
        }
        requireContext();
        if (gl.getError() !== gl.NO_ERROR)
          throw new Error("WebGL error; timing is invalid");
      }
      if (repetition >= 0) measurements.get(mode)?.push(elapsed);
      onProgress(
        `${mode}: ${repetition < 0 ? "warm-up" : `${repetition + 1}/5`}`
      );
    }
  }
  return cases.map((mode) => {
    const values = measurements.get(mode) ?? [];
    const sorted = [...values].sort((a, b) => a - b);
    return {
      case: mode,
      timing: timer ? "gpu-query" : "synchronized-readback",
      medianMilliseconds: sorted[Math.floor(sorted.length / 2)],
      measurements: values,
    };
  });
};
