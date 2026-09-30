import { useEffect, type MutableRefObject } from "react";
import * as THREE from "three";
import {
  createSharedSceneNightLightAtlas,
  createSharedSceneNightTraffic,
  type MapVectorPoint,
  type NightLightAtlasInput,
  type NightTrafficRoute,
} from "@carma-mapping/engines/maplibre";
import {
  NIGHT_TRAFFIC_PATHS,
  NIGHT_TRAFFIC_SIGNALS,
} from "./data/night-traffic";
import { TILE_STRESS_PRESETS } from "./tile-stress-presets";
import type { TileCameraStressArgs, World } from "./tile-camera-stress-types";
import { coverageLabel } from "./use-tile-stress-world";

export const useTileStressNightTraffic = (
  args: TileCameraStressArgs,
  world: World | null,
  isNight: boolean,
  controls: MutableRefObject<TileCameraStressArgs>,
  nightPoints: MutableRefObject<readonly MapVectorPoint[]>,
  nightSync: MutableRefObject<(() => void) | null>,
  setStatus: (status: string) => void,
  setError: (error: string) => void
) => {
  useEffect(() => {
    if (!world || !isNight) return;
    let disposed = false;
    let atlasStatus = "Warte auf BELIS-Leuchten und Geländehöhen";
    const atlas = createSharedSceneNightLightAtlas(
      world.layer.getScene(),
      (message) => {
        atlasStatus = message;
        world.map.triggerRepaint();
      },
      (reason) => {
        if (!disposed) setError(String(reason));
      }
    );
    let traffic: ReturnType<typeof createSharedSceneNightTraffic> | null = null;
    const heights = new Map<string, number>();
    let lampSignature = "";
    let routeSignature = "";
    let pendingRouteCount = NIGHT_TRAFFIC_PATHS.length;
    let lastRevision = -1;
    let elapsed = 0;
    let last = 0;
    let lastStatus = 0;
    let raf = 0;
    let syncFrame = 0;
    const ground = (coordinate: readonly [number, number]) => {
      const key = coordinate.join(",");
      const known = heights.get(key);
      if (known !== undefined) return known;
      const value = world.map.queryTerrainElevation([...coordinate]);
      if (value == null || !Number.isFinite(value)) return null;
      heights.set(key, value);
      return value;
    };
    const sync = () => {
      if (disposed) return;
      const lamps: NightLightAtlasInput["lights"][number][] = [];
      const center = world.layer.projectLngLatToScene(
        TILE_STRESS_PRESETS["Rathaus Barmen"].center
      )!;
      const color = new THREE.Color("#ffda91");
      for (const point of nightPoints.current) {
        const elevation = ground(point.lngLat);
        if (elevation == null) continue;
        const position = world.layer.projectLngLatToScene(
          point.lngLat,
          elevation + args.mastHeight
        )!;
        const surface = world.layer.projectLngLatToScene(
          point.lngLat,
          elevation
        )!;
        lamps.push({
          position: [position.x, position.y, position.z],
          groundHeight: surface.y,
          radius: 28,
          color: [color.r, color.g, color.b],
          strength: args.nightLightStrength ?? 0.55,
        });
      }
      const signature = lamps.map((lamp) => lamp.position.join(",")).join(";");
      if (signature !== lampSignature) {
        lampSignature = signature;
        atlas.setLights({
          resolution: 1024,
          bounds: [
            center.x - 950,
            center.z - 950,
            center.x + 950,
            center.z + 950,
          ],
          heightRange: [
            Math.min(...lamps.map((lamp) => lamp.groundHeight), 0),
            Math.max(...lamps.map((lamp) => lamp.groundHeight), 1),
          ],
          lights: lamps,
        });
      }
      const routes: NightTrafficRoute[] = [];
      const requestedPaths = NIGHT_TRAFFIC_PATHS.filter(
        (path) => args.nightRailTraffic !== false || path.kind === "car"
      );
      for (const path of requestedPaths) {
        const routePoints: THREE.Vector3[] = [];
        for (const coordinate of path.coordinates) {
          const elevation = ground(coordinate);
          if (elevation == null) break;
          // No z claim in OSM: cars/rail use DGM; suspended track is an explicit
          // 13 m visual assumption, not the measured VehicleAnimation track.
          routePoints.push(
            world.layer.projectLngLatToScene(
              [...coordinate],
              elevation + (path.kind === "schwebebahn" ? 13 : 0.35)
            )!
          );
        }
        if (routePoints.length !== path.coordinates.length) continue;
        const signal = NIGHT_TRAFFIC_SIGNALS.find(
          (entry) => entry.pathId === path.id
        );
        const signalIndex = signal
          ? path.coordinates.findIndex(
              (coordinate) =>
                coordinate[0] === signal.coordinate[0] &&
                coordinate[1] === signal.coordinate[1]
            )
          : -1;
        let signalDistance = 0;
        for (let index = 1; index <= signalIndex; index++) {
          const a = routePoints[index - 1],
            b = routePoints[index];
          signalDistance += Math.hypot(b.x - a.x, b.z - a.z);
        }
        routes.push({
          id: path.id,
          kind: path.kind,
          points: routePoints,
          speedMetersPerSecond:
            path.kind === "car" ? 7 : path.kind === "schwebebahn" ? 9 : 14,
          ...(signalIndex >= 0
            ? {
                signal: {
                  distanceMeters: signalDistance,
                  phaseOffsetSeconds: routes.length * 8,
                },
              }
            : {}),
        });
      }
      pendingRouteCount = requestedPaths.length - routes.length;
      const nextRouteSignature = routes.map((route) => route.id).join(";");
      if (nextRouteSignature !== routeSignature) {
        routeSignature = nextRouteSignature;
        traffic?.dispose();
        traffic = createSharedSceneNightTraffic(world.layer.getScene(), {
          routes,
          carCount: args.nightCarCount ?? 3,
        });
      }
    };
    const scheduleSync = () => {
      if (disposed || syncFrame) return;
      syncFrame = requestAnimationFrame(() => {
        syncFrame = 0;
        sync();
      });
    };
    nightSync.current = scheduleSync;
    world.map.on("sourcedata", scheduleSync);
    sync();
    const tick = (now: number) => {
      if (disposed) return;
      const delta = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (controls.current.animate && !document.hidden) elapsed += delta;
      traffic?.update(elapsed);
      if (world.contentRevision.current !== lastRevision) {
        lastRevision = world.contentRevision.current;
        atlas.reconcile(world.runtime.root);
      }
      if (now - lastStatus > 500) {
        lastStatus = now;
        setStatus(
          `Barmen-Nacht · ${atlasStatus} · ${
            traffic?.vehicleCount ?? 0
          } Fahrzeuge / ${
            traffic?.signalCount ?? 0
          } Ampeln · ${pendingRouteCount} Routen warten auf DGM · ${coverageLabel(
            world
          )}`
        );
      }
      world.map.triggerRepaint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      nightSync.current = null;
      world.map.off("sourcedata", scheduleSync);
      cancelAnimationFrame(syncFrame);
      cancelAnimationFrame(raf);
      traffic?.dispose();
      atlas.dispose();
    };
  }, [
    world,
    isNight,
    args.nightCarCount,
    args.nightRailTraffic,
    args.nightLightStrength,
    args.mastHeight,
  ]);
};
