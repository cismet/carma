import { useEffect, type MutableRefObject, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from "three";
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

export const useCoverageCameraFlight = (
  map: MapLibreMap,
  runtime: ThreeTilesRuntime,
  id: number,
  route: "schwebebahn" | "wupper" | "local",
  canvasRef: RefObject<HTMLCanvasElement>,
  settings: MutableRefObject<{
    width: number;
    height: number;
    fov: number;
    autoLens: boolean;
    playing: boolean;
  }>,
  setStatus: (status: string) => void
) => {
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
};
