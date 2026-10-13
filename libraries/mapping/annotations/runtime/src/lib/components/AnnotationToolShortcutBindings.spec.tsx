// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnotationToolPlugin } from "../registry";

const runtime = vi.hoisted(() => ({
  activeToolType: "select",
  requestModeChange: vi.fn(),
}));

vi.mock("../context/AnnotationsProvider", () => ({
  useAnnotationsRuntime: () => runtime,
}));

import { AnnotationToolShortcutBindings } from "./AnnotationToolShortcutBindings";

const plugin = (id: string, order: number, shortcutKey: string) =>
  ({
    id,
    kind: id === "select" ? "interaction" : "measurement",
    descriptor: { id, order, label: id, shortcutKey },
  } as unknown as AnnotationToolPlugin);

const plugins = [plugin("select", 0, "s"), plugin("distance", 1, "d")];

describe("AnnotationToolShortcutBindings", () => {
  beforeEach(() => {
    runtime.activeToolType = "select";
    runtime.requestModeChange.mockReset();
  });

  it("switches to the tool whose shortcut key is pressed", () => {
    render(<AnnotationToolShortcutBindings plugins={plugins} />);

    fireEvent.keyDown(window, { key: "d" });

    expect(runtime.requestModeChange).toHaveBeenCalledWith("distance");
  });

  it("ignores keys of tools the host does not show", () => {
    render(<AnnotationToolShortcutBindings plugins={[plugins[0]]} />);

    fireEvent.keyDown(window, { key: "d" });

    expect(runtime.requestModeChange).not.toHaveBeenCalled();
  });

  it("does nothing for the active tool nor while disabled", () => {
    const { rerender } = render(
      <AnnotationToolShortcutBindings plugins={plugins} />
    );
    fireEvent.keyDown(window, { key: "s" });
    expect(runtime.requestModeChange).not.toHaveBeenCalled();

    rerender(
      <AnnotationToolShortcutBindings plugins={plugins} enabled={false} />
    );
    fireEvent.keyDown(window, { key: "d" });
    expect(runtime.requestModeChange).not.toHaveBeenCalled();
  });

  it("stops listening when it unmounts", () => {
    const { unmount } = render(
      <AnnotationToolShortcutBindings plugins={plugins} />
    );
    unmount();

    fireEvent.keyDown(window, { key: "d" });

    expect(runtime.requestModeChange).not.toHaveBeenCalled();
  });
});
