import { describe, expect, it } from "vitest";

import {
  isManagedNavigationKeyboardEvent,
  NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS,
  resolveNavigationKeyboardShortcutAction,
} from "./navigation-keyboard-shortcuts";

const keyEvent = (
  key: string,
  options: Partial<KeyboardEvent> = {}
): KeyboardEvent =>
  ({
    altKey: false,
    code: key,
    ctrlKey: false,
    defaultPrevented: false,
    key,
    metaKey: false,
    repeat: false,
    target: null,
    ...options,
  } as KeyboardEvent);

describe("navigation keyboard shortcuts", () => {
  it("resolves dolly keys by key and code", () => {
    expect(resolveNavigationKeyboardShortcutAction(keyEvent("."))).toBe(
      NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_IN
    );
    expect(
      resolveNavigationKeyboardShortcutAction(
        keyEvent("Unidentified", {
          code: "Comma",
        })
      )
    ).toBe(NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.START_CONTINUOUS_DOLLY_OUT);
  });

  it("resolves zoom keys by printable key and numpad code", () => {
    expect(resolveNavigationKeyboardShortcutAction(keyEvent("+"))).toBe(
      NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ZOOM_IN
    );
    expect(
      resolveNavigationKeyboardShortcutAction(
        keyEvent("Subtract", {
          code: "NumpadSubtract",
        })
      )
    ).toBe(NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ZOOM_OUT);
  });

  it("resolves rotate keys by letter and numpad code", () => {
    expect(resolveNavigationKeyboardShortcutAction(keyEvent("q"))).toBe(
      NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_COUNTERCLOCKWISE
    );
    expect(
      resolveNavigationKeyboardShortcutAction(
        keyEvent("7", {
          code: "Numpad7",
        })
      )
    ).toBe(NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_COUNTERCLOCKWISE);
    expect(resolveNavigationKeyboardShortcutAction(keyEvent("e"))).toBe(
      NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_CLOCKWISE
    );
  });

  it("does not resolve disabled actions", () => {
    expect(
      resolveNavigationKeyboardShortcutAction(keyEvent("q"), {
        disabledActions: [
          NAVIGATION_KEYBOARD_SHORTCUT_ACTIONS.ROTATE_COUNTERCLOCKWISE,
        ],
      })
    ).toBeNull();
  });

  it("blocks default-prevented and repeat events unless repeat is allowed", () => {
    expect(
      isManagedNavigationKeyboardEvent(
        keyEvent(".", { defaultPrevented: true })
      )
    ).toBe(false);
    expect(
      isManagedNavigationKeyboardEvent(keyEvent(".", { repeat: true }))
    ).toBe(false);
    expect(
      isManagedNavigationKeyboardEvent(keyEvent(".", { repeat: true }), {
        allowRepeat: true,
      })
    ).toBe(true);
  });
});
