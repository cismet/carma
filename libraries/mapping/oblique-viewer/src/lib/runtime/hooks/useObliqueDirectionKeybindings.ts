import { useEffect, useRef } from "react";
import { isManagedNavigationKeyboardEvent } from "@carma-mapping/engines-interop/navigation-controls";
import {
  OBLIQUE_NAVIGATION_KEYS,
  type ObliqueNavigationKey,
} from "../oblique-actions";

type Params = {
  enabled?: boolean;
  rotationEnabled?: boolean;
  onNavigate: (key: ObliqueNavigationKey) => void;
  onNadir?: () => void;
};

const NUMPAD_NAVIGATION: Readonly<Record<string, ObliqueNavigationKey>> = {
  Numpad8: OBLIQUE_NAVIGATION_KEYS.Up,
  Numpad4: OBLIQUE_NAVIGATION_KEYS.Left,
  Numpad2: OBLIQUE_NAVIGATION_KEYS.Down,
  Numpad6: OBLIQUE_NAVIGATION_KEYS.Right,
  Numpad7: OBLIQUE_NAVIGATION_KEYS.RotateLeft,
  Numpad9: OBLIQUE_NAVIGATION_KEYS.RotateRight,
};
const KEY_NAVIGATION: Readonly<Record<string, ObliqueNavigationKey>> = {
  w: OBLIQUE_NAVIGATION_KEYS.Up,
  arrowup: OBLIQUE_NAVIGATION_KEYS.Up,
  a: OBLIQUE_NAVIGATION_KEYS.Left,
  arrowleft: OBLIQUE_NAVIGATION_KEYS.Left,
  s: OBLIQUE_NAVIGATION_KEYS.Down,
  arrowdown: OBLIQUE_NAVIGATION_KEYS.Down,
  d: OBLIQUE_NAVIGATION_KEYS.Right,
  arrowright: OBLIQUE_NAVIGATION_KEYS.Right,
  q: OBLIQUE_NAVIGATION_KEYS.RotateLeft,
  r: OBLIQUE_NAVIGATION_KEYS.RotateRight,
};

/** Buttons and shortcuts navigate the same prepared image targets. */
export const useObliqueDirectionKeybindings = ({
  enabled = true,
  rotationEnabled = true,
  onNavigate,
  onNadir,
}: Params): void => {
  const callbacks = useRef({ onNavigate, onNadir, rotationEnabled });
  callbacks.current = { onNavigate, onNadir, rotationEnabled };
  useEffect(() => {
    if (!enabled) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        !isManagedNavigationKeyboardEvent(event, { allowRepeat: true })
      )
        return;
      if (event.code === "Numpad5") {
        if (!callbacks.current.onNadir) return;
        event.preventDefault();
        event.stopPropagation();
        callbacks.current.onNadir();
        return;
      }
      const key =
        NUMPAD_NAVIGATION[event.code] ??
        KEY_NAVIGATION[event.key.toLowerCase()];
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      if (
        (key === OBLIQUE_NAVIGATION_KEYS.RotateLeft ||
          key === OBLIQUE_NAVIGATION_KEYS.RotateRight) &&
        !callbacks.current.rotationEnabled
      )
        return;
      callbacks.current.onNavigate(key);
    };
    // Claim arrows before MapLibre also pans its camera for the same key.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled]);
};
