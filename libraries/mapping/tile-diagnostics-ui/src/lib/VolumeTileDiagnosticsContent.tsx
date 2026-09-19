import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
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
    const [demand, setDemand] = useState({
      view: 0,
      corridor: 0,
      loading: 0,
      backlog: 0,
    });
    /** Where the corridor looks, in overview coordinates: the sun's heading. */
    const [sunHeading, setSunHeading] = useState<number | null>(null);
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
        // The corridor camera looks along the sun; its heading in the plan view
        // is the direction the shadows fall.
        const light = corridor[0]?.matrixWorld;
        setSunHeading(
          light ? (Math.atan2(-light[10], -light[8]) * 180) / Math.PI : null
        );
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
        {sunHeading === null ? null : (
          <div
            data-test-id="volume-tile-diagnostics-sun"
            title="Richtung des Korridors, also des Sonnenstands"
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              width: 44,
              height: 44,
              pointerEvents: "none",
              color: "#ffc46b",
            }}
          >
            <svg viewBox="0 0 44 44" width="44" height="44">
              <circle
                cx="22"
                cy="22"
                r="20"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.35"
              />
              <g transform={`rotate(${sunHeading} 22 22)`}>
                <line
                  x1="22"
                  y1="22"
                  x2="40"
                  y2="22"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <polygon points="40,22 33,18 33,26" fill="currentColor" />
              </g>
            </svg>
          </div>
        )}
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
