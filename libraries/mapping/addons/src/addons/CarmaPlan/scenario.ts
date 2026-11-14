import * as THREE from "three";

import { buildGroundMesh, paintGroundShadows, sampleHeights } from "./ground-mesh";
import type { GroundPainter } from "./ground-paint";
import type { LowPolyBuilder, V3 } from "./lowpoly";
import { SunShadowMap } from "./shadow-map";
import {
  hash,
  pointsAlongEdge,
  type Point,
  type SiteFrame,
} from "./site-frame";

/** what a carma plan site can be turned into */
export const CARMA_PLAN_SCENARIOS = [
  { id: "construction", label: "Baustelle" },
  { id: "parking", label: "Parkplatz" },
  { id: "playground", label: "Spielplatz" },
] as const;

export type CarmaPlanScenarioId = (typeof CARMA_PLAN_SCENARIOS)[number]["id"];

export const isCarmaPlanScenarioId = (
  value: unknown
): value is CarmaPlanScenarioId =>
  CARMA_PLAN_SCENARIOS.some((scenario) => scenario.id === value);

/** a built scenario: geometry in the site frame, ready to mount */
export type CarmaPlanScenario = {
  root: THREE.Group;
  anchorLngLat: [number, number];
  stats: Record<string, number>;
  dispose: () => void;
};

export type ScenarioGround = {
  /** height of the finished ground, metres, as the models stand on it */
  heightAt: (x: number, z: number) => number;
  painter: GroundPainter;
  /** depth of the wall down from the site edge, metres */
  skirt: number;
};

/**
 * Bakes a scenario: the sun's shadow map over all models, the models lit
 * with it, their shadows painted onto the ground, and the ground mesh.
 */
export const finishScenario = (
  frame: SiteFrame,
  builder: LowPolyBuilder,
  ground: ScenarioGround,
  name: string,
  stats: Record<string, number>
): CarmaPlanScenario => {
  const started = performance.now();
  const grid = sampleHeights(frame, ground.heightAt);
  const shadow = new SunShadowMap(builder.triangles);
  const models = builder.build(`carma-plan ${name}`, shadow);
  paintGroundShadows(ground.painter, grid, shadow, builder.footprints);
  const surface = buildGroundMesh(
    frame,
    grid,
    ground.heightAt,
    ground.painter,
    ground.skirt
  );
  const root = new THREE.Group();
  root.name = `carma-plan ${name}`;
  root.add(surface.mesh, models.mesh);
  return {
    root,
    anchorLngLat: frame.anchorLngLat,
    stats: {
      ...stats,
      triangles: builder.triangleCount,
      groundTriangles: (surface.mesh.geometry.index?.count ?? 0) / 3,
      texturePx: ground.painter.canvas.width,
      bakeMs: Math.round(performance.now() - started),
    },
    dispose: () => {
      models.dispose();
      surface.dispose();
    },
  };
};

/** circles already taken on the site, so placed things do not overlap */
export class Footprints {
  private readonly taken: { x: number; z: number; r: number }[] = [];

  free(x: number, z: number, r: number): boolean {
    return this.taken.every(
      (other) => Math.hypot(other.x - x, other.z - z) >= other.r + r
    );
  }

  take(x: number, z: number, r: number): void {
    this.taken.push({ x, z, r });
  }
}

/** grid points over the site, jittered and in a fixed shuffled order */
export const candidates = (
  frame: SiteFrame,
  step: number,
  salt: number
): Point[] => {
  const points: { point: Point; order: number }[] = [];
  for (let x = frame.minX; x <= frame.maxX; x += step)
    for (let z = frame.minZ; z <= frame.maxZ; z += step) {
      const px = x + (hash(x, z, salt) - 0.5) * step * 0.6;
      const pz = z + (hash(z, x, salt + 1) - 0.5) * step * 0.6;
      if (frame.inside(px, pz))
        points.push({ point: [px, pz], order: hash(px, pz, salt + 2) });
    }
  return points.sort((a, b) => a.order - b.order).map(({ point }) => point);
};

/** the yaw that turns a model's +x towards (dx, dz) */
export const yawTowards = (dx: number, dz: number): number =>
  Math.atan2(-dz, dx);

/** a model-local offset (forward x, right z) turned by `yaw`, in the site frame */
export const offsetBy = (
  yaw: number,
  forward: number,
  right: number
): Point => [
  forward * Math.cos(yaw) + right * Math.sin(yaw),
  -forward * Math.sin(yaw) + right * Math.cos(yaw),
];

/**
 * Runs of ground points along the site edge, `inset` metres inside, for
 * fences; a run breaks where the outline jumps (between rings).
 */
export const edgeRuns = (
  frame: SiteFrame,
  spacing: number,
  inset: number,
  heightAt: (x: number, z: number) => number
): V3[][] => {
  const runs: V3[][] = [];
  let run: V3[] = [];
  for (const { x, z } of pointsAlongEdge(frame, spacing, inset)) {
    const last = run[run.length - 1];
    if (last && Math.hypot(last[0] - x, last[2] - z) > spacing * 2.5) {
      runs.push(run);
      run = [];
    }
    run.push([x, heightAt(x, z), z]);
  }
  if (run.length > 1) {
    const [first] = run;
    const last = run[run.length - 1];
    if (Math.hypot(last[0] - first[0], last[2] - first[2]) <= spacing * 2.5)
      run.push(first);
    runs.push(run);
  }
  return runs;
};
