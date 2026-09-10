import { useEffect, useRef, useState } from "react";

import {
  createSunShadowDemo,
  type SunShadowDemo as SunShadowDemoHandle,
  type SunShadowDemoOptions,
  type SunShadowDemoStatus,
} from "@carma-mapping/shadow-simulation/three";

/** Thin Storybook host; lighting, sampling and accumulation live in libraries. */
export const SunShadowDemo = (options: SunShadowDemoOptions) => {
  const container = useRef<HTMLDivElement>(null);
  const demo = useRef<SunShadowDemoHandle | null>(null);
  const initialOptions = useRef(options);
  const [status, setStatus] = useState<SunShadowDemoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!container.current) return;
    try {
      demo.current = createSunShadowDemo(
        container.current,
        initialOptions.current,
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
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#f4f4f4",
      }}
    >
      <div ref={container} style={{ flex: 1, minHeight: 280 }} />
      <output
        data-test-id="sun-shadow-status"
        data-benchmark={status?.benchmark && JSON.stringify(status.benchmark)}
        data-image-difference={
          status?.imageDifference && JSON.stringify(status.imageDifference)
        }
        data-shadow-camera={
          status?.shadowCamera && JSON.stringify(status.shadowCamera)
        }
        data-banding={status?.banding && JSON.stringify(status.banding)}
        style={{
          padding: "8px 12px",
          font: "12px monospace",
          whiteSpace: "pre-wrap",
          height: 110,
          flexShrink: 0,
          overflow: "auto",
        }}
      >
        {error ??
          (status &&
            `${status.backend} · ${status.width}×${status.height} · depth ${
              status.shadowCamera?.shadowMapWidth ?? status.shadowMapSize
            }×${
              status.shadowCamera?.shadowMapHeight ?? status.shadowMapSize
            } · ${status.samples} samples · ${status.bufferFormat} · MSAA ${
              status.msaaSamples
            }\n${status.phase}`)}
        {status?.shadowCamera &&
          `\nGround texels: ${(
            (status.shadowCamera.groundTexelWidthMeters ?? 0) * 100
          ).toFixed(2)} × ${(
            (status.shadowCamera.groundTexelHeightMeters ?? 0) * 100
          ).toFixed(2)} cm${
            status.shadowCamera.groundTexelFitLimited
              ? " (budget-limited anisotropy)"
              : ""
          }`}
        {status?.benchmark &&
          `\n${
            status.benchmark[0]?.timing
          }, median of 5; warm-up excluded:\n${status.benchmark
            .map(
              (entry) =>
                `${entry.case}: ${entry.medianMilliseconds.toFixed(1)} ms`
            )
            .join("\n")}\n${
            status.cachedLighting
              ? "Cached RGB + scalar visibility versus full RGB; includes cache captures and final composition. Experimental approximation, inspect image error."
              : "Diagnostic bounds only: reduced-colour and frozen-depth cases are NOT correct shadow images."
          }`}
        {status?.imageDifference &&
          `\nvs 32F / MSAA0 (linear): RMS ${status.imageDifference.rmsAbsolute.toExponential(
            3
          )}, max ${status.imageDifference.maxAbsolute.toExponential(
            3
          )}, reference peak ${status.imageDifference.referencePeak.toFixed(
            3
          )}. Set MSAA0 to isolate precision.`}
        {status?.banding &&
          `\nBanding (visibility ×255): coherent p95 ${status.banding.coherentP95Codes.toFixed(
            3
          )}, max ${status.banding.coherentMaxCodes.toFixed(3)}; width error ${
            status.banding.widthErrorPercent?.toFixed(2) ?? "unmeasurable"
          }%. ${
            status.banding.passes ? "PASS" : "FAIL"
          } fixture gate (p95 ≤0.5, max ≤1, width ±5%).`}
      </output>
    </div>
  );
};
