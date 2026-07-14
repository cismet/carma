import { afterEach, describe, expect, it, vi } from "vitest";

import {
  POINTER_DRAG_SESSION_END_REASONS,
  beginPointerDragSession,
} from "./pointer-drag-session";

describe("beginPointerDragSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks moves and releases until cleanup", () => {
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    Object.defineProperty(documentTarget, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("document", documentTarget);

    const onMove = vi.fn();
    const onEnd = vi.fn();
    const session = beginPointerDragSession({ onMove, onEnd });

    windowTarget.dispatchEvent(new Event("mousemove"));
    windowTarget.dispatchEvent(new Event("mouseup"));

    expect(onMove).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledWith({
      reason: POINTER_DRAG_SESSION_END_REASONS.RELEASE,
    });

    session.cleanup();
    windowTarget.dispatchEvent(new Event("mousemove"));
    windowTarget.dispatchEvent(new Event("mouseup"));

    expect(onMove).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
