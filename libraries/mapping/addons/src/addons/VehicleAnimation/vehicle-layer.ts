import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

import { poseAt, vehicleRing, type Track } from "./track";

/**
 * The moving body on the map: one GeoJSON source rewritten every frame, drawn
 * as a filled polygon with an outline, optionally over the track it runs on.
 *
 * Plain MapLibre and nothing caged. The whole animation is a rectangle walking
 * an arc-length parameter, so there is no proprietary field, no worker and no
 * texture; `setData` on a four-corner polygon is cheap enough to do per frame.
 *
 * The handle owns its animation frame. Nothing outside it reads the clock, so a
 * paused animation costs nothing and a destroyed one cannot leave a frame
 * behind.
 */

export type VehicleMode = "loop" | "pingpong";

export type VehicleLayerOptions = {
  map: MapLibreMap;
  track: Track;
  /** meters; the Schwebebahn's classic GTW 72 is about 24 m long */
  lengthMeters: number;
  /** meters across */
  widthMeters: number;
  /** travel speed in km/h */
  speedKmh: number;
  /**
   * What happens at the end of the track. `loop` restarts at the beginning,
   * which is what a closed ring wants; `pingpong` turns around, which is what
   * an out-and-back line wants.
   */
  mode: VehicleMode;
  fillColor: string;
  outlineColor: string;
  opacity: number;
  /** draw the track itself under the vehicle */
  showTrack: boolean;
  trackColor: string;
  /** MapLibre layer the vehicle is inserted before, e.g. to sit under labels */
  beforeId?: string;
  id?: string;
};

export type VehicleLayerHandle = {
  setSpeed: (speedKmh: number) => void;
  setPaused: (paused: boolean) => void;
  setOpacity: (opacity: number) => void;
  /** meters travelled from the start of the track */
  getDistance: () => number;
  destroy: () => void;
};

const DEFAULT_ID = "vehicle-animation";
const KMH_TO_MS = 1000 / 3600;
/** a tab that was in the background hands back a huge delta; ignore it */
const MAX_FRAME_SECONDS = 0.25;

const emptyCollection = {
  type: "FeatureCollection" as const,
  features: [] as GeoJSON.Feature[],
};

export const createVehicleLayer = (
  options: VehicleLayerOptions
): VehicleLayerHandle => {
  const {
    map,
    track,
    lengthMeters,
    widthMeters,
    mode,
    fillColor,
    outlineColor,
    showTrack,
    trackColor,
    beforeId,
    id = DEFAULT_ID,
  } = options;

  const sourceId = `${id}-source`;
  const trackSourceId = `${id}-track-source`;
  const fillId = id;
  const outlineId = `${id}-outline`;
  const trackId = `${id}-track`;

  let speedKmh = options.speedKmh;
  let opacity = options.opacity;
  let paused = false;
  let destroyed = false;
  let distance = 0;
  /** 1 forwards, -1 after a pingpong turnaround */
  let direction = 1;
  let frame: number | null = null;
  let lastTimestamp: number | null = null;

  const bodyFeature = (): GeoJSON.Feature => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        vehicleRing(
          poseAt(track, distance),
          lengthMeters,
          widthMeters,
          track.metersPerLon
        ),
      ],
    },
  });

  const trackFeature = (): GeoJSON.Feature => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: track.points.map((point) => [point[0], point[1]]),
    },
  });

  const pushBody = (): void => {
    const source = map.getSource(sourceId);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [bodyFeature()],
      });
    }
  };

  const attach = (): void => {
    if (destroyed || !map.getStyle()) return;

    if (showTrack && !map.getSource(trackSourceId)) {
      map.addSource(trackSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [trackFeature()] },
      });
    }
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: emptyCollection });
    }

    const insertBefore = beforeId && map.getLayer(beforeId) ? beforeId : undefined;

    if (showTrack && !map.getLayer(trackId)) {
      map.addLayer(
        {
          id: trackId,
          type: "line",
          source: trackSourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": trackColor,
            "line-width": 2,
            "line-opacity": 0.6 * opacity,
          },
        },
        insertBefore
      );
    }
    if (!map.getLayer(fillId)) {
      map.addLayer(
        {
          id: fillId,
          type: "fill",
          source: sourceId,
          paint: { "fill-color": fillColor, "fill-opacity": opacity },
        },
        insertBefore
      );
    }
    if (!map.getLayer(outlineId)) {
      map.addLayer(
        {
          id: outlineId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": outlineColor,
            "line-width": 1.5,
            "line-opacity": opacity,
          },
        },
        insertBefore
      );
    }

    pushBody();
  };

  const detach = (): void => {
    if (!map.getStyle()) return;
    for (const layerId of [outlineId, fillId, trackId]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    for (const source of [sourceId, trackSourceId]) {
      if (map.getSource(source)) map.removeSource(source);
    }
  };

  const advance = (seconds: number): void => {
    const step = speedKmh * KMH_TO_MS * seconds * direction;
    distance += step;

    if (mode === "loop") {
      // a closed ring has no end to reach, it only wraps
      distance = ((distance % track.length) + track.length) % track.length;
      return;
    }

    if (distance > track.length) {
      distance = track.length - (distance - track.length);
      direction = -1;
    } else if (distance < 0) {
      distance = -distance;
      direction = 1;
    }
  };

  const tick = (timestamp: number): void => {
    frame = null;
    if (destroyed) return;
    const seconds =
      lastTimestamp === null
        ? 0
        : Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_SECONDS);
    lastTimestamp = timestamp;
    advance(seconds);
    pushBody();
    if (!paused) frame = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (destroyed || paused || frame !== null) return;
    lastTimestamp = null;
    frame = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTimestamp = null;
  };

  // a basemap swap throws every layer away, so it has to go back on afterwards
  const onStyleData = (): void => attach();
  map.on("styledata", onStyleData);
  attach();
  start();

  return {
    setSpeed: (next) => {
      speedKmh = Math.max(0, next);
    },
    setPaused: (next) => {
      if (paused === next) return;
      paused = next;
      if (paused) stop();
      else start();
    },
    setOpacity: (next) => {
      opacity = Math.max(0, Math.min(1, next));
      if (map.getLayer(fillId)) {
        map.setPaintProperty(fillId, "fill-opacity", opacity);
      }
      if (map.getLayer(outlineId)) {
        map.setPaintProperty(outlineId, "line-opacity", opacity);
      }
      if (map.getLayer(trackId)) {
        map.setPaintProperty(trackId, "line-opacity", 0.6 * opacity);
      }
    },
    getDistance: () => distance,
    destroy: () => {
      destroyed = true;
      stop();
      map.off("styledata", onStyleData);
      detach();
    },
  };
};
