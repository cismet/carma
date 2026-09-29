import { AUTOPLAY_SECONDS_RANGE, AUTOPLAY_SECONDS_STEP } from "./settings";

/**
 * Autoplay of the open story: start and stop, and how long each scene stays
 * on the model.
 */
export const AutoplayControl = ({
  isPlaying,
  seconds,
  disabled,
  onPlay,
  onSeconds,
}: {
  isPlaying: boolean;
  seconds: number;
  disabled: boolean;
  onPlay: (play: boolean) => void;
  onSeconds: (seconds: number) => void;
}) => (
  <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <span className="truncate text-xs uppercase tracking-[0.2em] text-neutral-400">
        Autoplay
      </span>
      <span className="shrink-0 text-sm text-neutral-400">
        {isPlaying ? "läuft, nach der letzten Szene die erste" : "aus"}
      </span>
    </div>
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
