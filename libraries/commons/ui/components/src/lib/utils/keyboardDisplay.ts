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
    escape: "Esc",
    shift: "Umschalt",
  },
  en: {
    backspace: "Backspace",
    escape: "Esc",
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

export const resolveBackspaceDisplayLabel = (
  platform: KeyboardDisplayPlatform,
  labels: KeyboardDisplayLabels
): string => (platform === "macos" ? "⌫" : `← ${labels.backspace}`);
