import type { NavDirection } from "./types";

/**
 * The keymap as data rather than as a switch statement.
 *
 * The deferred entries of the spec — Backspace for undo, Tab for reading-order
 * traversal — then become rows in this table instead of a rewrite of the key
 * handler, and the help chip renders the same rows the handler matches.
 */

export type NavAction = "step" | "pan" | "exit" | "activate";

export type NavKeyBinding = {
  /** `KeyboardEvent.key` values this row matches */
  keys: readonly string[];
  /** required Shift state; `undefined` matches either */
  shift?: boolean;
  action: NavAction;
  direction?: NavDirection;
  /** only bound when the host supplied a handler for it */
  requiresHandler?: boolean;
  /** what the row does, for the help chip */
  label: string;
};

const ARROWS: Readonly<Record<string, NavDirection>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const stepRows: NavKeyBinding[] = Object.entries(ARROWS).map(
  ([key, direction]) => ({
    keys: [key],
    shift: false,
    action: "step",
    direction,
    label: "Objekt in Pfeilrichtung wählen",
  })
);

/**
 * Shift+arrow keeps panning available while the mode runs: entering navigation
 * must not permanently take arrow-key panning away from the user, and the map's
 * own keyboard handler is off for as long as the mode is on.
 */
const panRows: NavKeyBinding[] = Object.entries(ARROWS).map(
  ([key, direction]) => ({
    keys: [key],
    shift: true,
    action: "pan",
    direction,
    label: "Karte verschieben",
  })
);

export const NAV_KEYMAP: readonly NavKeyBinding[] = [
  ...stepRows,
  ...panRows,
  {
    keys: ["Escape"],
    action: "exit",
    label: "Auswahl aufheben und Modus verlassen",
  },
  {
    keys: ["Enter"],
    action: "activate",
    requiresHandler: true,
    label: "Objekt öffnen",
  },
];

const KEY_GLYPHS: Readonly<Record<string, string>> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Enter: "⏎",
};

/**
 * The keymap as the help chip shows it: one row per action, its keys collapsed
 * into one group. Built from `NAV_KEYMAP`, so a row added there appears in the
 * help without a second edit.
 */
export const navHintRows = ({
  hasActivateHandler,
}: {
  hasActivateHandler: boolean;
}): { label: string; keys: string }[] => {
  const rows = new Map<string, { glyphs: string[]; shift: boolean }>();
  for (const binding of NAV_KEYMAP) {
    if (binding.requiresHandler && !hasActivateHandler) continue;
    const row = rows.get(binding.label) ?? {
      glyphs: [],
      shift: binding.shift === true,
    };
    for (const key of binding.keys) {
      const glyph = KEY_GLYPHS[key] ?? key;
      if (!row.glyphs.includes(glyph)) row.glyphs.push(glyph);
    }
    rows.set(binding.label, row);
  }
  return [...rows.entries()].map(([label, { glyphs, shift }]) => ({
    label,
    keys: `${shift ? "Shift+" : ""}${glyphs.join("")}`,
  }));
};

/**
 * A key event must not reach navigation while the user is typing. Both the
 * event target and the focused element are checked: a key event can be
 * dispatched at the document while focus sits in a field.
 */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  const asElement = (value: unknown): Element | null =>
    value instanceof Element
      ? value
      : value instanceof Node
      ? value.parentElement
      : null;

  const isEditable = (element: Element | null): boolean =>
    element instanceof HTMLElement &&
    (element.isContentEditable ||
      element.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false'])"
      ) !== null);

  return isEditable(asElement(target)) || isEditable(document.activeElement);
};

/**
 * The row a key event triggers, or `undefined` when navigation ignores it.
 * Modifier combinations other than Shift are left to the browser and the app.
 */
export const resolveNavBinding = (
  event: KeyboardEvent,
  { hasActivateHandler }: { hasActivateHandler: boolean }
): NavKeyBinding | undefined => {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  return NAV_KEYMAP.find(
    (binding) =>
      binding.keys.includes(event.key) &&
      (binding.shift === undefined || binding.shift === event.shiftKey) &&
      (!binding.requiresHandler || hasActivateHandler)
  );
};
