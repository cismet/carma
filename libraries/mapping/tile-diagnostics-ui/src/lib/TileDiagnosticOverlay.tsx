import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { Camera } from "three";
import type { Tile } from "3d-tiles-renderer/core";
import type {
  TileDiagnostics,
  TileDiagnosticOverlayInput,
  TileDiagnosticView,
  TileCameraSnapshot,
} from "@carma-mapping/engines/maplibre";

type Props = Omit<TileDiagnosticOverlayInput, "model" | "view"> & {
  subscribeModel: (
    listener: (model: TileDiagnosticOverlayInput["model"]) => void
  ) => () => void;
  freeView: TileDiagnosticView | null;
  up: string;
  subscribeCamera: (
    listener: (camera: Camera, cameras: readonly TileCameraSnapshot[]) => void
  ) => () => void;
  interactive: boolean;
  onViewChange: (view: TileDiagnosticView | null) => void;
  onOrbitChange?: (
    orbit: NonNullable<TileDiagnosticOverlayInput["orbit"]>
  ) => void;
  onReset?: () => void;
  onHover: (tile: Tile | null) => void;
};

/** Story UI only. Snapshot serialization, scheduling and rendering belong to the library. */
export const createTileDiagnosticOverlayComponent = ({
  createTileDiagnosticOverlay,
  diagnosticProjection,
  hitTestDiagnosticLabel,
}: TileDiagnostics) => {
  const TileDiagnosticOverlay = (input: Props) => {
    const [localOrbit, setLocalOrbit] = useState(
      input.orbit ?? { yaw: 0, pitch: 0 }
    );
    const orbitRef = useRef(localOrbit);
    useEffect(() => {
      if (!input.orbit) return;
      orbitRef.current = input.orbit;
      setLocalOrbit(input.orbit);
    }, [input.orbit]);
    const [model, setModel] = useState<TileDiagnosticOverlayInput["model"]>({
      width: 1,
      height: 1,
      rects: [],
      extent: null,
      intersectionEdges: null,
      centerHit: null,
      footprintBounds: null,
      target: 0,
    });
    useEffect(
      () =>
        input.subscribeModel((next) => {
          startTransition(() => setModel(next));
        }),
      [input.subscribeModel]
    );
    const view = useMemo(() => {
      const full = { x: 0, y: 0, w: model.width || 1, h: model.height || 1 };
      if (!input.followCamera) return input.freeView ?? full;
      const bounds = model.footprintBounds;
      const center = model.centerHit;
      if (!bounds || !center) return full;
      const size =
        Math.max(
          bounds.maxX - bounds.minX,
          bounds.maxY - bounds.minY,
          Number.EPSILON
        ) *
        (Math.max(100, input.followPaddingPercent ?? 200) / 100);
      const aspect = full.w / full.h;
      const w = aspect >= 1 ? size * aspect : size;
      const h = aspect >= 1 ? size : size / aspect;
      return { x: center[0] - w / 2, y: center[1] - h / 2, w, h };
    }, [model, input.followCamera, input.freeView, input.followPaddingPercent]);
    const props = { ...input, orbit: localOrbit, model, view };
    const host = useRef<HTMLDivElement>(null);
    const controller = useRef<ReturnType<
      typeof createTileDiagnosticOverlay
    > | null>(null);
    const latest = useRef(props);
    latest.current = props;
    const drag = useRef<{
      x: number;
      y: number;
      scale: number;
      view: TileDiagnosticView;
      orbit: NonNullable<TileDiagnosticOverlayInput["orbit"]>;
      mode: "pan" | "orbit";
    } | null>(null);
    const [status, setStatus] = useState<{ ready: boolean; error?: string }>({
      ready: false,
    });
    useEffect(() => {
      if (!host.current) return;
      const overlay = createTileDiagnosticOverlay(host.current, {
        onStatus: setStatus,
      });
      controller.current = overlay;
      overlay.update(latest.current);
      const unsubscribe = latest.current.subscribeCamera((camera, cameras) =>
        overlay.updateCamera(camera, latest.current.updateOnRender, cameras)
      );
      return () => {
        unsubscribe();
        controller.current = null;
        overlay.dispose();
      };
    }, []);
    useEffect(() => {
      controller.current?.update(props);
    }, [
      props.model,
      props.view,
      props.popout,
      props.opacity,
      props.labels,
      props.hover,
      props.interactive,
      props.followCamera,
      props.cameraFocus,
      props.followPaddingPercent,
      props.showFrustum,
      props.orbit,
      props.updateOnRender,
    ]);
    useEffect(() => {
      const element = host.current;
      const parent = element?.parentElement;
      if (!element || !parent || props.labels === "none") return;
      let previous: Tile | null = null;
      const move = (event: PointerEvent) => {
        const { model, view, onHover } = latest.current;
        const bounds = element.getBoundingClientRect();
        const match = hitTestDiagnosticLabel(
          model,
          view,
          bounds.width,
          bounds.height,
          event.clientX - bounds.left,
          event.clientY - bounds.top
        );
        if (match !== previous) {
          previous = match;
          onHover(previous);
        }
      };
      const leave = () => {
        previous = null;
        latest.current.onHover(null);
      };
      parent.addEventListener("pointermove", move, { passive: true });
      parent.addEventListener("pointerleave", leave);
      return () => {
        parent.removeEventListener("pointermove", move);
        parent.removeEventListener("pointerleave", leave);
      };
    }, [props.labels]);

    const finishDrag = () => {
      if (drag.current?.mode === "orbit")
        latest.current.onOrbitChange?.(orbitRef.current);
      drag.current = null;
    };
    const activeView = (element: HTMLElement): TileDiagnosticView => {
      if (!latest.current.followCamera) return latest.current.view;
      const values = element.dataset.projectedView?.split(" ").map(Number);
      return values?.length === 4 && values.every(Number.isFinite)
        ? { x: values[0], y: values[1], w: values[2], h: values[3] }
        : latest.current.view;
    };

    return (
      <>
        <div
          ref={host}
          data-test-id="tile-diagnostic-worker-overlay"
          data-renderer={
            status.ready
              ? "typegpu-worker"
              : status.error
              ? "unavailable"
              : "loading"
          }
          data-presentation={props.popout ? "popout" : "map"}
          data-up={props.up}
          data-orbit={`${props.orbit?.yaw ?? 0} ${props.orbit?.pitch ?? 0}`}
          data-view={`${props.view.x} ${props.view.y} ${props.view.w} ${props.view.h}`}
          role="img"
          aria-label="Tile loading diagnostic overview"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: props.interactive ? "auto" : "none",
            cursor: props.interactive ? "grab" : undefined,
            touchAction: "none",
            background: props.popout ? "#30363d" : undefined,
          }}
          onContextMenu={(event) => {
            if (props.interactive) event.preventDefault();
          }}
          onWheel={(event) => {
            if (!props.interactive) return;
            event.preventDefault();
            const view = activeView(event.currentTarget);
            const bounds = event.currentTarget.getBoundingClientRect();
            const { scale, offsetX, offsetY } = diagnosticProjection(
              view,
              bounds.width,
              bounds.height
            );
            const x = (event.clientX - bounds.left - offsetX) / scale,
              y = (event.clientY - bounds.top - offsetY) / scale;
            const factor = Math.exp(
              Math.max(-2, Math.min(2, event.deltaY * 0.002))
            );
            const w = Math.max(0.001, Math.min(1e12, view.w * factor)),
              h = (w * view.h) / view.w;
            const actual = w / view.w;
            props.onViewChange({
              x: x - (x - view.x) * actual,
              y: y - (y - view.y) * actual,
              w,
              h,
            });
          }}
          onPointerDown={(event) => {
            if (
              !props.interactive ||
              (event.button !== 0 && event.button !== 2)
            )
              return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const bounds = event.currentTarget.getBoundingClientRect();
            const view = activeView(event.currentTarget);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              view,
              orbit: orbitRef.current,
              mode: event.button === 2 || event.ctrlKey ? "orbit" : "pan",
              scale: diagnosticProjection(view, bounds.width, bounds.height)
                .scale,
            };
          }}
          onPointerMove={(event) => {
            if (!drag.current || !props.interactive) return;
            const start = drag.current;
            if (start.mode === "orbit") {
              const next = {
                yaw: start.orbit.yaw + (event.clientX - start.x) * 0.005,
                pitch: Math.max(
                  -1.55,
                  Math.min(
                    1.55,
                    start.orbit.pitch + (event.clientY - start.y) * 0.005
                  )
                ),
              };
              orbitRef.current = next;
              setLocalOrbit(next);
            } else {
              props.onViewChange({
                ...start.view,
                x: start.view.x - (event.clientX - start.x) / start.scale,
                y: start.view.y - (event.clientY - start.y) / start.scale,
              });
            }
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
          onDoubleClick={() => {
            const reset = { yaw: 0, pitch: 0 };
            orbitRef.current = reset;
            setLocalOrbit(reset);
            props.onReset ? props.onReset() : props.onViewChange(null);
          }}
        />
        {status.error && (
          <output
            role="status"
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              color: "#a40000",
              background: "white",
              padding: 4,
            }}
          >
            {status.error}
          </output>
        )}
      </>
    );
  };
  return TileDiagnosticOverlay;
};
