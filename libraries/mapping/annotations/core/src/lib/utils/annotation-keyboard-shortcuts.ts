import { isKeyboardTargetEditable } from "./dom";

export const ANNOTATION_SHORTCUT_GLYPHS: Readonly<Record<string, string>> = {
  A: "🅰",
  B: "🅱",
  C: "🅲",
  D: "🅳",
  E: "🅴",
  F: "🅵",
  G: "🅶",
  H: "🅷",
  I: "🅸",
  J: "🅹",
  K: "🅺",
  L: "🅻",
  M: "🅼",
  N: "🅽",
  O: "🅾",
  P: "🅿",
  Q: "🆀",
  R: "🆁",
  S: "🆂",
  T: "🆃",
  U: "🆄",
  V: "🆅",
  W: "🆆",
  X: "🆇",
  Y: "🆈",
  Z: "🆉",
  0: "⓿",
  1: "➊",
  2: "➋",
  3: "➌",
  4: "➍",
  5: "➎",
  6: "➏",
  7: "➐",
  8: "➑",
  9: "➒",
} as const;

export const ANNOTATION_COMMON_SHORTCUT_ACTIONS = {
  CANCEL_ACTIVE_TOOL: "cancel-active-tool",
  DELETE_SELECTION: "delete-selection",
  FINISH_MEASUREMENT: "finish-measurement",
  FOCUS_NEXT_NAVIGATION_ITEM: "focus-next-navigation-item",
  FOCUS_PREVIOUS_NAVIGATION_ITEM: "focus-previous-navigation-item",
  UNDO_LAST_POINT: "undo-last-point",
} as const;

export const ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS = {
  ZOOM_IN: "zoom-in",
  ZOOM_OUT: "zoom-out",
  GO_HOME: "go-home",
  TOGGLE_ORBIT: "toggle-orbit",
  START_CONTINUOUS_DOLLY_IN: "start-continuous-dolly-in",
  START_CONTINUOUS_DOLLY_OUT: "start-continuous-dolly-out",
  RESET_FOV: "reset-fov",
} as const;

export type AnnotationCommonShortcutAction =
  (typeof ANNOTATION_COMMON_SHORTCUT_ACTIONS)[keyof typeof ANNOTATION_COMMON_SHORTCUT_ACTIONS];

export type AnnotationNavigationShortcutAction =
  (typeof ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS)[keyof typeof ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS];

type AnnotationShortcutAction =
  | AnnotationCommonShortcutAction
  | AnnotationNavigationShortcutAction;

type AnnotationShortcutDefinition<TAction extends AnnotationShortcutAction> = {
  action: TAction;
  keys: readonly string[];
  enabled: boolean;
};

type AnnotationShortcutResolveOptions<
  TAction extends AnnotationShortcutAction
> = {
  disabledActions?: readonly TAction[];
};

const matchesKeyboardShortcut = (
  event: KeyboardEvent,
  keys: readonly string[]
): boolean => {
  const normalizedKey = event.key.toLowerCase();
  const normalizedCode = event.code.toLowerCase();

  return keys.some((key) => {
    const normalizedShortcut = key.toLowerCase();
    return (
      normalizedShortcut === normalizedKey ||
      normalizedShortcut === normalizedCode
    );
  });
};

export const ANNOTATION_COMMON_SHORTCUT_CONFIG: readonly AnnotationShortcutDefinition<AnnotationCommonShortcutAction>[] =
  [
    {
      action: ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL,
      keys: ["Escape"],
      enabled: true,
    },
    {
      action: ANNOTATION_COMMON_SHORTCUT_ACTIONS.FINISH_MEASUREMENT,
      keys: ["Enter"],
      enabled: true,
    },
    {
      action: ANNOTATION_COMMON_SHORTCUT_ACTIONS.FOCUS_PREVIOUS_NAVIGATION_ITEM,
      keys: ["ArrowLeft"],
      enabled: true,
    },
    {
      action: ANNOTATION_COMMON_SHORTCUT_ACTIONS.FOCUS_NEXT_NAVIGATION_ITEM,
      keys: ["ArrowRight"],
      enabled: true,
    },
    {
      action: ANNOTATION_COMMON_SHORTCUT_ACTIONS.DELETE_SELECTION,
      keys: ["Delete"],
      enabled: true,
    },
    {
      action: ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT,
      keys: ["Backspace"],
      enabled: true,
    },
  ] as const;

export const ANNOTATION_NAVIGATION_SHORTCUT_CONFIG: readonly AnnotationShortcutDefinition<AnnotationNavigationShortcutAction>[] =
  [
    {
      action: ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.ZOOM_IN,
      keys: ["+", "=", "NumpadAdd"],
      enabled: true,
    },
    {
      action: ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.ZOOM_OUT,
      keys: ["-", "NumpadSubtract"],
      enabled: true,
    },
    {
      action: ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.GO_HOME,
      keys: ["H"],
      enabled: true,
    },
    {
      action: ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.TOGGLE_ORBIT,
      keys: ["O"],
      enabled: true,
    },
    {
      action: ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN,
      keys: ["."],
      enabled: true,
    },
    {
      action: ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT,
      keys: [","],
      enabled: true,
    },
    {
      action: ANNOTATION_NAVIGATION_SHORTCUT_ACTIONS.RESET_FOV,
      keys: ["/"],
      enabled: true,
    },
  ] as const;

export const isManagedAnnotationKeyboardEvent = (
  event: KeyboardEvent,
  { allowRepeat = false }: { allowRepeat?: boolean } = {}
): boolean => {
  if (event.defaultPrevented) {
    return false;
  }

  if (!allowRepeat && event.repeat) {
    return false;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  if (isKeyboardTargetEditable(event.target)) {
    return false;
  }

  return true;
};

export const isSelectAllAnnotationKeyboardShortcut = (
  event: KeyboardEvent
): boolean =>
  !event.defaultPrevented &&
  !event.altKey &&
  !isKeyboardTargetEditable(event.target) &&
  (event.ctrlKey || event.metaKey) &&
  event.key.toLowerCase() === "a";

export const resolveAnnotationCommonShortcutAction = (
  event: KeyboardEvent,
  options: AnnotationShortcutResolveOptions<AnnotationCommonShortcutAction> = {}
): AnnotationCommonShortcutAction | null => {
  return (
    ANNOTATION_COMMON_SHORTCUT_CONFIG.find(
      ({ action, enabled, keys }) =>
        enabled &&
        !options.disabledActions?.includes(action) &&
        matchesKeyboardShortcut(event, keys)
    )?.action ?? null
  );
};

export const resolveAnnotationNavigationShortcutAction = (
  event: KeyboardEvent,
  options: AnnotationShortcutResolveOptions<AnnotationNavigationShortcutAction> = {}
): AnnotationNavigationShortcutAction | null => {
  return (
    ANNOTATION_NAVIGATION_SHORTCUT_CONFIG.find(
      ({ action, enabled, keys }) =>
        enabled &&
        !options.disabledActions?.includes(action) &&
        matchesKeyboardShortcut(event, keys)
    )?.action ?? null
  );
};

export const renderAnnotationShortcutGlyph = (shortcut: string): string =>
  ANNOTATION_SHORTCUT_GLYPHS[shortcut] ?? shortcut;
