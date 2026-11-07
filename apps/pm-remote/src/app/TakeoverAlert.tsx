import { useEffect } from "react";

import type { Presenter } from "@carma-mapping/show-remote";

/** buzz, pause, buzz; Android only, iOS Safari has no `navigator.vibrate` */
const VIBRATION_MS = [200, 100, 200];
const BEEP_HZ = 880;
const BEEP_SECONDS = 0.25;

const LOG_PREFIX = "[PM REMOTE TAKEOVER]";

/** a short tone, for a phone lying on the desk; a browser may keep it silent */
const beep = () => {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = BEEP_HZ;
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + BEEP_SECONDS
    );
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + BEEP_SECONDS);
    oscillator.onended = () => {
      void context.close();
    };
  } catch (error) {
    console.warn(`${LOG_PREFIX} no sound`, error);
  }
};

/**
 * Somebody else took the show from this phone. It covers everything until
 * tapped, so the presenter cannot miss that the buttons no longer steer.
 */
export const TakeoverAlert = ({
  by,
  onDismiss,
  onTakeBack,
}: {
  by: Presenter;
  onDismiss: () => void;
  onTakeBack: () => void;
}) => {
  useEffect(() => {
    navigator.vibrate?.(VIBRATION_MS);
    beep();
  }, [by.device]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`${by.name} hat übernommen`}
      className="fixed inset-0 z-50 flex flex-col bg-amber-400 text-neutral-950 pt-safe-top-xs pb-safe-bottom-xs"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="flex flex-1 flex-col items-center justify-center gap-4 bg-transparent px-6 text-center text-neutral-950"
      >
        <span className="break-words text-4xl font-bold leading-tight">
          {by.name} hat übernommen
        </span>
        <span className="text-base">
          Diese Fernbedienung zeigt jetzt nur noch, was läuft. Tippen zum
          Schließen.
        </span>
      </button>
      <div className="mx-auto w-full max-w-xl px-4 pb-4">
        <button
          type="button"
          onClick={onTakeBack}
          className="min-h-[52px] w-full rounded-xl bg-neutral-950 text-base font-semibold text-neutral-100 active:bg-neutral-800"
        >
          Zurückholen
        </button>
      </div>
    </div>
  );
};
