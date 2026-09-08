import { useEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types/types";

import type { Point } from "./annotation-homography";

/**
 * The pointer, rewritten through the inverse of the plane transform.
 *
 * The canvases are drawn through a matrix, so the place the user is pointing
 * at and the place excalidraw thinks they are pointing at are two different
 * points. One capture-phase listener on `window` closes that gap: it runs
 * before anything else sees the event and replaces the coordinates on the
 * event instance itself. `clientX` and its neighbours are prototype accessors,
 * so an own property defined over them shadows the accessor and every reader
 * downstream — excalidraw's canvas handler, its own window handlers, React's
 * synthetic wrapper — reads the rewritten value from the one object.
 *
 * `window` and not the canvas, because a drag does not end on the canvas:
 * excalidraw finishes it on `pointermove` and `pointerup` bound to `window`,
 * and the pointer is usually somewhere else by then. So a drag is armed on
 * `pointerdown` and followed by its `pointerId` until it is let go.
 *
 * Nothing is re-dispatched. A synthetic copy of a pointer event loses its
 * trusted flag, its coalesced events and its ordering against the real stream,
 * and excalidraw would see every gesture twice.
 *
 * What the map wants, the map gets: a right drag, a ctrl drag, a middle drag,
 * the hand tool and a held space bar are not the drawing's gestures. Those are
 * stopped before excalidraw and handed to maplibre, which is the only
 * direction left — the scene no longer drives the camera at all.
 */

/** the buttons maplibre reads a rotate from */
const RIGHT_BUTTON = 2;
const MIDDLE_BUTTON = 1;
const LEFT_BUTTON = 0;

type MapGesture = "pan" | "rotate";

export type UsePlanePointerOptions = {
  map: MaplibreMap | null;
  api: ExcalidrawImperativeAPI | null;
  /** the scene's own box, the plane */
  box: HTMLElement | null;
  enabled: boolean;
  /** a client point moved onto the untransformed plane */
  toPlane: (clientX: number, clientY: number) => Point | null;
};

const define = (event: Event, key: string, value: number) => {
  Object.defineProperty(event, key, {
    value,
    configurable: true,
    enumerable: true,
  });
};

export const usePlanePointer = ({
  map,
  api,
  box,
  enabled,
  toPlane,
}: UsePlanePointerOptions) => {
  const latest = useRef({ api, toPlane });
  latest.current = { api, toPlane };

  useEffect(() => {
    if (!map || !box || !enabled) {
      return;
    }

    const armed = new Set<number>();
    const forwarded = new Set<number>();
    let spaceHeld = false;

    const interactiveCanvas = (): HTMLCanvasElement | null => {
      const canvases = box.getElementsByTagName("canvas");
      for (let index = 0; index < canvases.length; index += 1) {
        const canvas = canvases[index];
        if (
          canvas.classList.contains("excalidraw__canvas") &&
          canvas.classList.contains("interactive")
        ) {
          return canvas;
        }
      }
      return null;
    };

    const patch = (event: MouseEvent) => {
      const rawX = event.clientX;
      const rawY = event.clientY;
      const at = latest.current.toPlane(rawX, rawY);
      if (!at) {
        return;
      }
      // kept beside the rewritten one: anything that resolves a DOM node from
      // the cursor, paste at cursor above all, needs the real position
      define(event, "carmaRawClientX", rawX);
      define(event, "carmaRawClientY", rawY);
      define(event, "clientX", at.x);
      define(event, "clientY", at.y);
      define(event, "x", at.x);
      define(event, "y", at.y);
      define(event, "pageX", at.x + window.scrollX);
      define(event, "pageY", at.y + window.scrollY);
    };

    const stop = (event: Event) => {
      event.stopImmediatePropagation();
      event.stopPropagation();
    };

    const gestureFor = (event: PointerEvent): MapGesture | null => {
      if (event.button === RIGHT_BUTTON) {
        return "rotate";
      }
      if (event.button === MIDDLE_BUTTON) {
        return "pan";
      }
      if (event.button === LEFT_BUTTON && (event.ctrlKey || event.metaKey)) {
        return "rotate";
      }
      if (event.button !== LEFT_BUTTON) {
        return null;
      }
      if (spaceHeld) {
        return "pan";
      }
      return latest.current.api?.getAppState().activeTool.type === "hand"
        ? "pan"
        : null;
    };

    /**
     * maplibre starts a drag from a `mousedown` on its canvas container and
     * finishes it on the document, so handing it the start is enough; the rest
     * of the gesture reaches it on its own. The default action is left alone —
     * cancelling the pointerdown would take the compatibility mouse events
     * with it, and those are what maplibre is waiting for.
     */
    const forwardToMap = (event: PointerEvent, gesture: MapGesture) => {
      const rotate = gesture === "rotate";
      map.getCanvasContainer().dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          button: rotate ? RIGHT_BUTTON : LEFT_BUTTON,
          buttons: rotate ? 2 : 1,
          ctrlKey: false,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: false,
          detail: 1,
        })
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.target !== interactiveCanvas()) {
        return;
      }
      const gesture = gestureFor(event);
      if (gesture) {
        forwarded.add(event.pointerId);
        stop(event);
        forwardToMap(event, gesture);
        return;
      }
      armed.add(event.pointerId);
      patch(event);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (forwarded.has(event.pointerId)) {
        stop(event);
        return;
      }
      if (armed.has(event.pointerId) || event.target === interactiveCanvas()) {
        patch(event);
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (forwarded.has(event.pointerId)) {
        forwarded.delete(event.pointerId);
        stop(event);
        return;
      }
      const wasArmed = armed.delete(event.pointerId);
      if (wasArmed || event.target === interactiveCanvas()) {
        patch(event);
      }
    };

    /** the wheel belongs to the map and carries a client point it reads */
    const onMouse = (event: MouseEvent) => {
      if (event instanceof WheelEvent) {
        return;
      }
      if (event.target === interactiveCanvas()) {
        patch(event);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        spaceHeld = event.type === "keydown";
      }
    };

    const options = { capture: true } as const;
    window.addEventListener("pointerdown", onPointerDown, options);
    window.addEventListener("pointermove", onPointerMove, options);
    window.addEventListener("pointerup", onPointerEnd, options);
    window.addEventListener("pointercancel", onPointerEnd, options);
    window.addEventListener("click", onMouse, options);
    window.addEventListener("dblclick", onMouse, options);
    window.addEventListener("keydown", onKey, options);
    window.addEventListener("keyup", onKey, options);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, options);
      window.removeEventListener("pointermove", onPointerMove, options);
      window.removeEventListener("pointerup", onPointerEnd, options);
      window.removeEventListener("pointercancel", onPointerEnd, options);
      window.removeEventListener("click", onMouse, options);
      window.removeEventListener("dblclick", onMouse, options);
      window.removeEventListener("keydown", onKey, options);
      window.removeEventListener("keyup", onKey, options);
    };
  }, [box, enabled, map]);
};
