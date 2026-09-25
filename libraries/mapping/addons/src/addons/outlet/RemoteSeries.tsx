import { useEffect, useRef } from "react";

import {
  planSeriesApply,
  type AppliedSeriesControl,
  type TimeSeriesControl,
} from "@carma-mapping/show-remote";

import { useTimeSliderActions } from "../TimeSlider/timeslider-actions";

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
 */
export const RemoteSeries = ({
  wanted,
}: {
  wanted: TimeSeriesControl | null;
}) => {
  const {
    isOn,
    wmsUrl,
    styles,
    layers,
    stepsPerUnit,
    max,
    isPlaying,
    setValue,
    setPlaying,
  } = useTimeSliderActions();
  const seriesKey = isOn ? JSON.stringify([wmsUrl, styles, layers]) : null;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  /** what was taken over for which series; another series starts afresh */
  const appliedRef = useRef<{
    key: string;
    control: AppliedSeriesControl;
  } | null>(null);

  useEffect(() => {
    if (!seriesKey) {
      appliedRef.current = null;
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
      setValue(Math.min(plan.seekTo * Math.max(stepsPerUnit, 1), max));
    }
    if (plan.play !== undefined) {
      setPlaying(plan.play);
    }
    appliedRef.current = {
      key: seriesKey,
      control: { playing: wanted.playing, seekAt: wanted.seekAt },
    };
  }, [seriesKey, wanted, stepsPerUnit, max, setValue, setPlaying]);

  return null;
};
