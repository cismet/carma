import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVideo } from "@fortawesome/free-solid-svg-icons";

import {
  createRideViewModelScene,
  type RideViewModelScene,
} from "./ride-view-model-scene";
import { RIDE_VIEWS, type RideView } from "./ride-views";
import type { CarShape } from "./track";

import "./VehicleRideViewModel.css";

const VIEWS: Record<RideView, { label: string; key: string; keyName: string }> =
  {
    front: { label: "Vorne", key: "ArrowUp", keyName: "↑" },
    left: { label: "Links", key: "ArrowLeft", keyName: "←" },
    right: { label: "Rechts", key: "ArrowRight", keyName: "→" },
    back: { label: "Hinten", key: "ArrowDown", keyName: "↓" },
    outside: { label: "Außen", key: "a", keyName: "A" },
  };

/** radians the train turns per pixel dragged */
const DRAG_RADIANS_PER_PIXEL = 0.012;
/** how long all camera points stay on show after the visitor last used it */
const AWAKE_MS = 4_000;

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

export type VehicleRideViewModelProps = {
  view: RideView;
  onChange: (view: RideView) => void;
  shape: CarShape;
  bodyColor: string;
  bellowsColor: string;
};

/**
 * Where the camera sits during a ride, chosen on a little model of the train:
 * drag to turn it, click a camera point to look from there. The points are
 * buttons over the canvas, so they are easy to hit and reachable by keyboard.
 */
export const VehicleRideViewModel = ({
  view,
  onChange,
  shape,
  bodyColor,
  bellowsColor,
}: VehicleRideViewModelProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<RideViewModelScene | null>(null);
  const pointRefs = useRef(new Map<RideView, HTMLButtonElement>());
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const [awake, setAwake] = useState(true);
  const sleepTimerRef = useRef<number | undefined>(undefined);
  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = window.setTimeout(
      () => setAwake(false),
      AWAKE_MS
    );
  }, []);

  /** straight to the DOM: this runs on every pointer move of a drag */
  const placePoints = useCallback(() => {
    for (const marker of sceneRef.current?.getMarkers() ?? []) {
      const point = pointRefs.current.get(marker.view);
      if (point) {
        point.style.transform = `translate(${marker.x}px, ${marker.y}px) translate(-50%, -50%)`;
        point.style.zIndex = String(Math.round(marker.depth) + 100);
        point.dataset.behind = String(marker.behind);
      }
    }
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }
    // a new one each time: disposing the scene loses the context of its canvas
    const canvas = document.createElement("canvas");
    canvas.className = "carma-vehicle-model__canvas";
    root.prepend(canvas);
    const scene = createRideViewModelScene({
      canvas,
      shape,
      bodyColor,
      bellowsColor,
    });
    sceneRef.current = scene;
    scene.setView(viewRef.current);
    const fit = (): void => {
      scene.setSize(root.clientWidth, root.clientHeight);
      placePoints();
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => {
      observer.disconnect();
      sceneRef.current = null;
      scene.dispose();
      canvas.remove();
    };
  }, [shape, bodyColor, bellowsColor, placePoints]);

  useEffect(() => {
    sceneRef.current?.setView(view);
    wake();
    return () => window.clearTimeout(sleepTimerRef.current);
  }, [view, wake]);

  // on the window, ahead of the ride's input blocker on the map's container
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      ) {
        return;
      }
      const pressed = RIDE_VIEWS.find(
        (candidate) =>
          VIEWS[candidate].key.toLowerCase() === event.key.toLowerCase()
      );
      if (pressed) {
        event.preventDefault();
        onChange(pressed);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onChange]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    wake();
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    sceneRef.current?.rotate(
      (event.clientX - drag.x) * DRAG_RADIANS_PER_PIXEL,
      (event.clientY - drag.y) * DRAG_RADIANS_PER_PIXEL
    );
    dragRef.current = { x: event.clientX, y: event.clientY };
    placePoints();
    wake();
  };

  const endDrag = (): void => {
    dragRef.current = null;
  };

  return (
    <div
      ref={rootRef}
      className="carma-vehicle-model"
      role="group"
      aria-label="Ansicht"
      data-awake={awake}
      data-testid="vehicle-ride-view-model"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {RIDE_VIEWS.map((candidate) => {
        const { label, keyName } = VIEWS[candidate];
        return (
          <button
            key={candidate}
            ref={(element) => {
              if (element) {
                pointRefs.current.set(candidate, element);
              } else {
                pointRefs.current.delete(candidate);
              }
            }}
            type="button"
            className="carma-vehicle-model__point"
            aria-pressed={candidate === view}
            aria-label={label}
            title={`${label} (${keyName})`}
            onClick={() => onChange(candidate)}
          >
            <span className="carma-vehicle-model__dot">
              <FontAwesomeIcon
                icon={faVideo}
                className="carma-vehicle-model__icon"
              />
            </span>
          </button>
        );
      })}
      <div className="carma-vehicle-model__caption">{VIEWS[view].label}</div>
    </div>
  );
};
