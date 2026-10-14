import { afterEach, describe, expect, it, vi } from "vitest";
import { forwardWheelToCanvas } from "./point-move-gizmo-dom";
const payload = {
  deltaX: 12,
  deltaY: -45,
  deltaZ: 6,
  deltaMode: 1,
  clientX: 321,
  clientY: 234,
};
afterEach(() => document.body.replaceChildren());
describe("gizmo wheel forwarding", () => {
  it("preserves the exact legacy two-argument event payload and non-bubbling defaults", () => {
    const container = document.createElement("div"),
      canvas = document.createElement("canvas");
    container.append(canvas);
    document.body.append(container);
    const seen: WheelEvent[] = [];
    canvas.addEventListener("wheel", (event) => seen.push(event));
    const bubble = vi.fn();
    container.addEventListener("wheel", bubble);
    const original = new WheelEvent("wheel", {
      ...payload,
      bubbles: true,
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      metaKey: true,
    });
    forwardWheelToCanvas(canvas, original);
    expect(seen).toHaveLength(1);
    const forwarded = seen[0]!;
    for (const [key, value] of Object.entries(payload))
      expect(forwarded[key as keyof typeof payload]).toBe(value);
    expect(forwarded.bubbles).toBe(false);
    expect(forwarded.cancelable).toBe(true);
    expect(forwarded.ctrlKey).toBe(false);
    expect(forwarded.altKey).toBe(false);
    expect(forwarded.shiftKey).toBe(false);
    expect(forwarded.metaKey).toBe(false);
    expect(bubble).not.toHaveBeenCalled();
    expect(original.defaultPrevented).toBe(false);
  });
  it("allows an explicit Three overlay event to reach the map container with its modifiers", () => {
    const container = document.createElement("div"),
      canvas = document.createElement("canvas");
    container.append(canvas);
    document.body.append(container);
    const seen: WheelEvent[] = [];
    container.addEventListener("wheel", (event) => seen.push(event));
    forwardWheelToCanvas(canvas, new WheelEvent("wheel", payload), {
      bubbles: true,
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      metaKey: true,
    });
    expect(seen).toHaveLength(1);
    const event = seen[0]!;
    expect(event.target).toBe(canvas);
    for (const [key, value] of Object.entries(payload))
      expect(event[key as keyof typeof payload]).toBe(value);
    expect(
      event.ctrlKey && event.altKey && event.shiftKey && event.metaKey
    ).toBe(true);
  });
});
