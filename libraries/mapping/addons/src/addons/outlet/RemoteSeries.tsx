import { useEffect, useRef } from "react";

import {
  planSeriesApply,
  type AppliedSeriesControl,
  type SeriesStatus,
  type TimeSeriesControl,
} from "@carma-mapping/show-remote";

import { useTimeSliderActions } from "../TimeSlider/timeslider-actions";

/** the whole step a slider position shows, as the engine rounds it */
const stepOf = (value: number, stepsPerUnit: number, stepCount: number) =>
  Math.max(
    0,
    Math.min(
      Math.round(value / Math.max(stepsPerUnit, 1)),
      Math.max(stepCount - 1, 0)
    )
  );

/**
 * Plays, pauses and moves the running time series as the remote's state
 * document says. Renders nothing; a component of its own because the series
 * channel changes on every tick of a running animation, and the outlet around
 * it has no reason to render that often.
 *
 * The entry only takes effect once a series is on: a scene's series is
 * launched by its layers after the scene is applied, and the launch puts the
 * slider on its initial step, which would override a step set before it.
 *
 * A series that comes on with an entry waiting (a reload of this window) takes
 * over its step and play state. One that comes on without any runs as its
 * layer says, and the remote's first entry for it then only changes what the
 * presenter changed: a first pause stops it where it is.
 *
 * `onStatus` hears where the series stands (`SeriesStatus`), for the remote,
 * whenever that changes, and `null` while none is on.
 */
export const RemoteSeries = ({
  wanted,
  onStatus,
}: {
  wanted: TimeSeriesControl | null;
  onStatus?: (status: SeriesStatus | null) => void;
}) => {
  const {
    isOn,
    isHidden,
    wmsUrl,
    styles,
    layers,
    value,
    stepsPerUnit,
    max,
    isPlaying,
    loaded,
    failed,
    clockReady,
    setValue,
    setPlaying,
  } = useTimeSliderActions();
  const seriesKey = isOn ? JSON.stringify([wmsUrl, styles, layers]) : null;
  const stepCount = layers.length;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  /** what was taken over for which series; another series starts afresh */
  const appliedRef = useRef<{
    key: string;
    control: AppliedSeriesControl;
  } | null>(null);
  /**
   * The remote's seeks for the series on: the last one the slider shows, and
   * one on its way there. The status names a seek only once it shows it, so
   * the remote never takes the step from before the jump for the jump's.
   */
  const seekRef = useRef<{
    key: string;
    shown?: number;
    pending?: { seekAt?: number; step: number };
  } | null>(null);

  useEffect(() => {
    if (!seriesKey) {
      appliedRef.current = null;
      seekRef.current = null;
      return;
    }
    if (!wanted) {
      if (appliedRef.current?.key !== seriesKey) {
        appliedRef.current = {
          key: seriesKey,
          control: { playing: isPlayingRef.current },
        };
      }
      return;
    }
    const applied =
      appliedRef.current?.key === seriesKey ? appliedRef.current.control : null;
    const plan = planSeriesApply(applied, wanted);
    if (plan.seekTo !== undefined) {
      const target = Math.min(plan.seekTo * Math.max(stepsPerUnit, 1), max);
      setValue(target);
      const seeks = seekRef.current?.key === seriesKey ? seekRef.current : null;
      seekRef.current = {
        key: seriesKey,
        shown: seeks?.shown,
        pending: {
          seekAt: wanted.seekAt,
          step: stepOf(target, stepsPerUnit, stepCount),
        },
      };
    }
    if (plan.play !== undefined) {
      setPlaying(plan.play);
    }
    appliedRef.current = {
      key: seriesKey,
      control: { playing: wanted.playing, seekAt: wanted.seekAt },
    };
  }, [seriesKey, wanted, stepsPerUnit, max, stepCount, setValue, setPlaying]);

  const step = stepOf(value, stepsPerUnit, stepCount);
  const isReported = Boolean(seriesKey) && !isHidden;
  useEffect(() => {
    if (!onStatus) {
      return;
    }
    if (!seriesKey || !isReported) {
      onStatus(null);
      return;
    }
    const seeks = seekRef.current?.key === seriesKey ? seekRef.current : null;
    if (seeks?.pending && seeks.pending.step === step) {
      seeks.shown = seeks.pending.seekAt;
      seeks.pending = undefined;
    }
    onStatus({
      key: seriesKey,
      total: stepCount,
      loaded: loaded ?? 0,
      failed: failed ?? 0,
      ready: clockReady ?? true,
      step,
      playing: isPlaying,
      ...(seeks?.shown !== undefined ? { seekAt: seeks.shown } : {}),
    });
  }, [
    onStatus,
    seriesKey,
    isReported,
    // a new seek is looked at again, see `seekRef`
    wanted,
    stepCount,
    loaded,
    failed,
    clockReady,
    step,
    isPlaying,
  ]);

  return null;
};
