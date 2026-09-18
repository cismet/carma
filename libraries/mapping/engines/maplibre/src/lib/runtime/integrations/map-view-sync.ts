import type { Map as MapLibreMap } from "maplibre-gl";

type ViewSnapshot = Readonly<{
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  elevation?: number;
  verticalFieldOfView?: number;
}>;

const readView = (map: MapLibreMap): ViewSnapshot => {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    elevation: map.getCameraTargetElevation?.(),
    verticalFieldOfView: map.getVerticalFieldOfView?.(),
  };
};

const sameView = (a: ViewSnapshot, b: ViewSnapshot) =>
  a.center[0] === b.center[0] &&
  a.center[1] === b.center[1] &&
  a.zoom === b.zoom &&
  a.pitch === b.pitch &&
  a.bearing === b.bearing &&
  a.elevation === b.elevation &&
  a.verticalFieldOfView === b.verticalFieldOfView;

/**
 * Event-driven comparison cameras. Every member may become the interaction
 * source; map/render/runtime identity and viewport-specific padding stay intact.
 * No React state, polling or animation-frame loop is involved. Synthetic events
 * from jumpTo carry a group token; synchronous FOV events use the same guard.
 */
export const createMapViewSyncGroup = () => {
  const members = new Map<MapLibreMap, () => void>();
  const token = {};
  let latest: ViewSnapshot | undefined;
  let applying = false;
  let disposed = false;

  const apply = (map: MapLibreMap, view: ViewSnapshot) => {
    const current = readView(map);
    if (sameView(current, view)) return;
    if (
      view.verticalFieldOfView !== undefined &&
      view.verticalFieldOfView !== current.verticalFieldOfView
    )
      map.setVerticalFieldOfView?.(view.verticalFieldOfView);
    map.jumpTo(
      {
        center: view.center,
        zoom: view.zoom,
        pitch: view.pitch,
        bearing: view.bearing,
        elevation: view.elevation,
      },
      { carmaMapViewSync: token }
    );
  };

  return {
    /** Register a ready map; late joiners inherit the latest camera state. */
    add(map: MapLibreMap): () => void {
      if (disposed)
        throw new Error("Cannot join a disposed map view sync group");
      if (members.has(map))
        throw new Error("Map already belongs to this sync group");
      const onMove = (event: { carmaMapViewSync?: unknown }) => {
        if (disposed || applying || event.carmaMapViewSync === token) return;
        const next = readView(map);
        if (latest && sameView(latest, next)) return;
        latest = next;
        applying = true;
        try {
          for (const target of members.keys())
            if (target !== map) apply(target, next);
        } finally {
          applying = false;
        }
      };
      const remove = () => {
        if (!members.delete(map)) return;
        map.off("move", onMove);
        map.off("resize", onMove);
        map.off("remove", remove);
      };
      members.set(map, remove);
      map.on("move", onMove);
      map.on("resize", onMove);
      map.on("remove", remove);
      applying = true;
      try {
        if (latest) apply(map, latest);
        else latest = readView(map);
      } catch (error) {
        remove();
        throw error;
      } finally {
        applying = false;
      }
      return remove;
    },
    /** Unregister listeners only; ownership of maps and scene data stays outside. */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of [...members.values()]) remove();
      latest = undefined;
    },
  };
};
