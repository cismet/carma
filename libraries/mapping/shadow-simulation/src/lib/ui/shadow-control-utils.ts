import type { CSSProperties } from "react";

import type { ShadowQualityMultiplier } from "../core/shadow-types";

export const QUICK_BUTTON_CLASS_NAME =
  "flex h-9 min-w-0 items-center justify-center whitespace-nowrap rounded-md border border-neutral-300 bg-white px-1 text-center text-sm text-neutral-800 transition-colors hover:border-amber-500 hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40";

export const SEGMENT_BUTTON_CLASS_NAME =
  "h-8 whitespace-nowrap border-r border-neutral-300 px-3 text-sm text-neutral-700 transition-colors last:border-r-0 hover:text-amber-700";

export const SHADOW_QUALITY_LEVELS: ReadonlyArray<{
  label: string;
  value: ShadowQualityMultiplier;
}> = [
  { label: "Mittel", value: 4 },
  { label: "Hoch", value: 16 },
  { label: "Max", value: 64 },
];

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
