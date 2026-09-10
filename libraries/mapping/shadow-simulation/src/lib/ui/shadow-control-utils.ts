import type { CSSProperties } from "react";

import {
  SHADOW_BUFFER_FORMAT,
  SHADOW_QUALITY,
  type ShadowQualityMultiplier,
  type MeshErrorTargetPixels,
} from "../core/shadow-types";

export const QUICK_BUTTON_CLASS_NAME =
  "flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-md border border-neutral-300 bg-white px-1 text-center text-sm text-neutral-800 transition-colors hover:border-amber-500 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40";

export const SEGMENT_BUTTON_CLASS_NAME =
  "h-8 whitespace-nowrap border-r border-neutral-300 px-3 text-sm text-neutral-700 transition-colors last:border-r-0 hover:text-amber-700";

export const SHADOW_QUALITY_LEVELS: ReadonlyArray<{
  label: string;
  value: ShadowQualityMultiplier;
}> = [
  { label: "120 FPS", value: SHADOW_QUALITY.FPS_120 },
  { label: "60 FPS", value: SHADOW_QUALITY.FPS_60 },
  { label: "30 FPS", value: SHADOW_QUALITY.FPS_30 },
  { label: "Ultra", value: SHADOW_QUALITY.ULTRA },
];

export const MESH_ERROR_TARGETS: ReadonlyArray<{
  label: string;
  value: MeshErrorTargetPixels;
}> = [
  { label: "0,25 px", value: 0.25 },
  { label: "0,5 px", value: 0.5 },
  { label: "1 px", value: 1 },
  { label: "2 px", value: 2 },
  { label: "4 px", value: 4 },
];

export const SHADOW_BUFFER_FORMAT_OPTIONS = [
  { value: SHADOW_BUFFER_FORMAT.HDR_16, label: "HDR · 16 Bit (Experiment)" },
  {
    value: SHADOW_BUFFER_FORMAT.HDR_16_32,
    label: "HDR · 16/32 Bit (Standard)",
  },
  { value: SHADOW_BUFFER_FORMAT.HDR_32, label: "HDR · 32 Bit (ohne MSAA)" },
  { value: SHADOW_BUFFER_FORMAT.SDR_8, label: "SDR · 8 Bit (Experiment)" },
] as const;

export const formatHour = (hour: number): string =>
  `${String(hour).padStart(2, "0")}:00`;

export const getRangeProgressStyle = (
  value: number,
  minimum: number,
  maximum: number
): CSSProperties =>
  ({
    "--shadow-range-progress": `${
      maximum > minimum
        ? Math.max(
            0,
            Math.min(100, ((value - minimum) / (maximum - minimum)) * 100)
          )
        : 0
    }%`,
  } as CSSProperties);
