import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import { tween, type TweenHandle } from "../utils/cameraMath";

const OVERLAY_FADE_MS = 250;
type Transition = { imageId: string; settled: boolean; ready: boolean };

/** Coordinate preview decoration handoff and the optional flat-photo fade.
 * The scene stays visible during travel: an RGB-only full-screen backdrop
 * would be an opaque wall outside the source photo, not its translucent tint.
 */
export const usePreviewTransitionBackdrop = (
  map: MaplibreMap | null,
  enabled: boolean,
  drapeEnabled = true
) => {
  const [active, setActive] = useState(false);
  const admission = useRef({ enabled, drapeEnabled });
  admission.current = { enabled, drapeEnabled };
  const current = useRef<Transition | null>(null);
  const overlayOpacity = useRef(1);
  const fade = useRef<{
    imageId: string;
    waiting: boolean;
    direct: boolean;
    animation?: TweenHandle;
    resolve?: (completed: boolean) => void;
    revealed: Promise<boolean>;
    reveal: (completed: boolean) => void;
  } | null>(null);
  const cancel = useCallback(() => {
    current.current = null;
    const previous = fade.current;
    fade.current = null;
    previous?.animation?.cancel();
    previous?.resolve?.(false);
    previous?.reveal(false);
    overlayOpacity.current = 1;
    map?.triggerRepaint();
    setActive(false);
  }, [map]);
  const fadeOut = useCallback(
    (imageId: string, sourceReady = false): Promise<boolean> => {
      cancel();
      if (!map || !admission.current.enabled) return Promise.resolve(false);
      return new Promise((resolve) => {
        let reveal!: (completed: boolean) => void;
        const revealed = new Promise<boolean>((complete) => {
          reveal = complete;
        });
        const entry: NonNullable<typeof fade.current> = {
          imageId,
          waiting: false,
          direct: sourceReady && admission.current.drapeEnabled,
          resolve,
          revealed,
          reveal,
        };
        fade.current = entry;
        if (entry.direct) {
          // The caller has already published the calibrated drape and its union
          // decorations. Hand over the flat slot without another photo fade.
          overlayOpacity.current = 0;
          entry.waiting = true;
          entry.resolve = undefined;
          map.triggerRepaint();
          resolve(true);
          return;
        }
        entry.animation = tween({
          from: overlayOpacity.current,
          to: 0,
          durationMs: OVERLAY_FADE_MS,
          onUpdate: (opacity) => {
            overlayOpacity.current = opacity;
            map?.triggerRepaint();
          },
          onComplete: () => {
            if (fade.current !== entry) return;
            entry.animation = undefined;
            entry.resolve = undefined;
            entry.waiting = true;
            resolve(true);
          },
        });
      });
    },
    [cancel, map]
  );
  useEffect(() => {
    cancel();
    return cancel;
  }, [map, enabled, drapeEnabled, cancel]);
  const begin = useCallback(
    (imageId: string, sourceReady: boolean): Transition | undefined => {
      // A grey cover without a secured source photograph would replace the
      // current preview with an empty grey viewport during preparation.
      if (
        !sourceReady ||
        !admission.current.enabled ||
        !admission.current.drapeEnabled
      )
        return undefined;
      const transition = { imageId, settled: false, ready: false };
      current.current = transition;
      setActive(true);
      return transition;
    },
    []
  );
  const settle = useCallback(
    (transition: Transition | undefined, success: boolean) => {
      if (!transition || current.current !== transition) return;
      transition.settled = true;
      if (!success) cancel();
      else if (transition.ready) {
        current.current = null;
        setActive(false);
      }
    },
    [cancel]
  );
  const ready = useCallback(
    (imageId: string) => {
      const entry = fade.current;
      if (entry?.imageId === imageId && entry.waiting) {
        entry.waiting = false;
        if (entry.direct) {
          overlayOpacity.current = 1;
          fade.current = null;
          map?.triggerRepaint();
          entry.reveal(true);
        } else
          entry.animation = tween({
            from: overlayOpacity.current,
            to: 1,
            durationMs: OVERLAY_FADE_MS,
            onUpdate: (opacity) => {
              overlayOpacity.current = opacity;
              map?.triggerRepaint();
            },
            onComplete: () => {
              if (fade.current !== entry) return;
              fade.current = null;
              entry.reveal(true);
            },
          });
      }
      const transition = current.current;
      if (transition?.imageId === imageId) {
        transition.ready = true;
        if (transition.settled) {
          current.current = null;
          setActive(false);
        }
      }
      return entry?.imageId === imageId
        ? entry.revealed
        : Promise.resolve(true);
    },
    [cancel, map]
  );
  return { active, begin, settle, ready, cancel, fadeOut, overlayOpacity };
};
