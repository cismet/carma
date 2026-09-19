import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  TILE_DIAGNOSTIC_STEPS,
  acquireSharedThreeScene,
  registerSharedThreeSceneRuntime,
  type SharedThreeSceneFrame,
  type SharedThreeSceneRuntime,
  type SharedThreeSceneTileVolume,
  type TileCameraSnapshot,
  type TileDiagnosticModel as OverlayModel,
  type TileDiagnostics,
} from "@carma-mapping/engines/maplibre";
import { createPortal } from "react-dom";
import { Button } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCrosshairs,
  faLayerGroup,
  faTableCells,
  faUpRightFromSquare,
  faVectorSquare,
} from "@fortawesome/free-solid-svg-icons";
import { createTileDiagnosticOverlayComponent } from "./TileDiagnosticOverlay";
import { DiagnosticPanel } from "./DiagnosticPanel";
import { DiagnosticWindow } from "./DiagnosticWindow";
import { snapshotShadowCorridorCameras } from "./shadow-corridor-camera";

const RUNTIME_ID = "volume-tile-diagnostics";
/** Volumes carry no LOD error, so the error label has nothing to show. */
const LABEL_MODES = ["none", "id", "id and stats"] as const;
const LABEL_TITLES = {
  none: "ohne Beschriftung",
  id: "Kachel-ID",
  "id and stats": "ID, Grosse, Zeit, Perzentil",
} as const;
const WIDTH = 360;
const HEIGHT = 300;
/** The model is geometry work; the camera is a matrix copy and stays live. */
const REBUILD_INTERVAL_MS = 250;

export type VolumeTileDiagnosticsProps = {
  map: MapLibreMap;
  onClose?: () => void;
};

/**
 * The tile overview for sources that have no 3D Tiles tree to frame it, so a
 * session with terrain alone can still be inspected: the runtimes hand over
 * their tile boxes, the main camera and the shadow corridor cut them.
 */
export const createVolumeTileDiagnostics = (diagnostics: TileDiagnostics) => {
  const Overlay = createTileDiagnosticOverlayComponent(diagnostics);

  const VolumeTileDiagnostics = ({
    map,
    onClose,
  }: VolumeTileDiagnosticsProps) => {
    const modelListeners = useRef(new Set<(model: OverlayModel) => void>());
    const cameraListeners = useRef(
      new Set<
        (camera: THREE.Camera, cameras: readonly TileCameraSnapshot[]) => void
      >()
    );
    const latestModel = useRef<OverlayModel | null>(null);
    const liveCamera = useRef<THREE.Camera | null>(null);
    const liveCameras = useRef<readonly TileCameraSnapshot[]>([]);
    const [tileCount, setTileCount] = useState<number | null>(null);
    /** What each camera asks for: tiles cut by the view and by the corridor. */
    /** What the pies and the size grid stand for, read off the drawn cut. */
    const [legendAt, setLegendAt] = useState({ left: 6, top: 6 });
    const legendDrag = useRef<{
      x: number;
      y: number;
      left: number;
      top: number;
    } | null>(null);
    const [legend, setLegend] = useState<{
      medianMs: number;
      steps: {
        label: string;
        color: string;
        avg: number;
        min: number;
        max: number;
      }[];
      bytes: { unit: number; min: number; max: number } | null;
    } | null>(null);
    const [demand, setDemand] = useState({
      view: 0,
      corridor: 0,
      loading: 0,
      backlog: 0,
    });
    const [labels, setLabels] = useState<(typeof LABEL_MODES)[number]>("none");
    const [followFrustums, setFollowFrustums] = useState(true);
    /** Where the overview is drawn: in its panel, over the map, or popped out. */
    const [mode, setMode] = useState<"panel" | "map" | "window">("panel");
    /** Over the map: the camera's own projection, or a padded plan view. */
    const [mapProjection, setMapProjection] = useState<"camera" | "plan">(
      "camera"
    );
    const hostRef = useRef<HTMLDivElement | null>(null);
    const size = useRef({ width: WIDTH, height: HEIGHT });
    const projectionRef = useRef<"camera" | "plan">("camera");
    projectionRef.current = mode === "map" ? mapProjection : "plan";

    const subscribeModel = useCallback(
      (listener: (model: OverlayModel) => void) => {
        modelListeners.current.add(listener);
        if (latestModel.current) listener(latestModel.current);
        return () => {
          modelListeners.current.delete(listener);
        };
      },
      []
    );
    const subscribeCamera = useCallback(
      (
        listener: (
          camera: THREE.Camera,
          cameras: readonly TileCameraSnapshot[]
        ) => void
      ) => {
        cameraListeners.current.add(listener);
        if (liveCamera.current)
          listener(liveCamera.current, liveCameras.current);
        return () => {
          cameraListeners.current.delete(listener);
        };
      },
      []
    );

    useEffect(() => {
      const lease = acquireSharedThreeScene(map);
      let disposed = false;
      let renderCamera: THREE.Camera | null = null;
      let corridor: readonly TileCameraSnapshot[] = [];
      let work: (() => void) | null = null;
      let rebuiltAt = 0;
      const collect = (): readonly SharedThreeSceneTileVolume[] =>
        lease.layer
          .getRuntimes()
          .filter(
            (runtime) =>
              runtime.id !== RUNTIME_ID && runtime.getActiveTileVolumes
          )
          .flatMap((runtime) => runtime.getActiveTileVolumes?.() ?? []);
      const publish = () => {
        work = null;
        if (disposed || !renderCamera) return;
        renderCamera.updateWorldMatrix(true, false);
        liveCamera.current = renderCamera;
        liveCameras.current = corridor;
        for (const listener of cameraListeners.current)
          listener(renderCamera, corridor);
        const now = performance.now();
        if (now - rebuiltAt < REBUILD_INTERVAL_MS) return;
        rebuiltAt = now;
        const volumes = collect();
        setTileCount(volumes.length);
        const model = diagnostics.buildVolumeOverlayModel({
          projection: projectionRef.current,
          volumes,
          camera: {
            id: "overview-live",
            projectionMatrix: renderCamera.projectionMatrix.toArray(),
            matrixWorld: renderCamera.matrixWorld.toArray(),
            coordinateSystem: renderCamera.coordinateSystem,
            reversedDepth: renderCamera.reversedDepth,
            viewport: [size.current.width, size.current.height],
            errorTargetPixels: 1,
            role: "receiver",
          },
          shadowCamera: corridor[0] ?? null,
          width: size.current.width,
          height: size.current.height,
        });
        if (!model) return;
        // What the marks stand for, measured on the cut that is drawn.
        const perStep = new Map<
          string,
          { sum: number; count: number; min: number; max: number }
        >();
        const totals: number[] = [];
        const sizes: number[] = [];
        for (const volume of volumes) {
          const steps = volume.steps ?? [];
          const total = steps.reduce((sum, step) => sum + step.ms, 0);
          if (total > 0) totals.push(total);
          if (volume.bytes) sizes.push(volume.bytes);
          for (const step of steps) {
            const entry = perStep.get(step.label) ?? {
              sum: 0,
              count: 0,
              min: Infinity,
              max: 0,
            };
            entry.sum += step.ms;
            entry.count += 1;
            entry.min = Math.min(entry.min, step.ms);
            entry.max = Math.max(entry.max, step.ms);
            perStep.set(step.label, entry);
          }
        }
        totals.sort((a, b) => a - b);
        let unit = 1024;
        const largest = sizes.length ? Math.max(...sizes) : 0;
        while (largest / unit > 100) unit *= 10;
        setLegend({
          medianMs: totals.length ? totals[totals.length >> 1] : 0,
          steps: TILE_DIAGNOSTIC_STEPS.flatMap((step) => {
            const entry = perStep.get(step.label);
            return entry
              ? [
                  {
                    label: step.label,
                    color: step.color,
                    avg: entry.sum / entry.count,
                    min: entry.min,
                    max: entry.max,
                  },
                ]
              : [];
          }),
          bytes: sizes.length
            ? { unit, min: Math.min(...sizes), max: largest }
            : null,
        });
        setDemand({
          view: (model.volumes ?? []).filter((volume) => volume.inView).length,
          corridor: (model.volumes ?? []).filter((volume) => volume.inShadow)
            .length,
          loading: volumes.filter((volume) => volume.state === "loading")
            .length,
          // What the runtimes still owe before this view converges: a queue
          // that never drains points at the bottleneck, one that sits at zero
          // while tiles are missing points somewhere else.
          backlog: lease.layer
            .getRuntimes()
            .reduce(
              (total, other) =>
                total +
                (other.id === RUNTIME_ID ? 0 : other.getRequestDemand?.() ?? 0),
              0
            ),
        });
        latestModel.current = model;
        for (const listener of modelListeners.current) listener(model);
      };
      const schedule = () => {
        if (!work) work = diagnostics.scheduleTileDiagnosticTask(publish, true);
      };
      const runtime: SharedThreeSceneRuntime = {
        id: RUNTIME_ID,
        originLngLat: [map.getCenter().lng, map.getCenter().lat],
        root: new THREE.Group(),
        update(frame: SharedThreeSceneFrame) {
          renderCamera = frame.renderCamera;
          schedule();
        },
        setShadowView(view) {
          corridor = snapshotShadowCorridorCameras(view);
          rebuiltAt = 0;
          schedule();
        },
        // The committed corridor stops while the map moves; this one does not,
        // and the overview draws the light where it actually is.
        setLiveShadowView(view) {
          corridor = snapshotShadowCorridorCameras(view);
          // The cut of every tile changes with the light, so rebuild the model
          // too rather than only redrawing the corridor's own outline.
          rebuiltAt = 0;
          schedule();
        },
        dispose() {
          modelListeners.current.clear();
          cameraListeners.current.clear();
        },
      };
      lease.layer.addRuntime(runtime);
      // The layer draws a runtime; the scene registry is what the shadow
      // simulation walks to hand out its corridor, so join both.
      const unregister = registerSharedThreeSceneRuntime(map, runtime);
      // The model is built for the size it is drawn at, so a resized panel or
      // the whole map both get a cut that fills them.
      const observer = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (!rect || rect.width < 8 || rect.height < 8) return;
        size.current = {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        rebuiltAt = 0;
        schedule();
      });
      if (hostRef.current) observer.observe(hostRef.current);
      map.triggerRepaint();
      return () => {
        disposed = true;
        work = null;
        observer.disconnect();
        unregister();
        lease.layer.removeRuntime(RUNTIME_ID);
        lease.release();
      };
    }, [map, mode]);

    const overview = (
      <div
        ref={hostRef}
        style={
          mode === "panel"
            ? {
                position: "relative",
                width: WIDTH,
                height: HEIGHT,
                minWidth: 200,
                minHeight: 160,
                // Native grip: the overlay follows through its resize observer.
                resize: "both",
                overflow: "hidden",
                background: "rgb(12 18 32 / 86%)",
              }
            : {
                position: mode === "map" ? "absolute" : "relative",
                inset: mode === "map" ? 0 : undefined,
                width: mode === "map" ? undefined : "100%",
                height: mode === "map" ? undefined : "100%",
                background:
                  mode === "map" ? "transparent" : "rgb(12 18 32 / 86%)",
              }
        }
      >
        <Overlay
          subscribeModel={subscribeModel}
          subscribeCamera={subscribeCamera}
          freeView={null}
          up="tileset"
          interactive={false}
          onViewChange={() => undefined}
          onHover={() => undefined}
          opacity={1}
          // Over the map the marks stay unfilled, as the debugger's map mode.
          popout={mode !== "map"}
          labels={labels}
          hover={null}
          showFrustum={true}
          updateOnRender={true}
          // On, the crop follows the union of every frustum, the main one and
          // the shadow corridor, as the story's overview does. Off, the model
          // frames the tiles the camera sees.
          followCamera={followFrustums}
          cameraFocus="all"
          followPaddingPercent={180}
        />
        {legend && mode !== "map" ? (
          <details
            data-test-id="volume-tile-diagnostics-legend"
            style={{
              position: "absolute",
              left: legendAt.left,
              top: legendAt.top,
              width: 252,
              maxHeight: "70%",
              overflow: "auto",
              background: "rgb(12 18 32 / 92%)",
              color: "#f4fbff",
              font: "11px/1.5 system-ui, sans-serif",
              padding: "2px 6px",
              borderRadius: 3,
              boxShadow: "0 1px 6px rgb(0 0 0 / 45%)",
            }}
          >
            <summary
              // Drag it out of the way: the panel is small and the cut is the
              // thing being read.
              style={{ cursor: "grab", opacity: 0.85, touchAction: "none" }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                const box = event.currentTarget
                  .parentElement as HTMLElement | null;
                if (!box) return;
                legendDrag.current = {
                  x: event.clientX,
                  y: event.clientY,
                  left: box.offsetLeft,
                  top: box.offsetTop,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = legendDrag.current;
                if (!drag) return;
                event.preventDefault();
                setLegendAt({
                  left: Math.max(0, drag.left + event.clientX - drag.x),
                  top: Math.max(0, drag.top + event.clientY - drag.y),
                });
              }}
              onLostPointerCapture={() => {
                legendDrag.current = null;
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            >
              Legende
            </summary>
            <div style={{ opacity: 0.85, marginBottom: 2 }}>
              {`Ring = Median ${Math.round(
                legend.medianMs
              )} ms \u00b7 Flache der Scheibe = Ladezeit dagegen`}
            </div>
            {legend.steps.map((step) => (
              <div
                key={step.label}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: step.color,
                    flex: "0 0 auto",
                  }}
                />
                <span style={{ flex: "1 1 auto" }}>{step.label}</span>
                <span style={{ opacity: 0.85 }}>
                  {`\u00f8 ${Math.round(step.avg)} ms (${Math.round(
                    step.min
                  )}\u2013${Math.round(step.max)})`}
                </span>
              </div>
            ))}
            {legend.bytes ? (
              <div style={{ opacity: 0.85, marginTop: 2 }}>
                {`1 Kastchen = ${Math.round(
                  legend.bytes.unit / 1024
                )} kB \u00b7 Kacheln ${Math.round(
                  legend.bytes.min / 1024
                )}\u2013${Math.round(legend.bytes.max / 1024)} kB`}
              </div>
            ) : null}
          </details>
        ) : null}
        {tileCount === 0 ? (
          <div
            data-test-id="volume-tile-diagnostics-empty"
            style={{ padding: "8px", color: "#f4fbff" }}
          >
            keine Kacheln geladen
          </div>
        ) : null}
      </div>
    );
    const toggle = (
      testId: string,
      icon: typeof faCrosshairs,
      title: string,
      pressed: boolean,
      onClick: () => void
    ) => (
      <Button
        size="small"
        type="text"
        data-test-id={testId}
        aria-label={title}
        aria-pressed={pressed}
        title={title}
        icon={<FontAwesomeIcon icon={icon} />}
        onClick={onClick}
      />
    );
    return (
      <>
        <DiagnosticPanel
          testId="volume-tile-diagnostics"
          title={
            <span>
              {`Kacheln${tileCount === null ? "" : ` ${tileCount}`}`}
              <span
                data-test-id="volume-tile-diagnostics-demand"
                style={{ fontWeight: 400, opacity: 0.75, marginLeft: 6 }}
              >
                {`Sicht ${demand.view} \u00b7 Korridor ${demand.corridor} \u00b7 Laden ${demand.loading} \u00b7 Ruckstand ${demand.backlog}`}
              </span>
            </span>
          }
          actions={
            <>
              {toggle(
                "volume-tile-diagnostics-follow",
                faCrosshairs,
                "Auf die Vereinigung aller Kamerastumpfe zoomen",
                followFrustums,
                () => setFollowFrustums((current) => !current)
              )}
              {toggle(
                "volume-tile-diagnostics-labels",
                faTableCells,
                LABEL_TITLES[labels],
                labels !== "none",
                () =>
                  setLabels(
                    LABEL_MODES[
                      (LABEL_MODES.indexOf(labels) + 1) % LABEL_MODES.length
                    ]
                  )
              )}
              {toggle(
                "volume-tile-diagnostics-map",
                faLayerGroup,
                "Uber die ganze Karte zeichnen",
                mode === "map",
                () =>
                  setMode((current) => (current === "map" ? "panel" : "map"))
              )}
              {mode === "map"
                ? toggle(
                    "volume-tile-diagnostics-projection",
                    faVectorSquare,
                    mapProjection === "camera"
                      ? "Eins zu eins uber der Karte"
                      : "Aufsicht mit Rand",
                    mapProjection === "camera",
                    () =>
                      setMapProjection((current) =>
                        current === "camera" ? "plan" : "camera"
                      )
                  )
                : null}
              {toggle(
                "volume-tile-diagnostics-window",
                faUpRightFromSquare,
                "In eigenem Fenster offnen",
                mode === "window",
                () =>
                  setMode((current) =>
                    current === "window" ? "panel" : "window"
                  )
              )}
              {onClose ? (
                <Button
                  size="small"
                  type="text"
                  aria-label="Schliessen"
                  onClick={onClose}
                >
                  &times;
                </Button>
              ) : null}
            </>
          }
        >
          {mode === "panel" ? (
            overview
          ) : (
            <div style={{ padding: 8, width: 240 }}>
              {mode === "map" ? "Ansicht auf der Karte" : "Ansicht im Fenster"}
            </div>
          )}
        </DiagnosticPanel>
        {mode === "map"
          ? createPortal(
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                }}
              >
                {overview}
              </div>,
              map.getContainer()
            )
          : null}
        <DiagnosticWindow
          open={mode === "window"}
          title="Kacheln ohne Tileset"
          width={560}
          height={560}
          onClose={() => setMode("panel")}
        >
          {overview}
        </DiagnosticWindow>
      </>
    );
  };
  return VolumeTileDiagnostics;
};
