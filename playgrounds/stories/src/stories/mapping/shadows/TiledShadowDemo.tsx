import { useEffect, useRef, useState } from "react";
import {
  createTiledShadowDemo,
  type TiledShadowDemoOptions,
  type TiledShadowDemoStatus,
} from "@carma-mapping/shadow-simulation/three";

/** Thin host of the real shared-library renderer, not a demo implementation. */
export const TiledShadowDemo = (options: TiledShadowDemoOptions) => {
  const container = useRef<HTMLDivElement>(null);
  const initial = useRef(options);
  const demo = useRef<ReturnType<typeof createTiledShadowDemo> | null>(null);
  const [status, setStatus] = useState<TiledShadowDemoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!container.current) return;
    try {
      demo.current = createTiledShadowDemo(
        container.current,
        initial.current,
        setStatus
      );
    } catch (reason) {
      setError(String(reason));
    }
    return () => {
      demo.current?.dispose();
      demo.current = null;
    };
  }, []);
  useEffect(() => demo.current?.update(options), [options]);
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div ref={container} style={{ flex: 1, minHeight: 200 }} />
      <output
        data-test-id="tiled-shadow-status"
        data-status={JSON.stringify(status)}
        style={{
          padding: 8,
          font: "12px monospace",
          whiteSpace: "pre-wrap",
          background: "#f4f4f4",
          height: 128,
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        {error ??
          (status &&
            `${status.phase} · ${status.width}×${status.height} physical pixels\n` +
              `${status.stats.pages} receiver pages · ${status.completedSamples}/${options.samples} samples · ` +
              `${status.stats.limitedPages} hardware-limited pages\n` +
              `Depth renders ${status.stats.depthRenders} · cache hits ${status.stats.hits} · misses ${status.stats.misses}\n` +
              `Retained ${(status.stats.cacheBytes / 1024 ** 2).toFixed(
                1
              )} MiB + scratch reserve ${(
                status.stats.scratchBytes /
                1024 ** 2
              ).toFixed(1)} MiB\n` +
              `Page buffers: ${[...new Set(status.stats.dimensions)].join(
                ", "
              )} · LOD ${status.levels.join(", ")} (0 = maximum axis size)`)}
        {status?.benchmark
          ?.map(
            (entry) =>
              `\n${entry.case}: ${entry.medianMilliseconds.toFixed(1)} ms (${
                entry.timing
              }, median of 5)`
          )
          .join("")}
      </output>
    </div>
  );
};
