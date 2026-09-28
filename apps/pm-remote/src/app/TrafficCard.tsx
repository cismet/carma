import { useEffect, useState } from "react";

import {
  TRAFFIC_MAX_OFFSET_MINUTES,
  formatTrafficTime,
  trafficDarkness,
  trafficJumpOffset,
  type SceneTraffic,
  type TrafficControl,
  type TrafficJump,
} from "@carma-mapping/show-remote";

/** the label follows the clock; a minute is fine enough for it */
const TICK_MS = 30_000;
/** the slider moves in these steps */
const STEP_MINUTES = 5;

const JUMPS: readonly { kind: TrafficJump; label: string }[] = [
  { kind: "day", label: "Tag" },
  { kind: "night", label: "Nacht" },
  { kind: "live", label: "Live" },
];

/**
 * The traffic of the live scene: a slider over the last 24 hours whose right
 * end is live, and jumps to today's (or yesterday's) lunchtime, last night,
 * and back to live. Whatever is set keeps running with the clock on the
 * display, so the label here follows the clock too. "Neu starten" throws the
 * display's vehicles away and fills the roads anew at the same moment.
 */
export const TrafficCard = ({
  traffic,
  control,
  disabled,
  onOffset,
  onRestart,
}: {
  traffic: SceneTraffic;
  control: TrafficControl;
  disabled: boolean;
  onOffset: (minutes: number) => void;
  onRestart: () => void;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(handle);
  }, []);

  const { offsetMinutes } = control;
  const shown = now - offsetMinutes * 60_000;
  const isNight = trafficDarkness(shown) > 0.5;
  const sliderId = "pm-remote-traffic";
  // a jump is lit while the display still shows the hour it went to
  const activeJump = JUMPS.find(
    ({ kind }) =>
      Math.abs(trafficJumpOffset(kind, new Date(now)) - offsetMinutes) <=
      (kind === "live" ? 0 : 1)
  )?.kind;

  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <label
          htmlFor={sliderId}
          className="truncate text-xs uppercase tracking-[0.2em] text-neutral-400"
        >
          {traffic.title}
        </label>
        <span className="shrink-0 text-sm tabular-nums text-neutral-300">
          {offsetMinutes === 0 ? "Live" : formatTrafficTime(shown)}
          {isNight ? " · Nacht" : ""}
        </span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={TRAFFIC_MAX_OFFSET_MINUTES}
        step={STEP_MINUTES}
        // right is now, left is 24 hours ago
        value={TRAFFIC_MAX_OFFSET_MINUTES - offsetMinutes}
        disabled={disabled}
        onChange={(event) =>
          onOffset(TRAFFIC_MAX_OFFSET_MINUTES - Number(event.target.value))
        }
        className="h-10 w-full accent-amber-400 disabled:opacity-40"
      />
      <div className="mb-3 flex justify-between text-xs text-neutral-500">
        <span>vor 24 Stunden</span>
        <span>jetzt</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {JUMPS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            aria-pressed={activeJump === kind}
            onClick={() => onOffset(trafficJumpOffset(kind, new Date()))}
            className={`min-h-[56px] rounded-xl text-base font-semibold disabled:opacity-40 ${
              activeJump === kind
                ? "bg-amber-400 text-neutral-950 active:bg-amber-300"
                : "border border-neutral-700 bg-neutral-950 text-neutral-100 active:bg-neutral-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRestart}
        className="mt-3 min-h-[56px] w-full rounded-xl border border-neutral-700 bg-neutral-950 text-base font-semibold text-neutral-100 active:bg-neutral-800 disabled:opacity-40"
      >
        Neu starten
      </button>
    </section>
  );
};
