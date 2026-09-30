import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import type { SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

export const createSharedSceneZoomPrefetch = (
  layerId: string,
  getRuntimes: () => readonly SharedThreeSceneRuntime[]
) => {
  let map: MaplibreMap | null = null;
  let zoomPrefetch: AbortController | null = null;
  let zoomPrefetchPending = false;
  let completedZoomPrefetch = new Set<SharedThreeSceneRuntime>();
  let zoomFocus: readonly [number, number] | null = null;
  const cancelZoomPrefetch = () => {
    zoomPrefetchPending = false;
    zoomPrefetch?.abort();
    zoomPrefetch = null;
    completedZoomPrefetch = new Set();
  };
  const startZoomPrefetch = (event: { originalEvent?: Event }) => {
    cancelZoomPrefetch();
    zoomPrefetchPending = true;
    zoomFocus = null;
    const input = event.originalEvent;
    if (map && input && "clientX" in input && "clientY" in input) {
      const bounds = map.getCanvas().getBoundingClientRect();
      zoomFocus = [
        Number(input.clientX) - bounds.left,
        Number(input.clientY) - bounds.top,
      ];
    }
  };
  const detachZoomPrefetch = () => {
    cancelZoomPrefetch();
    map?.off?.(MAPLIBRE_EVENT.ZOOM_START, startZoomPrefetch);
    map?.off?.(MAPLIBRE_EVENT.ZOOM_END, cancelZoomPrefetch);
    map = null;
  };

  return {
    attach(nextMap: MaplibreMap) {
      map = nextMap;
      map.on?.(MAPLIBRE_EVENT.ZOOM_START, startZoomPrefetch);
      map.on?.(MAPLIBRE_EVENT.ZOOM_END, cancelZoomPrefetch);
    },
    detach: detachZoomPrefetch,
    update(renderCamera: THREE.PerspectiveCamera, viewport: THREE.Vector2) {
      if (!map) return;
      // Decision: TILES_COVERAGE.md#startup-motion-and-reserve-admission, engine README. Foreground demand from
      // every camera/runtime wins; only one speculative adapter runs at a time.
      if (
        zoomPrefetchPending &&
        zoomPrefetch === null &&
        map.isZooming?.() &&
        getRuntimes().every(
          (runtime) =>
            !runtime.root.visible ||
            ((runtime.getRequestDemand?.() ?? 0) === 0 &&
              runtime.isBaseViewReady?.() !== false)
        )
      ) {
        zoomPrefetchPending = false;
        const controller = new AbortController();
        zoomPrefetch = controller;
        const completed = completedZoomPrefetch;
        const canvas = map.getCanvas();
        const width = canvas.clientWidth || viewport.x;
        const height = canvas.clientHeight || viewport.y;
        const paddedCenter = map.project(map.getCenter());
        const [x, y] = zoomFocus ?? [paddedCenter.x, paddedCenter.y];
        const lngLat = map.unproject([x, y]);
        const camera = renderCamera.clone();
        // Fixed small focus window, preserving the real perspective/off-axis
        // pose and elevation extent; no second renderer or scene context.
        const sx = width / Math.min(128, width);
        const sy = height / Math.min(128, height);
        camera.projectionMatrix.premultiply(
          new THREE.Matrix4().set(
            sx,
            0,
            0,
            -sx * ((2 * x) / width - 1),
            0,
            sy,
            0,
            -sy * (1 - (2 * y) / height),
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1
          )
        );
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        const [snapshot] = snapshotTileCameraViews([
          {
            id: `${layerId}:zoom-focus`,
            camera,
            viewport: [128, 128],
            errorTargetPixels: 1,
            role: TILE_CAMERA_ROLE.GEOMETRY,
          },
        ]);
        const request = {
          camera: snapshot,
          lngLat: [lngLat.lng, lngLat.lat] as const,
          levels: 2 as const,
        };
        void (async () => {
          // Leave the MapLibre draw callback before optional traversal/decoding.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          for (const runtime of getRuntimes()) {
            if (controller.signal.aborted) break;
            if (completed.has(runtime)) continue;
            if (
              getRuntimes().some(
                (other) =>
                  other.root.visible &&
                  ((other.getRequestDemand?.() ?? 0) > 0 ||
                    other.isBaseViewReady?.() === false)
              )
            ) {
              // Resume this gesture on the normal demand-completion repaint,
              // without polling or repeating adapters already fulfilled.
              if (zoomPrefetch === controller && map?.isZooming?.())
                zoomPrefetchPending = true;
              break;
            }
            if (runtime.root.visible) {
              await runtime.prefetchZoom?.(request, controller.signal);
              if (!controller.signal.aborted) completed.add(runtime);
            }
          }
        })()
          .catch(() => {
            /* Speculation never fails the foreground scene. */
          })
          .finally(() => {
            if (zoomPrefetch === controller) zoomPrefetch = null;
          });
      }
    },
  };
};
