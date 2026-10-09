import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { setGeolocationSource } from "@carma-mapping/contexts";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import { useRouteNavigation } from "../Routing/routeChannel";
import {
  DEFAULT_ACCURACY_METERS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_JITTER_METERS,
  DEFAULT_POSITION,
  DEFAULT_SPEED_METERS_PER_SECOND,
} from "./config";
import { createFakeDevice, type FakeDevice } from "./fakeDevice";
import {
  downloadTrack,
  parseTrack,
  recordedFix,
  trackName,
  type GpsTrack,
  type RecordedFix,
} from "./gpsTrack";
import {
  DEFAULT_SIGNAL_PRESETS,
  type SignalPreset,
  type SimulatedSignal,
} from "./signalPresets";

/** how far "Abweichen" turns the pretend user, clockwise: a right turn */
const DETOUR_TURN_DEGREES = 90;

/** a file or url name without its extension, for the track's name */
const withoutExtension = (name: string) => name.replace(/\.(geo)?json$/i, "");

/**
 * Pretends to be the device, for testing the routing from anywhere: the
 * routes only exist around Wuppertal, and the person testing them mostly is
 * not there.
 *
 * It replaces the source of positions, not the readers: the locate context
 * asks the geolocation slot, and this addon puts a pretend receiver into it
 * while mounted. The locate button, the origin search and the routing camera
 * keep reading `currentPosition` and cannot tell. Switching the addon off in
 * the addon manager hands the slot back to the real device; the location
 * mode has to be switched off and on for the context to ask it again.
 *
 * While no navigation runs the pretend user stands at the configured
 * position, so "In der Nähe" ranks from there and a route starts there. When
 * a navigation starts on the `routeNavigation` channel, the receiver drives
 * along the route being driven at the configured speed; the routing addon sees
 * the fixes come in along its own route and ends the navigation on arrival,
 * after which the user is back home for the next search. A reroute is a new
 * route being driven, and the receiver picks it up where the user is.
 *
 * The drive can be moved by hand: the addon publishes a handle on the
 * `locationSimulation` channel with `seek`, `setPaused`, `detour` and
 * `setSpeedFactor`, which the routing's ribbon turns into a slider, a pause
 * button, an "Abweichen" button and a speed selector, so a tester can look at
 * any spot on the route without driving there first, get through a long route
 * quickly, and leave it to see the reroute. Alt + click on the map puts the
 * pretend user anywhere, see below.
 *
 * The signal can be made weak (`signalPresets.ts`), and real tracks can be
 * recorded and replayed: "record" hands the real device through and keeps
 * its fixes, to be saved as GeoJSON; a loaded track (`gpsTrack.ts`) is played
 * back instead of the drive during a navigation, with its own timing and
 * noise, so one walk can be tested as often as needed.
 *
 * Dev only: the component does nothing at all outside a dev build, so an
 * entry left on a route never fakes a position in a deployment.
 */
export const LocationSimulator = ({
  config,
  libreMap,
}: AddonComponentProps<"locationSimulator">) => {
  const {
    position = DEFAULT_POSITION,
    speedMetersPerSecond = DEFAULT_SPEED_METERS_PER_SECOND,
    intervalMs = DEFAULT_INTERVAL_MS,
    jitterMeters = DEFAULT_JITTER_METERS,
    accuracyMeters = DEFAULT_ACCURACY_METERS,
    signal: initialSignal = "good",
    signalPresets,
    replayTrackUrl,
  } = config ?? {};
  const enabled = import.meta.env.DEV;

  // the route being driven, which a reroute replaces during the navigation
  const navigation = useRouteNavigation();
  const coordinates = navigation?.route?.coordinates ?? null;
  const navigating = navigation?.navigating ?? false;

  /**
   * The presets with the config's overrides; "good" is the simulator's own
   * scatter and accuracy unless the config says otherwise there.
   */
  const presets = useMemo(() => {
    const resolved = { ...DEFAULT_SIGNAL_PRESETS };
    resolved.good = {
      ...resolved.good,
      scatterMeters: jitterMeters,
      accuracyMeters,
    };
    for (const key of Object.keys(resolved) as SimulatedSignal[]) {
      resolved[key] = { ...resolved[key], ...signalPresets?.[key] };
    }
    return resolved;
  }, [jitterMeters, accuracyMeters, signalPresets]);
  const presetsRef = useRef(presets);
  presetsRef.current = presets;

  const deviceRef = useRef<FakeDevice | null>(null);
  // where the pretend user stands between drives: the configured position,
  // until an Alt + click puts them somewhere else
  const [placed, setPlaced] = useState<[number, number] | null>(null);
  // the tuple is rebuilt by a default per render; its values are what count
  const [lng, lat] = placed ?? position;

  // not a dependency of the device below: a new device is a new source, and
  // the locate context only asks for the source when locating starts
  const homeRef = useRef<[number, number]>([lng, lat]);
  homeRef.current = [lng, lat];

  // the reception, kept across drives like the pace
  const [signal, setSignalState] = useState<SimulatedSignal>(initialSignal);
  const signalRef = useRef(signal);
  signalRef.current = signal;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const device = createFakeDevice({
      intervalMs,
      signal: presetsRef.current[signalRef.current],
    });
    device.stand(homeRef.current);
    deviceRef.current = device;
    setGeolocationSource(device);
    return () => {
      setGeolocationSource(null);
      device.dispose();
      deviceRef.current = null;
    };
  }, [enabled, intervalMs]);

  /**
   * Picks a preset. Applied to the device here rather than in an effect on
   * the state, so picking "Tunnel" again starts a new outage; once the outage
   * is over the selector goes back to "gut", which is what the device is
   * doing by then.
   */
  const tunnelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSignal = useCallback((next: SimulatedSignal) => {
    if (tunnelTimerRef.current !== null) {
      clearTimeout(tunnelTimerRef.current);
      tunnelTimerRef.current = null;
    }
    const preset: SignalPreset = presetsRef.current[next];
    deviceRef.current?.setSignal(preset);
    setSignalState(next);
    if (preset.outageMs > 0) {
      tunnelTimerRef.current = setTimeout(() => {
        tunnelTimerRef.current = null;
        deviceRef.current?.setSignal(presetsRef.current.good);
        setSignalState("good");
      }, preset.outageMs);
    }
  }, []);
  useEffect(
    () => () => {
      if (tunnelTimerRef.current !== null) {
        clearTimeout(tunnelTimerRef.current);
      }
    },
    []
  );
  // new overrides apply to the preset in use
  useEffect(() => {
    deviceRef.current?.setSignal(presets[signalRef.current]);
  }, [presets]);

  // the tester's multiplier on the configured pace, kept across drives so a
  // route checked at 4× is followed by the next one, and a reroute of it, at
  // 4× too; a replay runs at that multiple of its recorded time
  const [speedFactor, setSpeedFactor] = useState(1);
  const speedFactorRef = useRef(speedFactor);
  speedFactorRef.current = speedFactor;

  /**
   * A recording of the real device: its fixes, timed from the first one.
   * While it runs the device hands the real fixes through, and neither the
   * drive nor a replay touches it.
   */
  const recordingRef = useRef<{
    startedAt: number | null;
    fixes: RecordedFix[];
  } | null>(null);
  const [recordedCount, setRecordedCount] = useState<number | null>(null);
  const recording = recordedCount !== null;

  /** the loaded track, replayed in place of the drive during a navigation */
  const [track, setTrack] = useState<GpsTrack | null>(null);

  const driving = Boolean(navigating && coordinates);

  // simulating: a new driven route, the first or a reroute, is driven from
  // where the pretend user is on it
  useEffect(() => {
    if (recording || track) {
      return;
    }
    if (driving && coordinates) {
      deviceRef.current?.drive(
        coordinates,
        speedMetersPerSecond * speedFactorRef.current
      );
    }
  }, [driving, coordinates, speedMetersPerSecond, recording, track]);
  // between drives they stand at their spot; its own effect, so a new spot
  // picked during a drive does not start the drive over
  useEffect(() => {
    if (recording || track) {
      return;
    }
    if (!driving) {
      deviceRef.current?.stand([lng, lat]);
    }
  }, [driving, lng, lat, recording, track]);
  // replaying: the track plays from its start when a navigation starts, and
  // on through any reroute (the driven route is not a dependency); between
  // navigations the user stands at its start
  useEffect(() => {
    if (recording || !track) {
      return;
    }
    if (driving) {
      deviceRef.current?.replay(track.fixes);
    } else {
      const [first] = track.fixes;
      deviceRef.current?.stand([first.lng, first.lat]);
    }
  }, [driving, track, recording]);

  useEffect(() => {
    if (driving) {
      deviceRef.current?.setSpeed(speedMetersPerSecond * speedFactor);
      deviceRef.current?.setTimeFactor(speedFactor);
    }
  }, [driving, speedMetersPerSecond, speedFactor]);

  // a pause belongs to one drive; the next one starts moving
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!driving) {
      setPaused(false);
    }
  }, [driving]);
  useEffect(() => {
    deviceRef.current?.setPaused(paused);
  }, [paused]);

  const seek = useCallback((fraction: number) => {
    deviceRef.current?.seek(fraction);
  }, []);

  const detour = useCallback(() => {
    deviceRef.current?.detour(DETOUR_TURN_DEGREES);
  }, []);

  const startRecording = useCallback(() => {
    const device = deviceRef.current;
    if (!device || recordingRef.current) {
      return;
    }
    const current: { startedAt: number | null; fixes: RecordedFix[] } = {
      startedAt: null,
      fixes: [],
    };
    recordingRef.current = current;
    setRecordedCount(0);
    device.live((fix) => {
      if (recordingRef.current !== current) {
        return;
      }
      current.startedAt ??= fix.timestamp;
      current.fixes.push(recordedFix(fix, current.startedAt));
      setRecordedCount(current.fixes.length);
    });
  }, []);

  /**
   * Ends the recording, and with `save` hands it to the browser as a GeoJSON
   * file. The device goes back to simulating: the effects above re-run on
   * `recording` and drive, stand or replay as before.
   */
  const stopRecording = useCallback((save: boolean) => {
    const current = recordingRef.current;
    if (!current) {
      return;
    }
    recordingRef.current = null;
    setRecordedCount(null);
    if (save && current.fixes.length > 1) {
      downloadTrack({ name: trackName(), fixes: current.fixes });
    }
  }, []);

  // the ribbon goes with the navigation, and with it the button that saves:
  // a navigation that ends while recording saves what was recorded
  const wasNavigatingRef = useRef(navigating);
  useEffect(() => {
    if (wasNavigatingRef.current && !navigating && recordingRef.current) {
      stopRecording(true);
    }
    wasNavigatingRef.current = navigating;
  }, [navigating, stopRecording]);
  // a recording does not outlive the addon
  useEffect(() => () => stopRecording(false), [stopRecording]);

  const loadTrackFile = useCallback(async (file: File) => {
    try {
      const loaded = parseTrack(
        JSON.parse(await file.text()),
        withoutExtension(file.name)
      );
      if (loaded) {
        setTrack(loaded);
      }
      return loaded !== null;
    } catch (error) {
      console.warn("[LOCATION SIMULATOR] no track in file", { error });
      return false;
    }
  }, []);

  const clearTrack = useCallback(() => setTrack(null), []);

  // a fixture track from the config, loaded once
  useEffect(() => {
    if (!enabled || !replayTrackUrl) {
      return;
    }
    let cancelled = false;
    fetch(replayTrackUrl)
      .then((response) => response.json())
      .then((data) => {
        const name = withoutExtension(
          replayTrackUrl.split("/").pop() ?? "track"
        );
        const loaded = parseTrack(data, name);
        if (!cancelled && loaded) {
          setTrack(loaded);
        }
      })
      .catch((error) => {
        console.warn("[LOCATION SIMULATOR] track not loaded", {
          replayTrackUrl,
          error,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, replayTrackUrl]);

  /**
   * Puts the pretend user there, and makes it their spot between drives, so
   * the next search starts from there. During a drive they stand there at
   * once, as if they had driven there, and the navigation reroutes from it.
   */
  const navigatingRef = useRef(navigating);
  navigatingRef.current = navigating;
  const place = useCallback((at: [number, number]) => {
    if (navigatingRef.current) {
      deviceRef.current?.stand(at);
    }
    setPlaced(at);
  }, []);

  /**
   * Alt + click puts the pretend user where the click is; a plain click stays
   * the map's, for picking features.
   *
   * Caught on the map's container while the event goes down, before the map
   * sees it, so the Alt + click does not also pick the feature under it.
   */
  useEffect(() => {
    if (!enabled || !libreMap) {
      return;
    }
    const container = libreMap.getContainer();
    const onClick = (event: MouseEvent) => {
      if (!event.altKey) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      const rect = libreMap.getCanvasContainer().getBoundingClientRect();
      const at = libreMap.unproject([
        event.clientX - rect.left,
        event.clientY - rect.top,
      ]);
      place([at.lng, at.lat]);
    };
    container.addEventListener("click", onClick, { capture: true });
    return () => {
      container.removeEventListener("click", onClick, { capture: true });
    };
  }, [enabled, libreMap, place]);

  const trackSummary = useMemo(() => {
    if (!track) {
      return null;
    }
    const first = track.fixes[0];
    const last = track.fixes[track.fixes.length - 1];
    return {
      name: track.name,
      fixes: track.fixes.length,
      durationMs: last.t,
      start: [first.lng, first.lat] as [number, number],
      end: [last.lng, last.lat] as [number, number],
    };
  }, [track]);

  const mode = recording ? "record" : track ? "replay" : "simulate";

  const [, publishSimulation] = useAddonState("locationSimulation");
  useEffect(() => {
    publishSimulation({
      simulation: enabled
        ? {
            driving,
            paused,
            setPaused,
            seek,
            detour,
            place,
            signal,
            setSignal,
            speedFactor,
            setSpeedFactor,
            mode,
            recording: recordedCount !== null ? { fixes: recordedCount } : null,
            startRecording,
            stopRecording,
            track: trackSummary,
            loadTrackFile,
            clearTrack,
          }
        : null,
    });
  }, [
    publishSimulation,
    enabled,
    driving,
    paused,
    seek,
    detour,
    place,
    signal,
    setSignal,
    speedFactor,
    mode,
    recordedCount,
    startRecording,
    stopRecording,
    trackSummary,
    loadTrackFile,
    clearTrack,
  ]);
  // the handle goes with the addon, so nothing offers to move a real device
  useEffect(
    () => () => publishSimulation({ simulation: null }),
    [publishSimulation]
  );

  return null;
};
