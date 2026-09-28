import type { Map as MapLibreMap } from "maplibre-gl";

import {
  TRAFFIC_MAX_OFFSET_MINUTES,
  trafficClockOf,
  trafficDarkness,
} from "@carma-mapping/show-remote";

import {
  PIXEL_STEP,
  boundsOverlap,
  metersPerPixel,
  type LonLatBounds,
} from "../VehicleAnimation/fleet-loop";
import { DEFAULT_SIZE_SCALE, createTrafficLayer } from "./traffic-layer";
import type { TrafficNetwork } from "./traffic-network";
import { createTrafficSim, type TrafficSim } from "./traffic-sim";

/**
 * The traffic on one MapLibre map: the fleet (`traffic-sim.ts`), the layer
 * that draws it (`traffic-layer.ts`), and the clock between them.
 *
 * The moment shown is now minus the offset, and it runs with the clock: live
 * traffic stays live, and the traffic of last night keeps playing last night
 * minute by minute. The fleet moves on every animation frame, which costs a
 * few additions per vehicle; a new frame of the map is only asked for once the
 * fastest vehicle can have moved half a pixel, the same judge
 * `VehicleAnimation`'s fleet loop uses. At the model's zoom that is about
 * sixteen frames a second instead of sixty, and every one of them spares the
 * app an `idle` event.
 *
 * Once a second the moment is read anew: the fleet is steered to it, the
 * darkness is worked out from it, and the host is told what is on the map
 * (`onStats`). A new offset does all of that at once.
 *
 * Nothing runs while the network is out of view or the layer is hidden: the
 * frame loop stops and the vehicles stand where they were until it comes back.
 * The layer is added on top of the style and put back after every style change,
 * which throws custom layers away.
 */

export type TrafficEngineStats = {
  vehicleCount: number;
  /** the vehicles the moment asks for, after the cap */
  targetCount: number;
  capped: boolean;
  /** the moment shown, to the minute, as epoch milliseconds */
  displayedAt: number;
  /** 0 day, 1 night */
  darkness: number;
};

export type TrafficEngineOptions = {
  map: MapLibreMap;
  network: TrafficNetwork;
  id?: string;
  sizeScale?: number;
  nightDim?: number;
  maxVehicles?: number;
  densityScale?: number;
  offsetMinutes?: number;
  /** epoch milliseconds; Date.now unless pinned */
  now?: () => number;
  onStats?: (stats: TrafficEngineStats) => void;
};

export type TrafficEngine = {
  setOffsetMinutes: (minutes: number) => void;
  /** off the map without ending it, e.g. while its layer's eye is shut */
  setVisible: (visible: boolean) => void;
  /** the layer bar's opacity, 0..1 */
  setOpacity: (opacity: number) => void;
  destroy: () => void;
};

const DEFAULT_ID = "traffic-animation";
/** a tab that was in the background hands back a huge delta; ignore it */
const MAX_FRAME_SECONDS = 0.25;
const READ_CLOCK_SECONDS = 1;
/** a vehicle's body reaches this far past the centre line, in metres */
const VIEW_PAD_METERS = 60;
const METERS_PER_LAT = 111320;
const MS_PER_MINUTE = 60_000;

export const createTrafficEngine = ({
  map,
  network,
  id = DEFAULT_ID,
  sizeScale = DEFAULT_SIZE_SCALE,
  nightDim,
  maxVehicles,
  densityScale,
  offsetMinutes: initialOffset = 0,
  now = Date.now,
  onStats,
}: TrafficEngineOptions): TrafficEngine => {
  let offsetMinutes = initialOffset;
  let visible = true;
  let opacity = 1;
  let destroyed = false;

  const shownInstant = (): number => now() - offsetMinutes * MS_PER_MINUTE;

  const sim: TrafficSim = createTrafficSim({
    network,
    maxVehicles,
    densityScale,
    // the sim keeps the vehicles apart at the size they are drawn
    sizeScale,
    clock: () => {
      const instant = shownInstant();
      return { instant, minutesOfDay: trafficClockOf(instant).minutes };
    },
  });
  const traffic = createTrafficLayer({ id, network, sizeScale, nightDim });

  let darkness = trafficDarkness(shownInstant());

  const [west, south, east, north] = network.bounds;
  const padLat = VIEW_PAD_METERS / METERS_PER_LAT;
  const padLon =
    VIEW_PAD_METERS /
    (METERS_PER_LAT * Math.cos((((south + north) / 2) * Math.PI) / 180));
  const bounds: LonLatBounds = [
    west - padLon,
    south - padLat,
    east + padLon,
    north + padLat,
  ];
  const latitude = network.origin[1];

  let inView = true;
  let drawInterval = 0;
  let frame: number | null = null;
  let lastTimestamp: number | null = null;
  let sinceDraw = 0;
  let sinceClock = 0;
  let mustDraw = true;

  const report = (): void => {
    const stats = sim.stats();
    const shown = shownInstant();
    onStats?.({
      vehicleCount: stats.vehicles,
      targetCount: stats.target,
      capped: stats.capped,
      displayedAt: Math.floor(shown / MS_PER_MINUTE) * MS_PER_MINUTE,
      darkness,
    });
  };

  const readClock = (): void => {
    darkness = trafficDarkness(shownInstant());
    report();
  };

  const draw = (): void => {
    traffic.setFrame(sim.vehicles, darkness, opacity);
    map.triggerRepaint();
  };

  const measureView = (): void => {
    const view = map.getBounds();
    inView = boundsOverlap(bounds, [
      view.getWest(),
      view.getSouth(),
      view.getEast(),
      view.getNorth(),
    ]);
    drawInterval =
      (metersPerPixel(map.getZoom(), latitude) * PIXEL_STEP) / sim.maxSpeed();
  };

  const tick = (timestamp: number): void => {
    frame = null;
    const seconds =
      lastTimestamp === null
        ? 0
        : Math.min((timestamp - lastTimestamp) / 1000, MAX_FRAME_SECONDS);
    lastTimestamp = timestamp;
    sim.step(seconds);
    sinceDraw += seconds;
    sinceClock += seconds;
    if (sinceClock >= READ_CLOCK_SECONDS) {
      sinceClock = 0;
      readClock();
    }
    if (mustDraw || sinceDraw >= drawInterval) {
      mustDraw = false;
      sinceDraw = 0;
      draw();
    }
    frame = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTimestamp = null;
  };

  const start = (): void => {
    if (destroyed || !visible || !inView || frame !== null) return;
    lastTimestamp = null;
    mustDraw = true;
    frame = requestAnimationFrame(tick);
  };

  const onMove = (): void => {
    measureView();
    if (inView) start();
    else stop();
  };

  const attach = (): void => {
    if (destroyed) return;
    try {
      if (!map.getLayer(id)) map.addLayer(traffic.layer);
    } catch {
      // no style yet; its `styledata` brings the next try
    }
  };

  map.on("styledata", attach);
  map.on("move", onMove);
  map.on("resize", onMove);
  attach();
  measureView();
  // the first step fills the network at once
  sim.step(0);
  readClock();
  draw();
  start();

  return {
    setOffsetMinutes: (minutes) => {
      const next = Math.max(0, Math.min(minutes, TRAFFIC_MAX_OFFSET_MINUTES));
      if (next === offsetMinutes) return;
      offsetMinutes = next;
      sim.retarget();
      readClock();
      mustDraw = true;
      if (frame === null) draw();
    },
    setVisible: (next) => {
      if (visible === next) return;
      visible = next;
      traffic.setVisible(visible);
      map.triggerRepaint();
      if (visible) start();
      else stop();
    },
    setOpacity: (next) => {
      const clamped = Math.max(0, Math.min(1, next));
      if (clamped === opacity) return;
      opacity = clamped;
      mustDraw = true;
      if (frame === null) draw();
    },
    destroy: () => {
      destroyed = true;
      stop();
      map.off("styledata", attach);
      map.off("move", onMove);
      map.off("resize", onMove);
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch {
        // the map is already gone
      }
      traffic.dispose();
    },
  };
};
