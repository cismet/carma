import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  NormalizedZoomValue,
} from "@excalidraw/excalidraw/types/types";

/** excalidraw clamps zoom.value to this range; see its getNormalizedZoom */
const MIN_SCENE_ZOOM = 0.1;
const MAX_SCENE_ZOOM = 30;

/** under a hundredth of a pixel the two cameras are the same camera */
const EPSILON = 0.01;

/** the lng/lat the scene puts at (0, 0), and the map zoom where scale is 1 */
type Anchor = { lng: number; lat: number; zoom: number };

type SceneCamera = { scrollX: number; scrollY: number; scale: number };

const same = (a: SceneCamera, b: SceneCamera) =>
  Math.abs(a.scrollX - b.scrollX) < EPSILON &&
  Math.abs(a.scrollY - b.scrollY) < EPSILON &&
  Math.abs(a.scale - b.scale) < EPSILON;

/**
 * Pins the scene to the ground at one anchor lng/lat. The rest follows because
 * excalidraw's `screen = (scene + scroll) * zoom` is a translate and a uniform
 * scale — the same transform as a north-up web mercator map.
 *
 * Two-way: the map drives the scene while the overlay is passive, the scene
 * drives the map while it owns the pointer. `pushedRef` breaks the loop, since
 * every update we write comes back through `onChange`.
 *
 * `inSync` is false where the shared transform does not hold — a rotated or
 * tilted map, or a zoom past excalidraw's clamp — and the overlay hides.
 */
export const useMapSceneSync = (
  map: MaplibreMap | null,
  api: ExcalidrawImperativeAPI | null,
  overlay: HTMLElement | null
) => {
  const anchorRef = useRef<Anchor | null>(null);
  const pushedRef = useRef<SceneCamera | null>(null);
  const [inSync, setInSync] = useState(false);

  /** the overlay's top left inside the map container, what `project` counts from */
  const offsetOf = useCallback(() => {
    if (!map || !overlay) {
      return { x: 0, y: 0 };
    }
    const container = map.getContainer().getBoundingClientRect();
    const box = overlay.getBoundingClientRect();
    return { x: box.left - container.left, y: box.top - container.top };
  }, [map, overlay]);

  const applyMapCamera = useCallback(() => {
    const anchor = anchorRef.current;
    if (!map || !api || !anchor) {
      return;
    }

    const scale = 2 ** (map.getZoom() - anchor.zoom);
    const usable =
      map.getBearing() === 0 &&
      map.getPitch() === 0 &&
      scale >= MIN_SCENE_ZOOM &&
      scale <= MAX_SCENE_ZOOM;
    setInSync(usable);
    if (!usable) {
      return;
    }

    const offset = offsetOf();
    const point = map.project([anchor.lng, anchor.lat]);
    // the anchor is scene (0, 0), so its screen position is scroll * scale
    const camera: SceneCamera = {
      scrollX: (point.x - offset.x) / scale,
      scrollY: (point.y - offset.y) / scale,
      scale,
    };

    pushedRef.current = camera;
    api.updateScene({
      appState: {
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
        zoom: { value: scale as NormalizedZoomValue },
      },
    });
  }, [api, map, offsetOf]);

  const applySceneCamera = useCallback(
    (state: Pick<AppState, "scrollX" | "scrollY" | "zoom">) => {
      const anchor = anchorRef.current;
      const pushed = pushedRef.current;
      // before the first push the scene holds its own defaults, not a camera
      if (!map || !anchor || !pushed) {
        return;
      }

      const camera: SceneCamera = {
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        scale: state.zoom.value,
      };
      if (same(camera, pushed)) {
        return;
      }

      const offset = offsetOf();
      const targetX = camera.scrollX * camera.scale + offset.x;
      const targetY = camera.scrollY * camera.scale + offset.y;
      const zoom = anchor.zoom + Math.log2(camera.scale);

      // the anchor's position depends on the zoom, so set that first
      map.jumpTo({ zoom });
      const point = map.project([anchor.lng, anchor.lat]);
      const centre = map.project(map.getCenter());
      map.jumpTo({
        zoom,
        center: map.unproject([
          centre.x + point.x - targetX,
          centre.y + point.y - targetY,
        ]),
      });
    },
    [map, offsetOf]
  );

  useEffect(() => {
    if (!map || !api) {
      return;
    }
    if (!anchorRef.current) {
      const { lng, lat } = map.getCenter();
      anchorRef.current = { lng, lat, zoom: map.getZoom() };
    }

    applyMapCamera();
    map.on("move", applyMapCamera);
    map.on("resize", applyMapCamera);

    // the measured offset moves whenever the app's chrome does
    const sizes = overlay ? new ResizeObserver(applyMapCamera) : null;
    if (overlay && sizes) {
      sizes.observe(overlay);
    }

    return () => {
      map.off("move", applyMapCamera);
      map.off("resize", applyMapCamera);
      sizes?.disconnect();
    };
  }, [api, applyMapCamera, map, overlay]);

  return { inSync, onSceneChange: applySceneCamera };
};
