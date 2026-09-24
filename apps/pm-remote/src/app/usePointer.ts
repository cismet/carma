import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_POINTER_DIM,
  DEFAULT_POINTER_RADIUS,
  POINTER_REACH,
  helloRelay,
  pointerSessionCode,
  pointerTarget,
  writeRelayState,
  type PointerChannel,
  type PointerSample,
  type RelayTarget,
} from "@carma-mapping/show-remote";

import { createLatestWinsWriter } from "./display-link";
import { relayErrorText } from "./messages";
import {
  OrientationError,
  requestMotionAccess,
  startOrientation,
  type OrientationSource,
  type OrientationStream,
} from "./orientation";
import {
  OneEuro2,
  SIDE_TURN,
  WristPointer,
  calibrateCenter,
  calibrateEdge,
  recalibrate,
  toModel,
  type Calibration,
  type DeviceAxes,
  type PresenterSide,
  type Vec2,
} from "./pointer-math";
import { STORAGE_PREFIX } from "./settings";

const LOG_PREFIX = "[PM POINTER]";
const SETTINGS_KEY = `${STORAGE_PREFIX}.pointer`;

/** how long a size or dimming change shows the spot when nobody holds it */
const PREVIEW_MS = 1500;
/** how often the panel's readout and mini map refresh */
const READOUT_MS = 100;
/**
 * A held spot that has not moved still writes this often: the display drops
 * a spot it has not heard of for a few seconds, in case the phone went away.
 */
const HEARTBEAT_MS = 1000;
/**
 * A sample older than this is of no use to the spot; dropping its request
 * frees the writer for the next one.
 */
const SAMPLE_TIMEOUT_MS = 1500;
/**
 * The sensor reads at 60 Hz, a request per reading is more than the path to
 * the relay takes; the display leads the spot along its velocity in between.
 */
const SEND_INTERVAL_MS = 40;

/** wrist: the phone as an air mouse. laser: the top edge's ray on the table */
export type PointerMode = "wrist" | "laser";

export type PointerSettings = {
  mode: PointerMode;
  /** wrist mode: model widths per degree of turn */
  wristGain: number;
  radius: number;
  dim: number;
  side: PresenterSide;
  /** model widths per table unit, see `pointer-math` */
  scale: number;
  /** measured by the edge calibration; null takes the side's */
  turn: number | null;
};

export const DEFAULT_POINTER_SETTINGS: PointerSettings = {
  mode: "wrist",
  // a turn of 35 degrees crosses the whole image
  wristGain: 1 / 35,
  radius: DEFAULT_POINTER_RADIUS,
  dim: DEFAULT_POINTER_DIM,
  side: "bottom",
  scale: 0.35,
  turn: null,
};

const isSide = (value: unknown): value is PresenterSide =>
  typeof value === "string" && value in SIDE_TURN;

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const loadPointerSettings = (): PointerSettings => {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? "{}"
    );
    const record =
      typeof stored === "object" && stored !== null
        ? (stored as Record<string, unknown>)
        : {};
    const d = DEFAULT_POINTER_SETTINGS;
    return {
      mode: record["mode"] === "laser" ? "laser" : d.mode,
      wristGain: numberOr(record["wristGain"], d.wristGain),
      radius: numberOr(record["radius"], d.radius),
      dim: numberOr(record["dim"], d.dim),
      side: isSide(record["side"]) ? record["side"] : d.side,
      scale: numberOr(record["scale"], d.scale),
      turn:
        typeof record["turn"] === "number" && Number.isFinite(record["turn"])
          ? record["turn"]
          : null,
    };
  } catch (error) {
    console.warn(`${LOG_PREFIX} stored pointer settings unreadable`, error);
    return DEFAULT_POINTER_SETTINGS;
  }
};

const savePointerSettings = (settings: PointerSettings): void => {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn(`${LOG_PREFIX} storing the pointer settings failed`, error);
  }
};

const turnOf = (settings: PointerSettings): number =>
  settings.turn ?? SIDE_TURN[settings.side];

/**
 * closed: the display shows no pointer. motion: the phone's attitude steers
 * the spot. touch: no attitude to be had, a finger on the hold area steers it.
 */
export type PointerStatus = "closed" | "starting" | "motion" | "touch";

export type Calibrated = "none" | "center" | "edge";

export type PointerReadout = {
  position: Vec2;
  isHolding: boolean;
  readingsPerSecond: number;
  writesPerSecond: number;
  rttMs: number | null;
};

const NO_READOUT: PointerReadout = {
  position: [0, 0],
  isHolding: false,
  readingsPerSecond: 0,
  writesPerSecond: 0,
  rttMs: null,
};

const clampReach = (value: number): number =>
  Math.min(POINTER_REACH, Math.max(-POINTER_REACH, value));

/**
 * The phone as a pointer. Opening it starts the attitude source, opens the
 * pointer session and tells the display to follow it; holding the pointer
 * button shows the spot there, releasing it hides the spot again.
 */
export const usePointer = (
  target: RelayTarget | null,
  setPointerChannel: (channel: PointerChannel | null) => Promise<void>
) => {
  const [status, setStatus] = useState<PointerStatus>("closed");
  const [source, setSource] = useState<OrientationSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<PointerSettings>(() =>
    loadPointerSettings()
  );
  const [calibrated, setCalibrated] = useState<Calibrated>("none");
  const [readout, setReadout] = useState<PointerReadout>(NO_READOUT);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const streamRef = useRef<OrientationStream | null>(null);
  const axesRef = useRef<DeviceAxes | null>(null);
  const calibrationRef = useRef<Calibration | null>(null);
  const filterRef = useRef(new OneEuro2());
  const wristRef = useRef(new WristPointer());
  const positionRef = useRef<Vec2>([0, 0]);
  const velocityRef = useRef<Vec2>([0, 0]);
  const holdingRef = useRef(false);
  const previewTimerRef = useRef<number | null>(null);
  const seqRef = useRef(0);
  const readingsRef = useRef(0);
  const writesRef = useRef(0);
  const rttRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);
  const statusRef = useRef<PointerStatus>("closed");
  statusRef.current = status;

  const sessionTarget = useMemo(
    () => (target ? pointerTarget(target) : null),
    [target]
  );

  const writer = useMemo(
    () =>
      sessionTarget
        ? createLatestWinsWriter(async (state) => {
            const startedAt = performance.now();
            await writeRelayState(sessionTarget, state, SAMPLE_TIMEOUT_MS);
            rttRef.current = Math.round(performance.now() - startedAt);
            writesRef.current += 1;
          })
        : null,
    [sessionTarget]
  );

  const sendSample = useCallback(
    (on: boolean) => {
      if (!writer) {
        return;
      }
      const { radius, dim } = settingsRef.current;
      const [dx, dy] = positionRef.current;
      const [vx, vy] = on ? velocityRef.current : [0, 0];
      seqRef.current += 1;
      lastSentAtRef.current = performance.now();
      const sample: PointerSample = {
        on,
        mode: "spotlight",
        dx,
        dy,
        vx,
        vy,
        radius,
        dim,
        seq: seqRef.current,
      };
      writer.write(sample).catch((writeError: unknown) => {
        console.warn(`${LOG_PREFIX} sample write failed`, writeError);
        setError(relayErrorText(writeError));
      });
    },
    [writer]
  );

  const isShowing = () =>
    holdingRef.current || previewTimerRef.current !== null;

  const handleAxes = useCallback(
    (axes: DeviceAxes, timeMs: number) => {
      axesRef.current = axes;
      readingsRef.current += 1;
      if (!holdingRef.current) {
        return;
      }
      const { mode, wristGain } = settingsRef.current;
      const calibration = calibrationRef.current;
      let raw: Vec2;
      if (mode === "wrist") {
        raw = wristRef.current.update(axes, wristGain);
      } else if (calibration) {
        raw = toModel(calibration, axes);
      } else {
        return;
      }
      const { value, velocity } = filterRef.current.filter(raw, timeMs);
      positionRef.current = value;
      velocityRef.current = velocity;
      if (performance.now() - lastSentAtRef.current >= SEND_INTERVAL_MS) {
        sendSample(true);
      }
    },
    [sendSample]
  );

  const stopStream = () => {
    streamRef.current?.stop();
    streamRef.current = null;
    axesRef.current = null;
  };

  const clearPreview = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  };

  /** must be called from a tap: iOS asks for motion access only then */
  const open = useCallback(() => {
    if (!target || !sessionTarget || statusRef.current !== "closed") {
      return;
    }
    const access = requestMotionAccess();
    setStatus("starting");
    setError(null);
    setNotice(null);
    void (async () => {
      let next: PointerStatus = "touch";
      try {
        await access;
        const stream = await startOrientation(({ axes, timeMs }) =>
          handleAxes(axes, timeMs)
        );
        streamRef.current = stream;
        setSource(stream.source);
        next = "motion";
      } catch (sensorError) {
        setSource(null);
        setNotice(
          sensorError instanceof OrientationError
            ? `${sensorError.message} Der Finger auf der Zeigefläche steuert den Punkt.`
            : "Keine Lagesensoren. Der Finger auf der Zeigefläche steuert den Punkt."
        );
      }
      try {
        // the hello opens the session, the first sample gives the display
        // something to read before it follows
        await helloRelay(sessionTarget);
        positionRef.current = [0, 0];
        wristRef.current.center(null);
        sendSample(false);
        await setPointerChannel({
          session: pointerSessionCode(target.code),
          epoch: Date.now(),
        });
        setStatus(next);
      } catch (relayError) {
        stopStream();
        setStatus("closed");
        setError(relayErrorText(relayError));
      }
    })();
  }, [target, sessionTarget, handleAxes, sendSample, setPointerChannel]);

  const close = useCallback(() => {
    holdingRef.current = false;
    clearPreview();
    stopStream();
    calibrationRef.current = null;
    setCalibrated("none");
    if (statusRef.current !== "closed") {
      sendSample(false);
      setPointerChannel(null).catch(() => {
        // reported by the display hook
      });
    }
    setStatus("closed");
    setSource(null);
    setNotice(null);
  }, [sendSample, setPointerChannel]);

  const center = useCallback(() => {
    const axes = axesRef.current;
    if (settingsRef.current.mode === "wrist") {
      wristRef.current.center(axes);
      filterRef.current.reset();
      positionRef.current = [0, 0];
      setNotice(null);
      if (isShowing()) {
        sendSample(true);
      }
      return;
    }
    if (!axes) {
      positionRef.current = [0, 0];
      return;
    }
    const { scale } = settingsRef.current;
    calibrationRef.current = calibrateCenter(
      axes,
      turnOf(settingsRef.current),
      scale
    );
    filterRef.current.reset();
    positionRef.current = [0, 0];
    setCalibrated((current) => (current === "edge" ? "edge" : "center"));
    setNotice(null);
    if (isShowing()) {
      sendSample(true);
    }
  }, [sendSample]);

  const edge = useCallback(() => {
    const axes = axesRef.current;
    const calibration = calibrationRef.current;
    if (!axes || !calibration) {
      return;
    }
    const result = calibrateEdge(calibration, axes);
    if (!result) {
      setNotice(
        "Rand und Mitte liegen zu dicht beieinander. Auf die Mitte des rechten Bildrands zielen."
      );
      return;
    }
    calibrationRef.current = result.calibration;
    const next = {
      ...settingsRef.current,
      scale: result.calibration.scale,
      turn: result.turn,
    };
    savePointerSettings(next);
    setSettings(next);
    setCalibrated("edge");
    setNotice(null);
  }, []);

  const press = useCallback(() => {
    clearPreview();
    holdingRef.current = true;
    filterRef.current.reset();
    if (statusRef.current === "motion" && settingsRef.current.mode === "wrist") {
      // the spot goes on from where it was, like a mouse picked up and put down
      wristRef.current.anchor(axesRef.current);
      positionRef.current = wristRef.current.position;
      velocityRef.current = [0, 0];
      sendSample(true);
      return;
    }
    if (statusRef.current === "motion" && !calibrationRef.current) {
      // the first hold starts in the middle, like the TV remote's pointer
      center();
      return;
    }
    const axes = axesRef.current;
    const calibration = calibrationRef.current;
    if (axes && calibration) {
      positionRef.current = toModel(calibration, axes);
      velocityRef.current = [0, 0];
    }
    sendSample(true);
  }, [center, sendSample]);

  const release = useCallback(() => {
    if (!holdingRef.current) {
      return;
    }
    holdingRef.current = false;
    velocityRef.current = [0, 0];
    sendSample(false);
  }, [sendSample]);

  /** the finger's travel as a fraction of the hold area, for phones without attitude */
  const touchMove = useCallback(
    (fractionX: number, fractionY: number) => {
      if (!holdingRef.current || statusRef.current !== "touch") {
        return;
      }
      const [x, y] = positionRef.current;
      positionRef.current = [
        clampReach(x + fractionX),
        clampReach(y + fractionY),
      ];
      sendSample(true);
    },
    [sendSample]
  );

  const updateSettings = useCallback(
    (patch: Partial<PointerSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      // a side chosen by hand replaces what the edge calibration measured
      if (patch.side !== undefined) {
        next.turn = null;
      }
      savePointerSettings(next);
      settingsRef.current = next;
      setSettings(next);
      if (calibrationRef.current) {
        calibrationRef.current = recalibrate(
          calibrationRef.current,
          turnOf(next),
          next.scale
        );
        if (patch.side !== undefined || patch.scale !== undefined) {
          setCalibrated((current) => (current === "edge" ? "center" : current));
        }
      }
      if (statusRef.current === "closed") {
        return;
      }
      // a size or dimming change shows the spot for a moment
      if (
        !holdingRef.current &&
        (patch.radius !== undefined || patch.dim !== undefined)
      ) {
        clearPreview();
        previewTimerRef.current = window.setTimeout(() => {
          previewTimerRef.current = null;
          if (!holdingRef.current) {
            sendSample(false);
          }
        }, PREVIEW_MS);
      }
      if (isShowing()) {
        sendSample(true);
      }
    },
    [sendSample]
  );

  // a phone locked or switched away mid-point would leave the spot standing
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") {
        release();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, [release]);

  // another session code means another display
  useEffect(
    () => () => {
      holdingRef.current = false;
      clearPreview();
      stopStream();
      calibrationRef.current = null;
      setCalibrated("none");
      setStatus("closed");
    },
    [sessionTarget]
  );

  useEffect(() => {
    if (status === "closed" || status === "starting") {
      return;
    }
    let lastAt = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const seconds = Math.max((now - lastAt) / 1000, 1e-3);
      lastAt = now;
      setReadout({
        position: positionRef.current,
        isHolding: holdingRef.current,
        readingsPerSecond: Math.round(readingsRef.current / seconds),
        writesPerSecond: Math.round(writesRef.current / seconds),
        rttMs: rttRef.current,
      });
      readingsRef.current = 0;
      writesRef.current = 0;
    }, READOUT_MS * 10);
    const fast = window.setInterval(() => {
      if (
        holdingRef.current &&
        performance.now() - lastSentAtRef.current > HEARTBEAT_MS
      ) {
        sendSample(true);
      }
      setReadout((current) =>
        current.position === positionRef.current &&
        current.isHolding === holdingRef.current
          ? current
          : {
              ...current,
              position: positionRef.current,
              isHolding: holdingRef.current,
            }
      );
    }, READOUT_MS);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(fast);
    };
  }, [status, sendSample]);

  return {
    status,
    source,
    error,
    notice,
    settings,
    calibrated,
    readout,
    open,
    close,
    press,
    release,
    touchMove,
    center,
    edge,
    updateSettings,
  };
};
