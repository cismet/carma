/// <reference types="vite/client" />
import type { Map as MaplibreMap } from "maplibre-gl";
import { getSharedThreeSceneRuntimes } from "@carma-mapping/engines/maplibre";
import type { Mesh } from "three";

// Opt-in, bounded local profiling. It does not schedule or invalidate a render.
const profiles = new WeakMap<MaplibreMap, ReturnType<typeof createProfile>>();
const enabled = () =>
  import.meta.env.DEV &&
  new URLSearchParams(location.hash.split("?")[1]).has("obliqueProfile");
const createProfile = (map: MaplibreMap, operation: string) => {
  const started = performance.now();
  let phase = "prepare",
    disposed = false,
    previousFrame = started;
  const metrics = new Map<
    string,
    { count: number; totalMs: number; maxMs: number }
  >();
  const events: Record<string, number> = {};
  const frames: { phase: string; gapMs: number }[] = [];
  const entries: unknown[] = [];
  const observers: PerformanceObserver[] = [];
  const record = (name: string, ms: number) => {
    const key = `${phase}:${name}`;
    const value = metrics.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 };
    value.count++;
    value.totalMs += ms;
    value.maxMs = Math.max(value.maxMs, ms);
    metrics.set(key, value);
  };
  for (const type of ["long-animation-frame", "longtask"]) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) entries.push(entry.toJSON());
      });
      observer.observe({ type, buffered: false });
      observers.push(observer);
    } catch {
      /* Browser capability is reported with the capture. */
    }
  }
  const eventNames = [
    "movestart",
    "move",
    "moveend",
    "zoomend",
    "render",
    "idle",
  ] as const;
  const listeners = eventNames.map((name) => {
    const listener = () => {
      const key = `${phase}:${name}`;
      events[key] = (events[key] ?? 0) + 1;
    };
    map.on(name, listener);
    return () => map.off(name, listener);
  });
  let frameId = 0;
  const frame = (now: number) => {
    if (disposed) return;
    frames.push({ phase, gapMs: now - previousFrame });
    previousFrame = now;
    frameId = requestAnimationFrame(frame);
  };
  frameId = requestAnimationFrame(frame);
  const finish = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    listeners.forEach((remove) => remove());
    observers.forEach((observer) => {
      entries.push(...observer.takeRecords().map((entry) => entry.toJSON()));
      observer.disconnect();
    });
    const surfaces = getSharedThreeSceneRuntimes(map).map((runtime) => {
      let meshes = 0,
        triangles = 0;
      const geometries = new Set<object>();
      runtime.root.traverseVisible((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        meshes++;
        geometries.add(mesh.geometry);
        triangles +=
          (mesh.geometry.index?.count ??
            mesh.geometry.getAttribute("position")?.count ??
            0) / 3;
      });
      return { id: runtime.id, meshes, geometries: geometries.size, triangles };
    });
    console.info(
      "[oblique-profile] " +
        JSON.stringify({
          operation,
          durationMs: performance.now() - started,
          metrics: Object.fromEntries(metrics),
          events,
          frames,
          entries,
          surfaces,
        })
    );
    if (profiles.get(map) === profile) profiles.delete(map);
  };
  const timeout = setTimeout(finish, 8000);
  const profile = {
    record,
    measure: <T>(name: string, run: () => T): T => {
      const start = performance.now();
      try {
        return run();
      } finally {
        record(name, performance.now() - start);
      }
    },
    phase: (next: string) => {
      phase = next;
    },
    finish: () => {
      clearTimeout(timeout);
      finish();
    },
  };
  return profile;
};
export const beginInteractionProfile = (
  map: MaplibreMap,
  operation: string
) => {
  if (!enabled()) return undefined;
  profiles.get(map)?.finish();
  const profile = createProfile(map, operation);
  profiles.set(map, profile);
  return profile;
};
export const interactionProfile = (map: MaplibreMap) => profiles.get(map);
