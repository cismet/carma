import { useEffect, useState, type ReactNode } from "react";

import {
  SHADOW_CYCLE_STEPS_SECONDS,
  approximateDaylight,
  clockShadowDate,
  daysInYear,
  formatShadowCycle,
  shadowCycleStepIndex,
  shadowDayOf,
  shadowSeasonDays,
  type SceneShadow,
  type ShadowClock,
  type ShadowMoment,
  type ShadowPlay,
} from "@carma-mapping/show-remote";

/** how often the sliders follow running shadows */
const TICK_MS = 250;
/** the time slider moves in steps of this many minutes */
const TIME_STEP_MINUTES = 5;

const dayFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const formatDay = ({ year, dayOfYear }: ShadowMoment): string =>
  dayFormatter.format(new Date(Date.UTC(year, 0, dayOfYear)));

const formatTime = (minutes: number): string => {
  const rounded = Math.round(minutes) % (24 * 60);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(
    rounded % 60
  ).padStart(2, "0")}`;
};

/** one slider row: its play button, what it shows, and the slider */
const Row = ({
  id,
  label,
  value,
  playing,
  playLabel,
  disabled,
  onPlay,
  children,
}: {
  id: string;
  label: string;
  value: string;
  playing: boolean | null;
  playLabel?: string;
  disabled: boolean;
  onPlay?: () => void;
  children: ReactNode;
}) => (
  <div className="flex items-center gap-3">
    {onPlay ? (
      <button
        type="button"
        disabled={disabled}
        onClick={onPlay}
        aria-label={playing ? "Anhalten" : playLabel}
        className={`min-h-[56px] min-w-[56px] rounded-xl text-xl disabled:opacity-40 ${
          playing
            ? "bg-amber-400 text-neutral-950 active:bg-amber-300"
            : "border border-neutral-700 bg-neutral-950 text-neutral-100 active:bg-neutral-800"
        }`}
      >
        {playing ? "❚❚" : "▶"}
      </button>
    ) : (
      <span className="min-w-[56px]" aria-hidden="true" />
    )}
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-xs uppercase tracking-[0.2em] text-neutral-400"
        >
          {label}
        </label>
        <span className="shrink-0 text-sm tabular-nums text-neutral-300">
          {value}
        </span>
      </div>
      {children}
    </div>
  </div>
);

type Jump = { key: string; label: string; detail: string; value: number };

/** buttons under a slider that put it on a named value */
const Jumps = ({
  jumps,
  current,
  disabled,
  onJump,
}: {
  jumps: Jump[];
  current: number;
  disabled: boolean;
  onJump: (value: number) => void;
}) => (
  <div className="mt-1 flex flex-wrap gap-2">
    {jumps.map(({ key, label, detail, value }) => (
      <button
        key={key}
        type="button"
        disabled={disabled}
        onClick={() => onJump(value)}
        className={`flex min-h-[44px] flex-col items-start justify-center rounded-lg border px-3 py-1 text-left disabled:opacity-40 ${
          value === current
            ? "border-amber-400 text-amber-300"
            : "border-neutral-700 text-neutral-200 active:bg-neutral-800"
        }`}
      >
        <span className="text-xs font-semibold">{label}</span>
        <span className="text-[11px] tabular-nums text-neutral-400">
          {detail}
        </span>
      </button>
    ))}
  </div>
);

/**
 * Date, time and playback of the shadows the live scene casts: ▶ at the date
 * plays the year, ▶ at the time plays the day, and the last row says how long
 * one pass takes. Under the date and the time sliders, buttons jump to today
 * and the equinoxes and solstices, and to sunrise, highest sun and sunset of
 * the day shown.
 *
 * The display never reports where it is, so while something plays the sliders
 * count along on the phone's clock. The "≈" in front of the value says so.
 */
export const ShadowCard = ({
  shadow,
  clock,
  disabled,
  onPlay,
  onSeek,
  onCycle,
}: {
  shadow: SceneShadow;
  clock: ShadowClock;
  disabled: boolean;
  onPlay: (play: ShadowPlay | null) => void;
  onSeek: (moment: Partial<Pick<ShadowMoment, "dayOfYear" | "minutes">>) => void;
  onCycle: (cycleSeconds: number) => void;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!clock.play) {
      return undefined;
    }
    const handle = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(handle);
  }, [clock]);

  const date = clockShadowDate(clock, shadow, now);
  const estimated = (text: string, moving: boolean) =>
    moving ? `≈ ${text}` : text;
  const toggle = (play: ShadowPlay) =>
    onPlay(clock.play === play ? null : play);
  const pass =
    clock.play === "year"
      ? "1 Jahr"
      : clock.play === "day"
      ? shadow.daylightOnly
        ? "Tageslicht"
        : "1 Tag"
      : "Ein Durchlauf";

  const dayJump = (key: string, label: string, dayOfYear: number): Jump => ({
    key,
    label,
    detail: formatDay({ ...date, dayOfYear }),
    value: dayOfYear,
  });
  const dayJumps = [
    dayJump("today", "Heute", shadowDayOf(now).dayOfYear),
    ...shadowSeasonDays(date.year).map(({ id, label, dayOfYear }) =>
      dayJump(id, label, dayOfYear)
    ),
  ];
  const { sunriseMinutes, noonMinutes, sunsetMinutes } =
    approximateDaylight(date);
  const timeJumps = (
    [
      ["sunrise", "Sonnenaufgang", sunriseMinutes],
      ["noon", "Mittagssonne", noonMinutes],
      ["sunset", "Sonnenuntergang", sunsetMinutes],
    ] as const
  ).map(([key, label, minutes]) => ({
    key,
    label,
    detail: formatTime(minutes),
    value: Math.round(minutes),
  }));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <span className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
        {shadow.title}
      </span>
      <Row
        id="pm-remote-shadow-date"
        label="Datum"
        value={estimated(formatDay(date), clock.play === "year")}
        playing={clock.play === "year"}
        playLabel="Jahr abspielen"
        disabled={disabled}
        onPlay={() => toggle("year")}
      >
        <input
          id="pm-remote-shadow-date"
          type="range"
          min={1}
          max={daysInYear(date.year)}
          step={1}
          value={date.dayOfYear}
          disabled={disabled}
          onChange={(event) =>
            onSeek({ dayOfYear: Number(event.target.value) })
          }
          className="h-10 min-w-0 accent-amber-400 disabled:opacity-40"
        />
        <Jumps
          jumps={dayJumps}
          current={date.dayOfYear}
          disabled={disabled}
          onJump={(dayOfYear) => onSeek({ dayOfYear })}
        />
      </Row>
      <Row
        id="pm-remote-shadow-time"
        label="Uhrzeit"
        value={estimated(formatTime(date.minutes), clock.play === "day")}
        playing={clock.play === "day"}
        playLabel="Tag abspielen"
        disabled={disabled}
        onPlay={() => toggle("day")}
      >
        <input
          id="pm-remote-shadow-time"
          type="range"
          min={0}
          max={24 * 60 - TIME_STEP_MINUTES}
          step={TIME_STEP_MINUTES}
          value={
            Math.round(date.minutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES
          }
          disabled={disabled}
          onChange={(event) => onSeek({ minutes: Number(event.target.value) })}
          className="h-10 min-w-0 accent-amber-400 disabled:opacity-40"
        />
        <Jumps
          jumps={timeJumps}
          current={Math.round(date.minutes)}
          disabled={disabled}
          onJump={(minutes) => onSeek({ minutes })}
        />
      </Row>
      <Row
        id="pm-remote-shadow-cycle"
        label="Tempo"
        value={`${pass} in ${formatShadowCycle(clock.cycleSeconds)}`}
        playing={null}
        disabled={disabled}
      >
        <input
          id="pm-remote-shadow-cycle"
          type="range"
          min={0}
          max={SHADOW_CYCLE_STEPS_SECONDS.length - 1}
          step={1}
          value={shadowCycleStepIndex(clock.cycleSeconds)}
          disabled={disabled}
          onChange={(event) =>
            onCycle(SHADOW_CYCLE_STEPS_SECONDS[Number(event.target.value)])
          }
          className="h-10 min-w-0 accent-amber-400 disabled:opacity-40"
        />
      </Row>
    </section>
  );
};
