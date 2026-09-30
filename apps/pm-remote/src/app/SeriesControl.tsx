import { useEffect, useState } from "react";

import {
  seriesView,
  type HeardSeriesStatus,
  type SceneSeries,
  type SeriesClock,
} from "@carma-mapping/show-remote";

/** how often the slider follows a running series; a step lasts about a second */
const TICK_MS = 250;

/**
 * Play, pause and the step of the time series the live scene runs.
 *
 * The slider shows the step the display says it shows (`status`). While the
 * display still loads its frames it holds, and so does the slider, with the
 * count underneath. A display that says nothing leaves the slider counting
 * along on the phone's clock; the "≈" in front of the time says so.
 */
export const SeriesControl = ({
  series,
  clock,
  status,
  disabled,
  onPlay,
  onSeek,
}: {
  series: SceneSeries;
  clock: SeriesClock;
  status: HeardSeriesStatus | null;
  disabled: boolean;
  onPlay: (playing: boolean) => void;
  onSeek: (step: number) => void;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!clock.playing) {
      return undefined;
    }
    const handle = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(handle);
  }, [clock, status]);

  const view = seriesView(clock, series, status, now);
  const label = series.labels[view.step] ?? `Schritt ${view.step + 1}`;
  const sliderId = "pm-remote-series";
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <label
          htmlFor={sliderId}
          className="truncate text-xs uppercase tracking-[0.2em] text-neutral-400"
        >
          {series.title}
        </label>
        <span className="shrink-0 text-sm tabular-nums text-neutral-300">
          {view.kind === "own" && clock.playing ? `≈ ${label}` : label}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPlay(!clock.playing)}
          aria-label={clock.playing ? "Anhalten" : "Abspielen"}
          className={`min-h-[56px] min-w-[56px] rounded-xl text-xl disabled:opacity-40 ${
            clock.playing
              ? "bg-amber-400 text-neutral-950 active:bg-amber-300"
              : "border border-neutral-700 bg-neutral-950 text-neutral-100 active:bg-neutral-800"
          }`}
        >
          {clock.playing ? "❚❚" : "▶"}
        </button>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={Math.max(series.stepCount - 1, 0)}
          step={1}
          value={view.step}
          disabled={disabled}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="h-10 min-w-0 flex-1 accent-amber-400 disabled:opacity-40"
        />
      </div>
      {view.kind === "loading" ? (
        <p
          role="status"
          className="m-0 mt-3 text-sm tabular-nums text-amber-300"
        >
          {`Frames laden ${view.loaded}/${view.total}`}
          {view.failed > 0 ? ` · ${view.failed} fehlgeschlagen` : ""}
        </p>
      ) : null}
    </section>
  );
};
