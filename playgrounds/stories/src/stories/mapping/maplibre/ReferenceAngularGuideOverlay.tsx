import { useMemo } from "react";

import { projectEllipsoidHorizon } from "@carma-geo/proj";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";

export const ReferenceAngularGuideOverlay = ({
  fieldOfViewDegrees,
  spacingDegrees,
  pitchDegrees,
  bearingDegrees,
  aspect,
  longitude,
  latitude,
  height,
  reference = "local-horizontal",
}: {
  fieldOfViewDegrees: number;
  spacingDegrees: number;
  pitchDegrees: number;
  bearingDegrees: number;
  aspect: number;
  longitude: number;
  latitude: number;
  height: number | null;
  reference?: "local-horizontal" | "ellipsoid";
}) => {
  const halfFov = degToRadNumeric(Math.max(0.1, fieldOfViewDegrees) / 2);
  const elevation = pitchDegrees - 90;
  const spacing = Math.max(0.1, spacingDegrees);
  const project = (angle: number) =>
    50 -
    (50 * Math.tan(degToRadNumeric(angle - elevation))) / Math.tan(halfFov);
  const first = Math.ceil((elevation - fieldOfViewDegrees / 2) / spacing);
  const last = Math.floor((elevation + fieldOfViewDegrees / 2) / spacing);
  const limb = useMemo(
    () =>
      height === null
        ? null
        : projectEllipsoidHorizon({
            longitude: degToRadNumeric(longitude),
            latitude: degToRadNumeric(latitude),
            height,
            bearing: degToRadNumeric(bearingDegrees),
            pitch: degToRadNumeric(pitchDegrees),
            verticalFov: halfFov * 2,
            aspect,
          }),
    [longitude, latitude, height, bearingDegrees, pitchDegrees, halfFov, aspect]
  );
  const label =
    reference === "ellipsoid"
      ? "WGS84 ellipsoid horizon"
      : "0° local horizontal";
  const top = project(
    reference === "ellipsoid" && limb
      ? -radToDegNumeric(limb.centerDepression)
      : 0
  );
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 12,
        overflow: "hidden",
        pointerEvents: "none",
        color: "white",
        mixBlendMode: "difference",
      }}
    >
      {Array.from(
        { length: Math.max(0, last - first + 1) },
        (_, i) => (first + i) * spacing
      ).map((angle) => (
        <div
          key={angle}
          style={{
            position: "absolute",
            top: `${project(angle)}%`,
            left: 0,
            right: 0,
            borderTop: `1px solid rgba(255,255,255,${
              Math.abs(angle - Math.round(angle)) < 0.001 ? 0.5 : 0.33
            })`,
          }}
        />
      ))}
      {reference === "ellipsoid" && limb && (
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, overflow: "hidden" }}
        >
          {limb.segments.map((segment, i) => (
            <polyline
              key={i}
              points={segment.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
              fill="none"
              stroke="white"
              strokeOpacity={0.5}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}
      <span
        style={{
          position: "absolute",
          right: 8,
          top: `${Math.max(2, Math.min(96, top))}%`,
          font: "11px ui-monospace, monospace",
        }}
      >
        {reference === "ellipsoid" && !limb
          ? "Ellipsoid horizon: awaiting eye elevation"
          : label}
        {top < 0 ? " ↑" : top > 100 ? " ↓" : ""}
      </span>
    </div>
  );
};
