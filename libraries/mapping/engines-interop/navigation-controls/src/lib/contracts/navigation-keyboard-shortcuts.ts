export const NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS = {
  ZOOM_IN: "zoom-in",
  ZOOM_OUT: "zoom-out",
  GO_HOME: "go-home",
  ROTATE_CLOCKWISE: "rotate-clockwise",
  ROTATE_COUNTERCLOCKWISE: "rotate-counterclockwise",
  TOGGLE_ORBIT: "toggle-orbit",
  START_CONTINUOUS_DOLLY_IN: "start-continuous-dolly-in",
  START_CONTINUOUS_DOLLY_OUT: "start-continuous-dolly-out",
  RESET_FOV: "reset-fov",
} as const;

export type NavigationKeyboardShortcutAction =
  (typeof NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS)[keyof typeof NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS];

type NavigationKeyboardShortcutDefinition = {
  action: NavigationKeyboardShortcutAction;
  keys: readonly string[];
  enabled: boolean;
};

type NavigationKeyboardShortcutResolveOptions = {
  disabledActions?: readonly NavigationKeyboardShortcutAction[];
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

const isEditableElement = (element: Element | null): boolean => {
  if (typeof HTMLElement === "undefined") {
    return false;
  }

  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  const editableAncestor = element.closest(
    "input, textarea, select, [contenteditable]:not([contenteditable='false'])"
  );

  return editableAncestor instanceof HTMLElement;
};

const resolveTargetElement = (target: EventTarget | null): Element | null => {
  if (typeof Element === "undefined" || typeof Node === "undefined") {
    return null;
  }

  return target instanceof Element
    ? target
    : target instanceof Node
    ? target.parentElement
    : null;
};

export const isKeyboardTargetBlockedForNavigationShortcuts = (
  target: EventTarget | null
): boolean => {
  const targetElement = resolveTargetElement(target);

  return (
    isEditableElement(targetElement) ||
    (typeof document !== "undefined" &&
      isEditableElement(document.activeElement))
  );
};

export const isManagedNavigationKeyboardEvent = (
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

  if (isKeyboardTargetBlockedForNavigationShortcuts(event.target)) {
    return false;
  }

  return true;
};

export const NAVIGATION_KEYBOARD_SHORTCUT_CONFIG: readonly NavigationKeyboardShortcutDefinition[] =
  [
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ZOOM_IN,
      keys: ["+", "=", "NumpadAdd"],
      enabled: true,
    },
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ZOOM_OUT,
      keys: ["-", "NumpadSubtract"],
      enabled: true,
    },
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.GO_HOME,
      keys: ["H"],
      enabled: true,
    },
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_COUNTERCLOCKWISE,
      keys: ["Q", "Numpad7"],
      enabled: true,
    },
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_CLOCKWISE,
      keys: ["E", "Numpad9"],
      enabled: true,
    },
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.TOGGLE_ORBIT,
      keys: ["O"],
      enabled: true,
    },
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN,
      keys: [".", "Period"],
      enabled: true,
    },
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT,
      keys: [",", "Comma"],
      enabled: true,
    },
    {
      action: NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.RESET_FOV,
      keys: ["/", "Slash"],
      enabled: true,
    },
  ] as const;

export const resolveNavigationKeyboardShortcutAction = (
  event: KeyboardEvent,
  options: NavigationKeyboardShortcutResolveOptions = {}
): NavigationKeyboardShortcutAction | null => {
  return (
    NAVIGATION_KEYBOARD_SHORTCUT_CONFIG.find(
      ({ action, enabled, keys }) =>
        enabled &&
        !options.disabledActions?.includes(action) &&
        matchesKeyboardShortcut(event, keys)
    )?.action ?? null
  );
};
