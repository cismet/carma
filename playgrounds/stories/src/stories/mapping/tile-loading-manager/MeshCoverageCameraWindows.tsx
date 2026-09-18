import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StyleProvider } from "@ant-design/cssinjs";
import type { Map as MapLibreMap } from "maplibre-gl";
import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from "three";
import { Button, Radio, Slider, Switch } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCamera,
  faSliders,
  faPause,
  faPlay,
  faWindowRestore,
} from "@fortawesome/free-solid-svg-icons";
import { DiagnosticWindowActions } from "./DiagnosticControls";
import panelCss from "./TileLoadingDebugPanels.css?inline";
import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  WUPPERTAL_CAMERA_FLIGHTS,
  WUPPERTAL_HKW_CHIMNEY,
} from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  createSharedThreeSceneCameraPreview,
  createCameraFlightPlayer,
  createCameraLensClip,
  sampleCameraPathGroundHeights,
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
  type ThreeTilesRuntime,
} from "@carma-mapping/engines/maplibre";

const CameraWindow = ({
  map,
  runtime,
  id,
  onClose,
  dockRequest,
}: {
  map: MapLibreMap;
  runtime: ThreeTilesRuntime;
  id: number;
  onClose: () => void;
  dockRequest: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // A stable portal target is physically adopted by the popup: no camera remount.
  const [portalHost] = useState(() => document.createElement("div"));
  const popupRef = useRef<Window | null>(null);
  const [external, setExternal] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [position, setPosition] = useState({
    x: Math.min(
      16 + (id % 3) * 355,
      Math.max(16, map.getContainer().clientWidth - 356)
    ),
    y: 100 + (id % 3) * 24,
  });
  const [status, setStatus] = useState("Waiting for loaded mesh");
  const [route, setRoute] = useState<"schwebebahn" | "wupper" | "local">(
    id % 3 === 0 ? "schwebebahn" : id % 3 === 1 ? "wupper" : "local"
  );
  const [fov, setFov] = useState(60);
  const [autoLens, setAutoLens] = useState(true);
  const [playing, setPlaying] = useState(true);
  const settings = useRef({ width: 340, height: 220, fov, autoLens, playing });
  Object.assign(settings.current, { fov, autoLens, playing });
  const dock = () => {
    const popup = popupRef.current;
    popupRef.current = null;
    dockRef.current?.append(portalHost);
    setExternal(false);
    if (popup && !popup.closed) popup.close();
  };
  const toggleExternal = () => {
    if (popupRef.current) {
      dock();
      return;
    }
    // Open synchronously in the click handler so popup blockers can honour the gesture.
    const popup = window.open("", "_blank", "popup,width=640,height=420");
    if (!popup) {
      setStatus("Popup blocked — allow this site's popup to undock.");
      setShowOptions(true);
      return;
    }
    popupRef.current = popup;
    popup.document.title = `Tile manager · Camera ${id + 1}`;
    Object.assign(popup.document.body.style, {
      margin: "0",
      overflow: "hidden",
      height: "100vh",
    });
    popup.document.body.append(portalHost);
    popup.addEventListener(
      "pagehide",
      () => {
        if (popupRef.current !== popup) return;
        popupRef.current = null;
        dockRef.current?.append(portalHost);
        setExternal(false);
      },
      { once: true }
    );
    setExternal(true);
  };
  useEffect(() => {
    if (dockRequest > 0) dock();
    // A command from the control window; keep the camera effect and portal alive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockRequest]);
  useEffect(() => {
    Object.assign(portalHost.style, { width: "100%", height: "100%" });
    dockRef.current?.append(portalHost);
    return () => {
      const popup = popupRef.current;
      popupRef.current = null;
      popup?.close();
      portalHost.remove();
    };
  }, [portalHost]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => {
      const w = viewport.clientWidth,
        h = viewport.clientHeight;
      if (w <= 0 || h <= 0) return;
      // Match the visible image, preserve aspect, bound GPU/readback cost at 2048².
      const scale = Math.min(
        viewport.ownerDocument.defaultView?.devicePixelRatio ?? 1,
        2,
        2048 / Math.max(w, h)
      );
      settings.current.width = Math.max(1, Math.round(w * scale));
      settings.current.height = Math.max(1, Math.round(h * scale));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    const owner = viewport.ownerDocument.defaultView;
    owner?.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      owner?.removeEventListener("resize", resize);
    };
  }, [external]);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const lease = acquireSharedThreeScene(map);
    const preview = createSharedThreeSceneCameraPreview(lease.layer);
    const camera = new PerspectiveCamera(60, 340 / 220, 1, 12000);
    const cameraId = `coverage-window-${id}`;
    const center = map.getCenter();
    const abort = new AbortController();
    let player: ReturnType<typeof createCameraFlightPlayer> | undefined;
    let elapsed = 0;
    let last: number | null = null;
    let frame = 0;
    let frameWindow = window;
    let busy = false;
    let lastAheadRequest = -Infinity;
    let prefetchCameraId: string | null = null;
    let disposed = false;
    const prepare = async () => {
      const preset = route === "local" ? null : WUPPERTAL_CAMERA_FLIGHTS[route];
      const coordinates = preset?.coordinates ?? [
        [center.lng, center.lat] as const,
      ];
      setStatus("Preparing bounded DGM flight profile…");
      const heights = await sampleCameraPathGroundHeights(
        NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
        coordinates,
        abort.signal
      );
      if (disposed) return;
      const points = coordinates.map((coordinate, i) => {
        const point = lease.layer.projectLngLatToScene(
          [coordinate[0], coordinate[1]],
          heights[i] + (preset?.aboveGround ?? 100)
        );
        if (!point) throw new Error("Shared scene has no geographic frame yet");
        return point;
      });
      const anchor = points[0].clone();
      if (!preset) {
        points.length = 0;
        for (let i = 0; i < 8; i++)
          points.push(
            anchor
              .clone()
              .add(
                new Vector3(
                  Math.cos((i * Math.PI) / 4) * 120,
                  0,
                  Math.sin((i * Math.PI) / 4) * 120
                )
              )
          );
      }
      const chimney = WUPPERTAL_HKW_CHIMNEY;
      const target =
        route === "wupper"
          ? lease.layer.projectLngLatToScene(
              [chimney.longitude, chimney.latitude],
              (chimney.footHeight + chimney.topHeight) / 2
            ) ?? undefined
          : route === "local"
          ? anchor.clone().add(new Vector3(0, -80, 0))
          : undefined;
      const duration = preset?.duration ?? 90;
      player = createCameraFlightPlayer(camera, {
        curve: new CatmullRomCurve3(points, !preset, "centripetal"),
        duration,
        target,
        clip: createCameraLensClip(duration, preset?.fov ?? [60, 45, 60]),
      });
      setStatus(preset?.note ?? "Local orbit · DGM + 100 m");
      map.triggerRepaint();
    };
    void prepare().catch((error: unknown) => {
      if (!disposed) setStatus(String(error));
    });
    const tick = () => {
      if (disposed) return;
      frameWindow = canvas.ownerDocument.defaultView ?? window;
      frame = frameWindow.requestAnimationFrame(tick);
      // Use the opener's monotonic clock even after adopting the canvas into
      // another window: rAF timestamps can have a different time origin there.
      const now = performance.now();
      const dt =
        last === null ? 0 : Math.max(0, Math.min((now - last) / 1000, 0.1));
      last = now;
      if (!player || lease.layer.isRenderingPaused()) return;
      const current = settings.current;
      if (current.playing) elapsed += dt;
      if (busy) return;
      camera.aspect = current.width / current.height;
      player.sample(elapsed, current.autoLens ? undefined : current.fov);
      lease.layer.setTileCameraView({
        id: cameraId,
        camera,
        viewport: [current.width, current.height],
        errorTargetPixels: 4,
        role: TILE_CAMERA_ROLE.RECEIVER,
        priority: TILE_CAMERA_PRIORITY.SECONDARY,
      });
      if (current.playing && now - lastAheadRequest >= 100) {
        lastAheadRequest = now;
        prefetchCameraId = lease.layer.requestTileCameraAhead(
          (aheadMs) => ({
            id: `${cameraId}:ahead`,
            camera: player!.sampleAhead(
              elapsed,
              aheadMs,
              current.autoLens ? undefined : current.fov
            ),
            viewport: [current.width, current.height],
            errorTargetPixels: 4,
            role: TILE_CAMERA_ROLE.RECEIVER,
            priority: TILE_CAMERA_PRIORITY.SECONDARY,
          }),
          500
        );
      } else if (!current.playing && prefetchCameraId) {
        lease.layer.removePrefetchCameraView(prefetchCameraId);
        prefetchCameraId = null;
      }
      map.triggerRepaint();
      busy = true;
      void preview
        .present(camera, canvas, current.width, current.height)
        .catch((error: unknown) => {
          if (!disposed) setStatus(String(error));
        })
        .finally(() => {
          busy = false;
        });
    };
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      abort.abort();
      player?.dispose();
      frameWindow.cancelAnimationFrame(frame);
      lease.layer.removeTileCameraView(cameraId);
      if (prefetchCameraId)
        lease.layer.removePrefetchCameraView(prefetchCameraId);
      preview.dispose();
      lease.release();
      map.triggerRepaint();
    };
  }, [map, runtime, id, route]);
  const content = (
    <StyleProvider container={portalHost.ownerDocument.head}>
      <style>{panelCss}</style>
      <section
        className="tile-debug-panel"
        data-test-id={`coverage-camera-window-${id}`}
        style={{
          background: "transparent",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            background: "rgb(248 250 252 / 96%)",
            display: "flex",
            justifyContent: "space-between",
            padding: "0 4px 0 8px",
            alignItems: "center",
            flexShrink: 0,
            height: 30,
            cursor: external ? "default" : "move",
            touchAction: "none",
          }}
          onPointerDown={(event) => {
            if (external || (event.target as HTMLElement).closest("button"))
              return;
            drag.current = {
              x: event.clientX - position.x,
              y: event.clientY - position.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setPosition({
                x: Math.max(
                  0,
                  Math.min(
                    map.getContainer().clientWidth - 80,
                    event.clientX - drag.current.x
                  )
                ),
                y: Math.max(
                  0,
                  Math.min(
                    window.innerHeight - 32,
                    event.clientY - drag.current.y
                  )
                ),
              });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <span>Camera {id + 1}</span>
          <DiagnosticWindowActions
            label={`camera ${id + 1}`}
            external={external}
            onToggleExternal={toggleExternal}
            onClose={onClose}
          >
            <Button
              type="text"
              aria-label={`Camera ${id + 1} options`}
              aria-expanded={showOptions}
              onClick={() => setShowOptions(!showOptions)}
              icon={<FontAwesomeIcon icon={faSliders} />}
            />
            <Button
              type="text"
              aria-label={`${playing ? "Pause" : "Play"} camera ${id + 1}`}
              onClick={() => setPlaying(!playing)}
              icon={<FontAwesomeIcon icon={playing ? faPause : faPlay} />}
            />
          </DiagnosticWindowActions>
        </header>
        <div
          ref={viewportRef}
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <canvas
            ref={canvasRef}
            data-test-id="tile-manager-camera-preview"
            width={320}
            height={200}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              transform: "scaleY(-1)",
              background: "#18212b",
            }}
          />
          {showOptions && (
            <div
              data-test-id={`camera-options-${id}`}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                maxWidth: "100%",
                boxSizing: "border-box",
                width: 280,
                overflow: "auto",
                padding: 10,
                background: "rgb(248 250 252 / 94%)",
                display: "grid",
                alignContent: "start",
                gap: 8,
              }}
            >
              <Radio.Group
                size="small"
                value={route}
                onChange={(event) => setRoute(event.target.value)}
                optionType="button"
                options={[
                  { value: "schwebebahn", label: "Rail" },
                  { value: "wupper", label: "Wupper → HKW" },
                  { value: "local", label: "Local" },
                ]}
              />
              <label>
                <Switch
                  size="small"
                  checked={autoLens}
                  onChange={setAutoLens}
                />{" "}
                Animated lens ·{" "}
                <Switch size="small" checked={playing} onChange={setPlaying} />{" "}
                Fly
              </label>
              <label>
                Vertical FOV {fov}° (manual override)
                <Slider
                  aria-label={`Camera ${id + 1} FOV`}
                  min={5}
                  max={120}
                  value={fov}
                  onChange={(value) => {
                    setFov(value);
                    setAutoLens(false);
                  }}
                />
              </label>
              <div>
                Resolution follows window size (up to 2048 px per side).
              </div>
              <div role="status">{status}</div>
            </div>
          )}
        </div>
      </section>
    </StyleProvider>
  );
  return (
    <>
      <div
        ref={dockRef}
        data-test-id={`camera-dock-${id}`}
        style={{
          position: "absolute",
          left: position.x,
          top: position.y,
          width: 340,
          height: 250,
          minWidth: 240,
          minHeight: 150,
          maxWidth: "100%",
          maxHeight: "90%",
          resize: "both",
          overflow: "hidden",
          zIndex: 8,
          display: external ? "none" : "block",
        }}
      />
      {createPortal(content, portalHost)}
    </>
  );
};

/** Coverage story variant: all windows consume the host's existing scene and pool. */
export const MeshCoverageCameraWindows = ({
  map,
  runtime,
  initialCount = 0,
}: {
  map: MapLibreMap;
  runtime: ThreeTilesRuntime;
  initialCount?: number;
}) => {
  const [controlsOpen, setControlsOpen] = useState(false);
  const [dockRequest, setDockRequest] = useState(0);
  const [windows, setWindows] = useState(() =>
    [0, 1, 2].slice(0, initialCount)
  );
  return (
    <>
      <Button
        data-test-id="coverage-camera-controls"
        aria-label="Cameras"
        title={`Cameras · ${windows.length}/3 active`}
        aria-expanded={controlsOpen}
        icon={<FontAwesomeIcon icon={faCamera} />}
        style={{ position: "absolute", top: 8, right: 52, zIndex: 12 }}
        onClick={() => setControlsOpen(!controlsOpen)}
      />
      {controlsOpen && (
        <section
          className="tile-debug-panel"
          data-test-id="coverage-camera-control-window"
          style={{
            position: "absolute",
            top: 46,
            right: 52,
            zIndex: 12,
            width: 260,
            padding: 10,
            background: "rgb(248 250 252 / 94%)",
          }}
        >
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong>Cameras · {windows.length}/3</strong>
            <Button
              type="text"
              aria-label="Close camera controls"
              onClick={() => setControlsOpen(false)}
            >
              ×
            </Button>
          </header>
          {["Schwebebahn", "Wupper → HKW", "Local orbit"].map((label, id) => (
            <label
              key={id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                paddingBlock: 8,
              }}
            >
              <Switch
                size="small"
                aria-label={`Enable camera ${id + 1}`}
                checked={windows.includes(id)}
                onChange={(enabled) =>
                  setWindows((current) =>
                    enabled
                      ? [...current.filter((value) => value !== id), id].sort()
                      : current.filter((value) => value !== id)
                  )
                }
              />
              Camera {id + 1} · {label}
            </label>
          ))}
          <small>
            Drag a header, resize its corner, or undock. All cameras share the
            main scene and tile pool.
          </small>
          <Button
            style={{ marginTop: 8 }}
            icon={<FontAwesomeIcon icon={faWindowRestore} />}
            onClick={() => setDockRequest((value) => value + 1)}
          >
            Dock all cameras
          </Button>
        </section>
      )}
      {windows.map((id) => (
        <CameraWindow
          key={id}
          id={id}
          dockRequest={dockRequest}
          map={map}
          runtime={runtime}
          onClose={() =>
            setWindows((current) => current.filter((item) => item !== id))
          }
        />
      ))}
    </>
  );
};
