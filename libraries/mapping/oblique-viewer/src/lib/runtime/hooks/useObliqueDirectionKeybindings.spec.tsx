import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OBLIQUE_NAVIGATION_KEYS as KEYS } from "../oblique-actions";
import { useObliqueDirectionKeybindings } from "./useObliqueDirectionKeybindings";

const press = (
  key: string,
  code: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window
) => {
  const event = new KeyboardEvent("keydown", {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("prepared image direction shortcuts", () => {
  it.each([
    ["w", "KeyW", KEYS.Up],
    ["a", "KeyA", KEYS.Left],
    ["s", "KeyS", KEYS.Down],
    ["D", "KeyD", KEYS.Right],
    ["ArrowUp", "ArrowUp", KEYS.Up],
    ["ArrowLeft", "ArrowLeft", KEYS.Left],
    ["ArrowDown", "ArrowDown", KEYS.Down],
    ["ArrowRight", "ArrowRight", KEYS.Right],
    ["8", "Numpad8", KEYS.Up],
    ["4", "Numpad4", KEYS.Left],
    ["ArrowDown", "Numpad2", KEYS.Down],
    ["6", "Numpad6", KEYS.Right],
    ["Home", "Numpad7", KEYS.RotateLeft],
    ["PageUp", "Numpad9", KEYS.RotateRight],
    ["q", "KeyQ", KEYS.RotateLeft],
    ["R", "KeyR", KEYS.RotateRight],
  ] as const)(
    "routes %s/%s to cached %s and permits held directions",
    (key, code, direction) => {
      const navigate = vi.fn();
      renderHook(() =>
        useObliqueDirectionKeybindings({ onNavigate: navigate })
      );
      expect(press(key, code).defaultPrevented).toBe(true);
      expect(press(key, code, { repeat: true }).defaultPrevented).toBe(true);
      expect(navigate.mock.calls).toEqual([[direction], [direction]]);
    }
  );

  it("claims Numpad5 only for an optional Nadir action and preserves every repeated toggle", () => {
    const navigate = vi.fn(),
      nadir = vi.fn();
    const view = renderHook(
      ({ onNadir }) =>
        useObliqueDirectionKeybindings({ onNavigate: navigate, onNadir }),
      { initialProps: { onNadir: undefined as (() => void) | undefined } }
    );
    expect(press("5", "Numpad5").defaultPrevented).toBe(false);
    view.rerender({ onNadir: nadir });
    expect(press("Clear", "Numpad5").defaultPrevented).toBe(true);
    expect(press("Clear", "Numpad5", { repeat: true }).defaultPrevented).toBe(
      true
    );
    expect(nadir).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves top-row5/1/3 and unbound numpad1/3 untouched", () => {
    const navigate = vi.fn(),
      nadir = vi.fn();
    renderHook(() =>
      useObliqueDirectionKeybindings({ onNavigate: navigate, onNadir: nadir })
    );
    for (const [key, code] of [
      ["5", "Digit5"],
      ["1", "Digit1"],
      ["3", "Digit3"],
      ["End", "Numpad1"],
      ["PageDown", "Numpad3"],
    ])
      expect(press(key, code).defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(nadir).not.toHaveBeenCalled();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Alt", { altKey: true }],
    ["Meta", { metaKey: true }],
    ["IME", { isComposing: true }],
    ["already prevented", {}],
  ] as const)("does not claim %s events", (name, init) => {
    const navigate = vi.fn();
    renderHook(() => useObliqueDirectionKeybindings({ onNavigate: navigate }));
    const event = new KeyboardEvent("keydown", {
      key: "w",
      code: "KeyW",
      bubbles: true,
      cancelable: true,
      ...init,
    });
    if (name === "already prevented") event.preventDefault();
    const prevent = vi.spyOn(event, "preventDefault"),
      stop = vi.spyOn(event, "stopPropagation");
    window.dispatchEvent(event);
    expect(navigate).not.toHaveBeenCalled();
    expect(prevent).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it("leaves editable targets, descendants and focused inputs to their editor", () => {
    const navigate = vi.fn();
    renderHook(() => useObliqueDirectionKeybindings({ onNavigate: navigate }));
    for (const tag of ["input", "textarea", "select", "div"]) {
      const root = document.createElement(tag),
        child = document.createElement("span");
      if (tag === "div") {
        root.setAttribute("contenteditable", "true");
        root.append(child);
      }
      document.body.append(root);
      try {
        expect(
          press("w", "KeyW", {}, tag === "div" ? child : root).defaultPrevented
        ).toBe(false);
      } finally {
        root.remove();
      }
    }
    const input = document.createElement("input");
    document.body.append(input);
    try {
      input.focus();
      expect(document.activeElement).toBe(input);
      expect(press("w", "KeyW").defaultPrevented).toBe(false);
    } finally {
      input.remove();
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it("captures arrows before native map keyboard bubbling and restores it on cleanup", () => {
    const navigate = vi.fn(),
      nativeMapKey = vi.fn(),
      canvas = document.createElement("div");
    document.body.append(canvas);
    canvas.addEventListener("keydown", nativeMapKey);
    const view = renderHook(() =>
      useObliqueDirectionKeybindings({ onNavigate: navigate })
    );
    try {
      expect(press("ArrowUp", "ArrowUp", {}, canvas).defaultPrevented).toBe(
        true
      );
      expect(navigate).toHaveBeenCalledWith(KEYS.Up);
      expect(nativeMapKey).not.toHaveBeenCalled();
      view.unmount();
      expect(press("ArrowUp", "ArrowUp", {}, canvas).defaultPrevented).toBe(
        false
      );
      expect(nativeMapKey).toHaveBeenCalledOnce();
    } finally {
      canvas.removeEventListener("keydown", nativeMapKey);
      canvas.remove();
    }
  });

  it("refreshes callbacks without listener churn and removes its capture listener when disabled", () => {
    const add = vi.spyOn(window, "addEventListener"),
      remove = vi.spyOn(window, "removeEventListener"),
      first = vi.fn(),
      second = vi.fn();
    const view = renderHook(
      ({ enabled, onNavigate }) =>
        useObliqueDirectionKeybindings({ enabled, onNavigate }),
      { initialProps: { enabled: true, onNavigate: first } }
    );
    const adds = () =>
      add.mock.calls.filter(
        ([name, , capture]) => name === "keydown" && capture === true
      );
    expect(adds()).toHaveLength(1);
    const listener = adds()[0][1];
    press("w", "KeyW");
    view.rerender({ enabled: true, onNavigate: second });
    press("w", "KeyW");
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith(KEYS.Up);
    expect(adds()).toHaveLength(1);
    expect(
      remove.mock.calls.filter(([name]) => name === "keydown")
    ).toHaveLength(0);
    view.rerender({ enabled: false, onNavigate: second });
    expect(remove).toHaveBeenCalledWith("keydown", listener, true);
    expect(press("w", "KeyW").defaultPrevented).toBe(false);
    expect(second).toHaveBeenCalledOnce();
  });
});

describe("rotation shortcuts require the complete catalog", () => {
  it("blocks Q/R/Num7/Num9 without enqueuing, keeps pan and Nadir independent, then enables rotation without listener churn", () => {
    const navigate = vi.fn(),
      nadir = vi.fn(),
      add = vi.spyOn(window, "addEventListener");
    const view = renderHook(
      ({ rotationEnabled }) =>
        useObliqueDirectionKeybindings({
          onNavigate: navigate,
          onNadir: nadir,
          rotationEnabled,
        }),
      { initialProps: { rotationEnabled: false } }
    );
    for (const [key, code] of [
      ["q", "KeyQ"],
      ["r", "KeyR"],
      ["Home", "Numpad7"],
      ["PageUp", "Numpad9"],
    ])
      expect(press(key, code).defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    press("w", "KeyW");
    expect(navigate).toHaveBeenCalledWith(KEYS.Up);
    press("Clear", "Numpad5");
    expect(nadir).toHaveBeenCalledOnce();
    view.rerender({ rotationEnabled: true });
    press("r", "KeyR");
    expect(navigate).toHaveBeenLastCalledWith(KEYS.RotateRight);
    expect(
      add.mock.calls.filter(
        ([name, , capture]) => name === "keydown" && capture === true
      )
    ).toHaveLength(1);
  });
});
