import { isIOS, isMacOs, isWindows } from "react-device-detect";

export type KeyboardDisplayPlatform = "macos" | "windows" | "other";

export type KeyboardDisplayLabels = Readonly<{
  backspace: string;
  escape: string;
  shift: string;
}>;

const KEYBOARD_DISPLAY_LABELS_BY_LANGUAGE: Readonly<
  Record<string, KeyboardDisplayLabels>
> = {
  de: {
    backspace: "Rücktaste",
    escape: "Escape",
    shift: "Umschalt",
  },
  en: {
    backspace: "Backspace",
    escape: "Escape",
    shift: "Shift",
  },
};

export const resolveKeyboardDisplayPlatform = (
  platform: KeyboardDisplayPlatform | undefined
): KeyboardDisplayPlatform => {
  if (platform) {
    return platform;
  }

  if (isMacOs || isIOS) {
    return "macos";
  }

  if (isWindows) {
    return "windows";
  }

  return "other";
};

export const resolveKeyboardDisplayLabels = (
  locale: string | undefined
): KeyboardDisplayLabels => {
  const language = locale?.split("-")[0];
  return language && KEYBOARD_DISPLAY_LABELS_BY_LANGUAGE[language]
    ? KEYBOARD_DISPLAY_LABELS_BY_LANGUAGE[language]
    : KEYBOARD_DISPLAY_LABELS_BY_LANGUAGE.en;
};

// Pair the backspace key with the glyph printed on that platform's key — the
// Mac erase-left symbol (⌫) on macOS/iOS, the backspace arrow (←) elsewhere —
// followed by the localized label ("Rücktaste"/"Backspace"), which stays the
// same across platforms. So the hint names a specific physical key while the
// symbol matches the user's keyboard.
export const resolveBackspaceDisplayLabel = (
  platform: KeyboardDisplayPlatform,
  labels: KeyboardDisplayLabels
): string => `${platform === "macos" ? "⌫" : "←"} ${labels.backspace}`;
