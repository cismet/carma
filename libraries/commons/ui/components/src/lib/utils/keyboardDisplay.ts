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

// Always pair the backspace key with its keyboard symbol (⌫) so the running
// measurement / edit hints make clear that a specific key is meant, independent
// of platform (cismet/wupp#4078).
export const resolveBackspaceDisplayLabel = (
  _platform: KeyboardDisplayPlatform,
  labels: KeyboardDisplayLabels
): string => `⌫ ${labels.backspace}`;
