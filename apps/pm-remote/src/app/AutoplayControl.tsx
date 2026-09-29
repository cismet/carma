import { useEffect, useState } from "react";

import { AUTOPLAY_SECONDS_RANGE, AUTOPLAY_SECONDS_STEP } from "./settings";
import type { AutoplayCountdown } from "./useAutoplay";

/**
 * Fills up until the next scene comes. The browser runs the animation, so the
 * bar moves smoothly without a render per frame; a bar mounted mid-wait starts
 * where the wait is.
 */
const ProgressFill = ({ startedAt, ms }: AutoplayCountdown) => {
  const [elapsed] = useState(() => Date.now() - startedAt);
  return (
    <div
      className="h-full w-full origin-left bg-amber-400"
      style={{
        animation: `pm-autoplay-fill ${ms}ms linear ${-elapsed}ms forwards`,
      }}
    />
  );
};

/** the whole seconds left until the next scene, counted down */
const useSecondsLeft = (countdown: AutoplayCountdown | null): number | null => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!countdown) {
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [countdown]);
  return countdown
    ? Math.max(0, Math.ceil((countdown.startedAt + countdown.ms - now) / 1000))
    : null;
};

/**
 * Autoplay of the open story: start and stop, and how long each scene stays
 * on the model.
 */
export const AutoplayControl = ({
  isPlaying,
  countdown,
  nextTitle,
  seconds,
  disabled,
  onPlay,
  onSeconds,
}: {
  isPlaying: boolean;
  /** the running wait; null while a change runs or the clock is held */
  countdown: AutoplayCountdown | null;
  /** the scene that comes next, after the last the first again */
  nextTitle: string | undefined;
  seconds: number;
  disabled: boolean;
  onPlay: (play: boolean) => void;
  onSeconds: (seconds: number) => void;
}) => {
  const secondsLeft = useSecondsLeft(isPlaying ? countdown : null);
  return (
    <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-xs uppercase tracking-[0.2em] text-neutral-400">
          Autoplay
        </span>
        <span className="min-w-0 truncate text-sm tabular-nums text-neutral-300">
          {!isPlaying
            ? "aus"
            : secondsLeft === null
            ? "wartet"
            : `${nextTitle ?? "Nächste Szene"} in ${secondsLeft} s`}
        </span>
      </div>
      {isPlaying && (
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-neutral-800">
          {countdown && (
            <ProgressFill key={countdown.startedAt} {...countdown} />
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPlay(!isPlaying)}
          aria-label={isPlaying ? "Autoplay stoppen" : "Autoplay starten"}
          className={`min-h-[56px] min-w-[56px] rounded-xl text-xl disabled:opacity-40 ${
            isPlaying
              ? "bg-amber-400 text-neutral-950 active:bg-amber-300"
              : "border border-neutral-700 bg-neutral-950 text-neutral-100 active:bg-neutral-800"
          }`}
        >
          {isPlaying ? "■" : "▶"}
        </button>
        <button
          type="button"
          disabled={seconds <= AUTOPLAY_SECONDS_RANGE[0]}
          onClick={() => onSeconds(seconds - AUTOPLAY_SECONDS_STEP)}
          aria-label="Kürzer"
          className="min-h-[56px] min-w-[56px] rounded-xl border border-neutral-700 bg-neutral-950 text-xl text-neutral-100 active:bg-neutral-800 disabled:opacity-40"
        >
          −
        </button>
        <span className="flex-1 text-center text-lg tabular-nums text-neutral-100">
          {seconds} s je Szene
        </span>
        <button
          type="button"
          disabled={seconds >= AUTOPLAY_SECONDS_RANGE[1]}
          onClick={() => onSeconds(seconds + AUTOPLAY_SECONDS_STEP)}
          aria-label="Länger"
          className="min-h-[56px] min-w-[56px] rounded-xl border border-neutral-700 bg-neutral-950 text-xl text-neutral-100 active:bg-neutral-800 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </section>
  );
};
