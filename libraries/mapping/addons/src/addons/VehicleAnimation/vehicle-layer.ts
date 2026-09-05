import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

import {
  carParts,
  poseAt,
  projectStops,
  type CarShape,
  type Station,
  type Track,
  type TrackStop,
} from "./track";

/**
 * The moving fleet on the map: one GeoJSON source rewritten every frame, drawn
 * as body sections with the articulations between them, over the track and its
 * stations.
 *
 * Plain MapLibre and nothing caged. A vehicle is a slice of the route's own
 * polyline widened to either side, so `setData` on a few dozen small rings is
 * cheap enough to do per frame and the body bends through curves the way the
 * real one does.
 *
 * The handle owns its animation frame. Nothing outside it reads the clock, so a
 * held fleet costs nothing and a destroyed one cannot leave a frame behind.
 */

export type VehicleMode = "loop" | "pingpong";

/**
 * A service, in the terms a timetable is actually written in: how often a
 * vehicle leaves, how long it waits at a station, and how fast it runs between
 * them. How many vehicles that takes follows from the route and is counted
 * rather than configured.
 *
 * Station stops are served in `loop` mode. In `pingpong` the vehicle turns
 * around mid-route, which no timetable of this shape describes, so stops are
 * ignored there.
 */
export type VehicleSchedule = {
  /** seconds between two departures of the same direction */
  headwaySeconds: number;
  /** how long a vehicle waits at each station */
  dwellSeconds: number;
  /** the stations it calls at */
  stations: readonly Station[];
  /** how close a piece of track has to pass a station to count as its stop */
  stationRadiusMeters: number;
};

export type VehicleLayerOptions = {
  map: MapLibreMap;
  track: Track;
  shape: CarShape;
  /** running speed between stops, in km/h */
  speedKmh: number;
  /**
   * What happens at the end of the track. `loop` restarts at the beginning,
   * which is what a closed ring wants; `pingpong` turns around, which is what
   * an out-and-back line wants.
   */
  mode: VehicleMode;
  /** without one, a single vehicle runs the route without stopping */
  schedule: VehicleSchedule | null;
  bodyColor: string;
  jointColor: string;
  outlineColor: string;
  opacity: number;
  /** draw the track itself under the vehicles */
  showTrack: boolean;
  trackColor: string;
  /** draw a dot and a name at every station */
  showStations: boolean;
  /** MapLibre layer the fleet is inserted before, e.g. to sit under labels */
  beforeId?: string;
  id?: string;
  /** how many vehicles the service needs, once that is known */
  onFleetSize?: (count: number) => void;
};

export type VehicleLayerHandle = {
  setSpeed: (speedKmh: number) => void;
  setPaused: (paused: boolean) => void;
  setOpacity: (opacity: number) => void;
  /** how many vehicles are running */
  getFleetSize: () => number;
  /**
   * Where one of the vehicles is, picked at random. The handle only reports
   * the position: moving the map is the host app's business, and moving this
   * MapLibre map on its own would leave the other framework behind.
   */
  pickRandomCar: () => { lon: number; lat: number } | null;
  destroy: () => void;
};

const DEFAULT_ID = "vehicle-animation";
const KMH_TO_MS = 1000 / 3600;
/** a tab that was in the background hands back a huge delta; ignore it */
const MAX_FRAME_SECONDS = 0.25;
/** a misconfigured headway must not fill the map with vehicles */
const MAX_FLEET = 60;

type Car = {
  /** meters from the start of the track */
  distance: number;
  /** 1 forwards, -1 after a pingpong turnaround */
  direction: number;
  /** seconds still to wait at the stop it is standing in */
  dwellRemaining: number;
  /** which entry of `stops` it is heading for */
  nextStop: number;
};

const emptyCollection: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export const createVehicleLayer = (
  options: VehicleLayerOptions
): VehicleLayerHandle => {
  const {
    map,
    track,
    shape,
    mode,
    schedule,
    bodyColor,
    jointColor,
    outlineColor,
    showTrack,
    trackColor,
    showStations,
    beforeId,
    id = DEFAULT_ID,
    onFleetSize,
  } = options;

  const sourceId = `${id}-source`;
  const trackSourceId = `${id}-track-source`;
  const stationSourceId = `${id}-station-source`;
  const bodyId = id;
  const jointId = `${id}-joints`;
  const outlineId = `${id}-outline`;
  const trackId = `${id}-track`;
  const stationDotId = `${id}-stations`;
  const stationLabelId = `${id}-station-labels`;

  let speedKmh = options.speedKmh;
  let opacity = options.opacity;
  let paused = false;
  let destroyed = false;
  let frame: number | null = null;
  let lastTimestamp: number | null = null;
  /** so a second look does not land on the vehicle already in the middle */
  let lastPicked: number | null = null;

  /** every place the service stops, in track order */
  const stops: TrackStop[] =
    schedule && mode === "loop"
      ? projectStops(track, schedule.stations, schedule.stationRadiusMeters)
      : [];

  /**
   * How many vehicles the timetable needs: one round trip divided by the
   * headway. Running time plus every wait is the honest cycle, so a denser
   * timetable or a longer wait both put more vehicles on the route by
   * themselves.
   */
  const fleetSize = ((): number => {
    if (!schedule || schedule.headwaySeconds <= 0) return 1;
    const runningSeconds = track.length / Math.max(0.1, speedKmh * KMH_TO_MS);
    const cycleSeconds = runningSeconds + stops.length * schedule.dwellSeconds;
    const count = Math.round(cycleSeconds / schedule.headwaySeconds);
    return Math.max(1, Math.min(MAX_FLEET, count));
  })();

  /** the first stop at or after `distance` */
  const stopAfter = (distance: number): number => {
    if (stops.length === 0) return 0;
    const index = stops.findIndex((stop) => stop.distance >= distance);
    return index === -1 ? 0 : index;
  };

  // Evenly spaced around the route rather than released one headway apart at
  // the start: every vehicle keeps the same stopping pattern, so an even
  // spacing in distance stays an even spacing in time.
  const cars: Car[] = Array.from({ length: fleetSize }, (_, index) => {
    const distance = (track.length * index) / fleetSize;
    return {
      distance,
      direction: 1,
      dwellRemaining: 0,
      nextStop: stopAfter(distance),
    };
  });

  const carFeatures = (): GeoJSON.Feature[] =>
    cars.flatMap((car) =>
      carParts(track, car.distance, shape).map((part) => ({
        type: "Feature" as const,
        properties: { part: part.kind },
        geometry: { type: "Polygon" as const, coordinates: [part.ring] },
      }))
    );

  const trackFeature = (): GeoJSON.Feature => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: track.points.map((point) => [point[0], point[1]]),
    },
  });

  const stationFeatures = (): GeoJSON.Feature[] =>
    (schedule?.stations ?? []).map((station) => ({
      type: "Feature",
      properties: { name: station.name },
      geometry: { type: "Point", coordinates: [station.lon, station.lat] },
    }));

  const pushCars = (): void => {
    const source = map.getSource(sourceId);
    if (source && "setData" in source) {
      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: carFeatures(),
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
    if (showStations && !map.getSource(stationSourceId)) {
      map.addSource(stationSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: stationFeatures() },
      });
    }
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: emptyCollection });
    }

    const insertBefore =
      beforeId && map.getLayer(beforeId) ? beforeId : undefined;

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
    if (showStations && !map.getLayer(stationDotId)) {
      map.addLayer(
        {
          id: stationDotId,
          type: "circle",
          source: stationSourceId,
          paint: {
            "circle-radius": 4,
            "circle-color": "#ffffff",
            "circle-stroke-color": outlineColor,
            "circle-stroke-width": 1.5,
            "circle-opacity": opacity,
            "circle-stroke-opacity": opacity,
          },
        },
        insertBefore
      );
    }
    // the sections sit over the articulations, so a rounded cab end never
    // shows the black band through the gap it leaves
    if (!map.getLayer(jointId)) {
      map.addLayer(
        {
          id: jointId,
          type: "fill",
          source: sourceId,
          filter: ["==", ["get", "part"], "joint"],
          paint: { "fill-color": jointColor, "fill-opacity": opacity },
        },
        insertBefore
      );
    }
    if (!map.getLayer(bodyId)) {
      map.addLayer(
        {
          id: bodyId,
          type: "fill",
          source: sourceId,
          filter: ["==", ["get", "part"], "section"],
          paint: { "fill-color": bodyColor, "fill-opacity": opacity },
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
          filter: ["==", ["get", "part"], "section"],
          layout: { "line-join": "round" },
          paint: {
            "line-color": outlineColor,
            "line-width": 1.2,
            "line-opacity": opacity,
          },
        },
        insertBefore
      );
    }
    if (showStations && !map.getLayer(stationLabelId)) {
      map.addLayer({
        id: stationLabelId,
        type: "symbol",
        source: stationSourceId,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": outlineColor,
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
          "text-opacity": opacity,
        },
      });
    }

    pushCars();
  };

  const detach = (): void => {
    if (!map.getStyle()) return;
    for (const layerId of [
      stationLabelId,
      outlineId,
      bodyId,
      jointId,
      stationDotId,
      trackId,
    ]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    for (const source of [sourceId, trackSourceId, stationSourceId]) {
      if (map.getSource(source)) map.removeSource(source);
    }
  };

  /** how far ahead the next stop is, going forwards around a closed track */
  const gapAhead = (from: number, to: number): number =>
    ((to - from) % track.length + track.length) % track.length;

  const advanceCar = (car: Car, seconds: number): void => {
    if (car.dwellRemaining > 0) {
      car.dwellRemaining -= seconds;
      return;
    }

    let remaining = speedKmh * KMH_TO_MS * seconds;

    if (stops.length > 0 && schedule) {
      const gap = gapAhead(car.distance, stops[car.nextStop].distance);
      if (gap <= remaining) {
        // stand exactly at the stop rather than a fraction past it: over a
        // whole day of frames the leftover would drift the timetable
        car.distance = stops[car.nextStop].distance;
        car.dwellRemaining = schedule.dwellSeconds;
        car.nextStop = (car.nextStop + 1) % stops.length;
        return;
      }
    }

    remaining *= car.direction;
    car.distance += remaining;

    if (mode === "loop") {
      // a closed ring has no end to reach, it only wraps
      car.distance =
        ((car.distance % track.length) + track.length) % track.length;
      return;
    }

    if (car.distance > track.length) {
      car.distance = track.length - (car.distance - track.length);
      car.direction = -1;
    } else if (car.distance < 0) {
      car.distance = -car.distance;
      car.direction = 1;
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
    for (const car of cars) advanceCar(car, seconds);
    pushCars();
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
  onFleetSize?.(fleetSize);
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
      for (const [layerId, property, value] of [
        [bodyId, "fill-opacity", opacity],
        [jointId, "fill-opacity", opacity],
        [outlineId, "line-opacity", opacity],
        [trackId, "line-opacity", 0.6 * opacity],
        [stationDotId, "circle-opacity", opacity],
        [stationLabelId, "text-opacity", opacity],
      ] as const) {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, property, value);
        }
      }
      if (map.getLayer(stationDotId)) {
        map.setPaintProperty(stationDotId, "circle-stroke-opacity", opacity);
      }
    },
    getFleetSize: () => fleetSize,
    pickRandomCar: () => {
      if (cars.length === 0) return null;
      let index = Math.floor(Math.random() * cars.length);
      if (cars.length > 1 && index === lastPicked) {
        index = (index + 1) % cars.length;
      }
      lastPicked = index;
      const pose = poseAt(track, cars[index].distance);
      return { lon: pose.lon, lat: pose.lat };
    },
    destroy: () => {
      destroyed = true;
      stop();
      map.off("styledata", onStyleData);
      detach();
    },
  };
};
