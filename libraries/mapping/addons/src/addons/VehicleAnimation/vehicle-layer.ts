import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";

import {
  createFleet,
  createSelectionReporter,
  type FleetTimetable,
  type SelectedCar,
  type VehicleMode,
  type VehicleSchedule,
} from "./fleet";
import { structurePlanFeatures, type StructureAsset } from "./geruest";
import { carParts, type CarShape, type Track } from "./track";

export type { VehicleMode, VehicleSchedule } from "./fleet";

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
  /** with one, the vehicles run to its departures by the clock instead */
  timetable?: FleetTimetable | null;
  bodyColor: string;
  jointColor: string;
  outlineColor: string;
  opacity: number;
  /** draw the track itself under the vehicles */
  showTrack: boolean;
  trackColor: string;
  /** draw a dot and a name at every station */
  showStations: boolean;
  /**
   * The structure the vehicles hang from, drawn over them as it is seen from
   * above: the rail on top of its girder, the wind bracing between the two
   * rails, the supports. Without one the fleet runs on a bare line.
   */
  structure?: StructureAsset | null;
  /** MapLibre layer the fleet is inserted before, e.g. to sit under labels */
  beforeId?: string;
  id?: string;
  /** how many vehicles the service needs, once that is known */
  onFleetSize?: (count: number) => void;
  /** told about the selected vehicle, refreshed as it runs; null when there is none */
  onSelection?: (car: SelectedCar | null) => void;
};

export type VehicleLayerHandle = {
  setSpeed: (speedKmh: number) => void;
  setPaused: (paused: boolean) => void;
  setOpacity: (opacity: number) => void;
  /**
   * Take the fleet off the map without ending it. Unlike `setPaused`, which
   * leaves the vehicles standing where they are, this draws nothing at all and
   * lets the animation rest; the row that hid it can bring it back.
   */
  setVisible: (visible: boolean) => void;
  /** how many vehicles are on the track right now */
  getFleetSize: () => number;
  /** the vehicle under a screen point (CSS pixels), as its index in the fleet, or null */
  pickCarAt: (point: { x: number; y: number }) => number | null;
  /** highlight one vehicle, or none, and report it through `onSelection` */
  selectCar: (index: number | null) => void;
  getSelectedCar: () => number | null;
  /**
   * Where the vehicle nearest to (lon, lat) is, or the next one when that is
   * where the view already stands. The handle only reports the position:
   * moving the map is the host app's business, and moving this MapLibre map
   * on its own would leave the other framework behind.
   */
  pickNearestCar: (
    lon: number,
    lat: number
  ) => { lon: number; lat: number } | null;
  destroy: () => void;
};

const DEFAULT_ID = "vehicle-animation";
/** a tab that was in the background hands back a huge delta; ignore it */
const MAX_FRAME_SECONDS = 0.25;

/** the painted steel of the Gerüst, and the rust of the bare rail on top */
const STEEL_COLOR = "#7fa48b";
const RAIL_COLOR = "#8a5a3c";
/** the blue a selected feature gets in the vector styles, and a darker rim */
const HIGHLIGHT_COLOR = "#4892F0";
const HIGHLIGHT_OUTLINE_COLOR = "#1a56c4";
/** metres per pixel at zoom 0 on the equator, for MapLibre's 512 px tiles */
const EQUATOR_METERS_PER_PIXEL = 78271.517;

/**
 * A line width that is `meters` wide on the ground at every zoom, and never
 * thinner than `minPixels`. The clamp sits in the stop values rather than
 * around the expression, because `zoom` may only feed a top-level interpolate.
 */
const metersWide = (
  meters: number,
  lat: number,
  minPixels: number
): ExpressionSpecification => {
  const metersPerPixel =
    EQUATOR_METERS_PER_PIXEL * Math.cos((lat * Math.PI) / 180);
  const stops: number[] = [];
  for (let zoom = 10; zoom <= 24; zoom++) {
    stops.push(
      zoom,
      Math.max(minPixels, (meters * 2 ** zoom) / metersPerPixel)
    );
  }
  return ["interpolate", ["exponential", 2], ["zoom"], ...stops];
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
    timetable = null,
    bodyColor,
    jointColor,
    outlineColor,
    showTrack,
    trackColor,
    showStations,
    structure = null,
    beforeId,
    id = DEFAULT_ID,
    onFleetSize,
    onSelection,
  } = options;

  const sourceId = `${id}-source`;
  const trackSourceId = `${id}-track-source`;
  const stationSourceId = `${id}-station-source`;
  const structureSourceId = `${id}-structure-source`;
  const bodyId = id;
  const jointId = `${id}-joints`;
  const outlineId = `${id}-outline`;
  const trackId = `${id}-track`;
  const girderId = `${id}-girder`;
  const bracingId = `${id}-bracing`;
  const supportId = `${id}-supports`;
  const railId = `${id}-rail`;
  const stationDotId = `${id}-stations`;
  const stationLabelId = `${id}-station-labels`;
  /** every layer the fleet draws, for the ones that go on or off together */
  const allLayerIds = [
    bodyId,
    jointId,
    outlineId,
    trackId,
    girderId,
    bracingId,
    supportId,
    railId,
    stationDotId,
    stationLabelId,
  ];

  /** the structure's lines from above, built once: they never move */
  const structureFeatures = structure ? structurePlanFeatures(structure) : null;
  const trackLat = track.points[0][1];

  let opacity = options.opacity;
  let paused = false;
  let visible = true;
  let destroyed = false;
  let frame: number | null = null;
  let lastTimestamp: number | null = null;

  const fleet = createFleet({
    track,
    mode,
    schedule,
    timetable,
    speedKmh: options.speedKmh,
  });

  const visibleCount = (): number =>
    fleet.cars.reduce((count, car) => count + (car.visible ? 1 : 0), 0);

  /** tells the host how many vehicles are out, whenever that number changes */
  let reportedCount = -1;
  const reportFleet = (): void => {
    const count = visibleCount();
    if (count === reportedCount) return;
    reportedCount = count;
    onFleetSize?.(count);
  };

  const selection = createSelectionReporter(track, fleet, (car) =>
    onSelection?.(car)
  );

  const carFeatures = (): GeoJSON.Feature[] => {
    const selected = selection.get();
    return fleet.cars.flatMap((car, index) =>
      car.visible
        ? carParts(track, car.distance, shape).map((part) => ({
            type: "Feature" as const,
            properties: {
              part: part.kind,
              car: index,
              selected: index === selected,
            },
            geometry: { type: "Polygon" as const, coordinates: [part.ring] },
          }))
        : []
    );
  };

  const trackFeature = (): GeoJSON.Feature => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: track.points.map((point) => [point[0], point[1]]),
    },
  });

  const stationFeatures = (): GeoJSON.Feature[] =>
    fleet.stations.map((station) => ({
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

    // the structure draws the route twice more, as girder and as rail
    if ((showTrack || structureFeatures) && !map.getSource(trackSourceId)) {
      map.addSource(trackSourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [trackFeature()] },
      });
    }
    if (structureFeatures && !map.getSource(structureSourceId)) {
      map.addSource(structureSourceId, {
        type: "geojson",
        data: structureFeatures,
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
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["get", "selected"], false],
              HIGHLIGHT_COLOR,
              bodyColor,
            ],
            "fill-opacity": opacity,
          },
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
            "line-color": [
              "case",
              ["boolean", ["get", "selected"], false],
              HIGHLIGHT_OUTLINE_COLOR,
              outlineColor,
            ],
            "line-width": [
              "case",
              ["boolean", ["get", "selected"], false],
              2,
              1.2,
            ],
            "line-opacity": opacity,
          },
        },
        insertBefore
      );
    }
    // The Gerüst goes over the vehicles: from above, the rail runs along the
    // roof of every car and the bracing crosses between the two rails. The
    // girder is a translucent band so the car under it stays legible.
    if (structureFeatures) {
      if (!map.getLayer(girderId)) {
        map.addLayer(
          {
            id: girderId,
            type: "line",
            source: trackSourceId,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": STEEL_COLOR,
              "line-width": metersWide(1.0, trackLat, 1.5),
              "line-opacity": 0.55 * opacity,
            },
          },
          insertBefore
        );
      }
      if (!map.getLayer(bracingId)) {
        map.addLayer(
          {
            id: bracingId,
            type: "line",
            source: structureSourceId,
            filter: ["==", ["get", "part"], "bracing"],
            paint: {
              "line-color": STEEL_COLOR,
              "line-width": metersWide(0.3, trackLat, 0.5),
              "line-opacity": opacity,
            },
          },
          insertBefore
        );
      }
      if (!map.getLayer(supportId)) {
        map.addLayer(
          {
            id: supportId,
            type: "line",
            source: structureSourceId,
            filter: ["==", ["get", "part"], "support"],
            layout: { "line-cap": "round" },
            paint: {
              "line-color": STEEL_COLOR,
              "line-width": metersWide(0.45, trackLat, 0.8),
              "line-opacity": opacity,
            },
          },
          insertBefore
        );
      }
      if (!map.getLayer(railId)) {
        map.addLayer(
          {
            id: railId,
            type: "line",
            source: trackSourceId,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": RAIL_COLOR,
              "line-width": metersWide(0.35, trackLat, 1),
              "line-opacity": opacity,
            },
          },
          insertBefore
        );
      }
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
    // a basemap swap rebuilds every layer with the style's own defaults, so a
    // fleet that was hidden has to be hidden again here
    applyVisibility();
  };

  /** what `setVisible` and every re-attach apply to the layers that exist */
  const applyVisibility = (): void => {
    if (!map.getStyle()) return;
    for (const layerId of allLayerIds) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(
          layerId,
          "visibility",
          visible ? "visible" : "none"
        );
      }
    }
  };

  const detach = (): void => {
    if (!map.getStyle()) return;
    for (const layerId of [
      stationLabelId,
      railId,
      supportId,
      bracingId,
      girderId,
      outlineId,
      bodyId,
      jointId,
      stationDotId,
      trackId,
    ]) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    }
    for (const source of [
      sourceId,
      trackSourceId,
      stationSourceId,
      structureSourceId,
    ]) {
      if (map.getSource(source)) map.removeSource(source);
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
    fleet.advance(seconds);
    selection.tick();
    pushCars();
    reportFleet();
    if (!paused) frame = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (destroyed || paused || !visible || frame !== null) return;
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
  reportFleet();
  start();

  return {
    setSpeed: fleet.setSpeed,
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
        [girderId, "line-opacity", 0.55 * opacity],
        [bracingId, "line-opacity", opacity],
        [supportId, "line-opacity", opacity],
        [railId, "line-opacity", opacity],
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
    setVisible: (next) => {
      if (visible === next) return;
      visible = next;
      applyVisibility();
      // nothing is drawn while hidden, so the frame loop rests as well
      if (visible) {
        start();
      } else {
        stop();
      }
    },
    getFleetSize: visibleCount,
    pickCarAt: (point) => {
      if (!map.getStyle()) return null;
      const layers = [bodyId, jointId].filter(
        (layerId) => map.getLayer(layerId) !== undefined
      );
      if (layers.length === 0) return null;
      const hit = map
        .queryRenderedFeatures([point.x, point.y], { layers })
        .find(
          (feature) =>
            typeof (feature.properties as Record<string, unknown>).car ===
            "number"
        );
      return hit
        ? ((hit.properties as Record<string, unknown>).car as number)
        : null;
    },
    selectCar: (index) => {
      selection.set(index);
      pushCars();
    },
    getSelectedCar: selection.get,
    pickNearestCar: (lon, lat) => {
      const pose = fleet.pickNearest(lon, lat);
      return pose ? { lon: pose.lon, lat: pose.lat } : null;
    },
    destroy: () => {
      destroyed = true;
      stop();
      map.off("styledata", onStyleData);
      detach();
    },
  };
};
