import * as THREE from "three";

import {
  GroundPainter,
  mix,
  noise,
  tone,
} from "./ground-paint";
import { LowPolyBuilder, type Paint, type V3 } from "./lowpoly";
import {
  barrowPusher,
  bulldozer,
  dumpTruck,
  excavator,
  pallet,
  pipes,
  portableToilet,
  shoveller,
  siteContainer,
  siteFence,
  skip,
  storageContainer,
  trafficCone,
  wheelLoader,
  worker,
} from "./construction-models";
import {
  Footprints,
  candidates,
  edgeRuns,
  finishScenario,
  offsetBy,
  yawTowards,
  type CarmaPlanScenario,
} from "./scenario";
import { hash, smooth01, type Point, type SiteFrame } from "./site-frame";
import { createTerracing, type Terracing } from "./terracing";

/**
 * Scenario "Baustelle": everything on the site is gone and the ground is
 * graded into a few slight terraces, with ramps between them the machines can
 * drive. On the levels: heaps of spoil, gravel and sand, an excavator loading
 * a tipper, dozers pushing heaps, a second tipper on its way up a ramp, a site
 * office with its toilet, and site fencing along the cut edge.
 */

/** lift over the DGM so the map's own terrain never shows through */
const LIFT = 0.15;
const EDGE_BLEND = 10;

type Rgb = readonly [number, number, number];
/** ground, sRGB */
const SOIL: Rgb = [150, 120, 84];
const SOIL_DRY: Rgb = [178, 150, 110];
const CUT: Rgb = [122, 92, 60];
const TOPSOIL: Rgb = [128, 102, 72];
const ROUGH_GRASS: Rgb = [112, 122, 72];
const GRAVEL: Rgb = [164, 154, 132];
const VERGE: Rgb = [116, 98, 72];
const TRACK = "rgba(84, 60, 38, 0.2)";

/** models */
const SPOIL_HEAP = "#6e5336";
const GRAVEL_HEAP = "#9a9a94";
const SAND_HEAP = "#d2b77a";

type Heap = { x: number; z: number; r: number };

export const buildConstructionSite = (frame: SiteFrame): CarmaPlanScenario => {
  const terraces = createTerracing(frame, {
    stepHeight: 1.4,
    minLevels: 2,
    maxLevels: 4,
    minLevelDepth: 28,
    minStep: 0.9,
    levelGrade: 0,
    bankGrade: 0.7,
    rampGrade: 0.12,
    rampWidth: 7,
    edgeBlend: EDGE_BLEND,
  });
  const graded = (x: number, z: number) => terraces.heightAt(x, z) + LIFT;
  const painter = paintGround(frame, terraces);

  const b = new LowPolyBuilder();

  const footprints = new Footprints();
  // the ramps are the roads between the levels: keep them clear
  for (const ramp of terraces.ramps)
    footprints.take(ramp.x, ramp.z, ramp.length / 2);

  const heapCount = Math.min(
    7,
    Math.max(3, Math.round(frame.areaM2 / 2500))
  );
  const heaps: Heap[] = [];
  for (const [x, z] of candidates(frame, 5, 1)) {
    if (heaps.length >= heapCount) break;
    const r = 3.5 + hash(x, z, 2) * 2.5;
    if (!terraces.isLevel(x, z, r + 1) || !footprints.free(x, z, r + 7))
      continue;
    footprints.take(x, z, r);
    const paint =
      heaps.length === 1
        ? GRAVEL_HEAP
        : heaps.length === 3
        ? SAND_HEAP
        : SPOIL_HEAP;
    spill(painter, x, z, r, paint);
    drawHeap(b, graded, x, z, r, 1.6 + hash(x, z, 4) * 1.6, paint);
    heaps.push({ x, z, r });
  }

  const place = (
    x: number,
    z: number,
    yaw: number,
    r: number,
    draw: () => void,
    pitch = 0
  ) => {
    footprints.take(x, z, r);
    b.placed([x, graded(x, z), z], yaw, draw, pitch);
  };
  const fits = (x: number, z: number, r: number) =>
    terraces.isLevel(x, z, r * 0.6) && footprints.free(x, z, r);

  let machines = 0;
  let people = 0;
  let props = 0;
  /** where the machines went, for their tracks */
  const tracksTo: Point[] = [];

  // the excavator faces a heap, its house turned to load the tipper beside it
  const loading = heaps[0];
  if (loading) {
    const turn = hash(loading.x, loading.z, 3) * Math.PI * 2;
    for (let i = 0; i < 16; i++) {
      const angle = turn + (i / 16) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const ex = loading.x + dx * (loading.r + 3.2);
      const ez = loading.z + dz * (loading.r + 3.2);
      const yaw = yawTowards(-dx, -dz);
      tracksTo.push([ex, ez]);
      const [ox, oz] = offsetBy(yaw, 0.7, -6.0);
      const tx = ex + ox;
      const tz = ez + oz;
      if (!fits(ex, ez, 3.2) || !fits(tx, tz, 4.3)) continue;
      place(ex, ez, yaw, 3.2, () => excavator(b, Math.PI / 2));
      place(tx, tz, yaw, 4.3, () =>
        dumpTruck(b, "#f2f2ef", "#a5a7a8", SPOIL_HEAP)
      );
      machines += 2;
      // the banksman ahead of the excavator, one arm up for the driver
      const [wx, wz] = offsetBy(yaw, 5, 3.5);
      if (fits(ex + wx, ez + wz, 0.6)) {
        place(
          ex + wx,
          ez + wz,
          yawTowards(-wx, -wz),
          0.6,
          () => worker(b, hash(wx, wz, 30), { arms: ["down", "up"] })
        );
        people += 1;
      }
      // and someone shovelling at the far side of the heap
      const sx = loading.x - dx * (loading.r + 1.2);
      const sz = loading.z - dz * (loading.r + 1.2);
      if (fits(sx, sz, 0.8)) {
        place(sx, sz, yawTowards(dx, dz), 0.8, () =>
          shoveller(b, hash(sx, sz, 31))
        );
        people += 1;
      }
      break;
    }
  }

  // a wheel loader at the gravel heap, bucket at its foot; dozers push the
  // next heaps, blade first
  heaps.slice(1, 4).forEach((heap, index) => {
    const loader = index === 0;
    const r = loader ? 3.9 : 3;
    const reach = heap.r + (loader ? 4.4 : 3.4);
    const turn = hash(heap.x, heap.z, 5) * Math.PI * 2;
    for (let i = 0; i < 12; i++) {
      const angle = turn + (i / 12) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const x = heap.x + dx * reach;
      const z = heap.z + dz * reach;
      if (!fits(x, z, r)) continue;
      place(x, z, yawTowards(-dx, -dz), r, () =>
        loader ? wheelLoader(b) : bulldozer(b)
      );
      tracksTo.push([x, z]);
      machines += 1;
      break;
    }
  });

  // a tipper on its way up the first ramp
  const [ramp] = terraces.ramps;
  if (ramp) {
    const front = graded(ramp.x + ramp.dx * 3, ramp.z + ramp.dz * 3);
    const back = graded(ramp.x - ramp.dx * 3, ramp.z - ramp.dz * 3);
    b.placed(
      [ramp.x, graded(ramp.x, ramp.z), ramp.z],
      yawTowards(ramp.dx, ramp.dz),
      () => dumpTruck(b, "#e3762b", "#e3762b", null),
      Math.atan2(front - back, 6)
    );
    machines += 1;
  }

  // the site office as close to the edge as the levels allow, door inwards
  let office: { x: number; z: number; edge: number } | null = null;
  for (const [x, z] of candidates(frame, 3, 6)) {
    if (!fits(x, z, 3.6)) continue;
    const edge = frame.edgeDistance(x, z);
    if (!office || edge < office.edge) office = { x, z, edge };
  }
  if (office) {
    const { x, z } = office;
    const gx = frame.edgeDistance(x + 0.5, z) - frame.edgeDistance(x - 0.5, z);
    const gz = frame.edgeDistance(x, z + 0.5) - frame.edgeDistance(x, z - 0.5);
    const yaw = Math.atan2(gx, gz);
    place(x, z, yaw, 3.6, () => siteContainer(b));
    tracksTo.push([x, z]);
    const [ox, oz] = offsetBy(yaw, 4.4, 0.3);
    place(x + ox, z + oz, yaw, 1, () => portableToilet(b));
    const [cx, cz] = offsetBy(yaw, -7, 0);
    if (fits(x + cx, z + cz, 3.4))
      place(x + cx, z + cz, yaw, 3.4, () => storageContainer(b, "#3f5e4a"));
    // two of the crew talking in front of the office door
    for (const [forward, right, other] of [
      [2.4, 3.3, [3.2, 3.8]],
      [3.2, 3.8, [2.4, 3.3]],
    ] as const) {
      const [px, pz] = offsetBy(yaw, forward, right);
      const [qx, qz] = offsetBy(yaw, other[0], other[1]);
      if (!footprints.free(x + px, z + pz, 0.35)) continue;
      place(x + px, z + pz, yawTowards(qx - px, qz - pz), 0.35, () =>
        worker(b, hash(px, pz, 32), {
          arms: forward < 3 ? ["down", "hold"] : "down",
        })
      );
      people += 1;
    }
    // the material yard round the office
    const yard: { r: number; draw: () => void }[] = [
      { r: 0.9, draw: () => pallet(b, "bricks") },
      { r: 0.9, draw: () => pallet(b, "bricks") },
      { r: 0.9, draw: () => pallet(b, "bags") },
      { r: 0.9, draw: () => pallet(b, "kerbs") },
      { r: 2.8, draw: () => pipes(b, "plastic") },
      { r: 1.8, draw: () => pipes(b, "concrete") },
      { r: 2.2, draw: () => skip(b, "#c0452c") },
    ];
    yard.forEach((item, i) => {
      for (let k = 0; k < 32; k++) {
        const angle = hash(i, k, 33) * Math.PI * 2;
        const distance = 5 + hash(k, i, 34) * 12;
        const px = x + Math.cos(angle) * distance;
        const pz = z + Math.sin(angle) * distance;
        if (!fits(px, pz, item.r)) continue;
        place(
          px,
          pz,
          yaw + (hash(px, pz, 35) < 0.5 ? 0 : Math.PI / 2),
          item.r,
          item.draw
        );
        props += 1;
        break;
      }
    });
  }

  // something going on every few metres: cones, pallets, people at work
  const scatter: ((seed: number) => void)[] = [
    () => {
      for (const x of [-1.3, 0, 1.3])
        b.transformed(new THREE.Matrix4().makeTranslation(x, 0, 0), () =>
          trafficCone(b)
        );
    },
    (seed) => worker(b, seed, { walk: true }),
    () => pallet(b, "bags"),
    (seed) => barrowPusher(b, seed),
    (seed) => worker(b, seed, { arms: "hold" }),
    () => pallet(b, "bricks"),
    (seed) => shoveller(b, seed),
  ];
  const wanted = Math.round(frame.areaM2 / 200);
  let scattered = 0;
  for (const [x, z] of candidates(frame, 6, 40)) {
    if (scattered >= wanted) break;
    if (!fits(x, z, 1.6) || frame.edgeDistance(x, z) < 3) continue;
    const draw = scatter[scattered % scatter.length];
    const seed = hash(x, z, 41);
    place(x, z, seed * Math.PI * 2, 1.6, () => draw(seed));
    scattered += 1;
  }

  for (const run of edgeRuns(frame, 3.5, 0.3, graded)) siteFence(b, run);

  paintTracks(painter, terraces, tracksTo);

  return finishScenario(
    frame,
    b,
    { heightAt: graded, painter, skirt: 3 },
    "construction site",
    {
    levels: terraces.levels.length,
    ramps: terraces.ramps.length,
    heaps: heaps.length,
    machines,
    people,
    props,
    scattered,
    }
  );
};

/** an irregular low-poly heap on the ground */
const drawHeap = (
  b: LowPolyBuilder,
  surface: (x: number, z: number) => number,
  x: number,
  z: number,
  r: number,
  height: number,
  paint: Paint
) => {
  const segments = 9;
  const base = surface(x, z);
  const outer: V3[] = [];
  const middle: V3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle =
      (i / segments) * Math.PI * 2 + (hash(x, z, 10 + i) - 0.5) * 0.3;
    const ro = r * (0.8 + 0.35 * hash(x, z, 20 + i));
    const rm = ro * 0.55;
    const ox = x + Math.cos(angle) * ro;
    const oz = z + Math.sin(angle) * ro;
    outer.push([ox, surface(ox, oz) - 0.05, oz]);
    middle.push([
      x + Math.cos(angle) * rm,
      base + height * 0.62 * (0.9 + 0.2 * hash(x, z, 30 + i)),
      z + Math.sin(angle) * rm,
    ]);
  }
  const apex: V3 = [x + (hash(x, z, 40) - 0.5) * r * 0.3, base + height, z];
  const center: V3 = [x, base + height * 0.3, z];
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    b.triangle(outer[i], outer[j], middle[j], paint, center);
    b.triangle(outer[i], middle[j], middle[i], paint, center);
    b.triangle(middle[i], middle[j], apex, paint, center);
  }
};

/** the bare site: compacted soil on the levels, layered cut on the banks,
 * gravel on the ramps, untouched topsoil going to grass at the edge */
const paintGround = (frame: SiteFrame, terraces: Terracing): GroundPainter => {
  const painter = new GroundPainter(frame);
  painter.field(0.25, (x, z) => {
    const { bank, ramp } = terraces.surfaceAt(x, z);
    const lumps = 0.92 + 0.16 * noise(x, z, 3.5, 1);
    const dry = noise(x, z, 9, 2);
    let color = mix(SOIL, SOIL_DRY, dry * dry);
    // strata along the contour where the banks are cut
    const layer =
      0.95 + 0.06 * Math.sin(terraces.u(x, z) * 7 + noise(x, z, 4, 5) * 6);
    color = mix(color, [CUT[0] * layer, CUT[1] * layer, CUT[2] * layer], bank);
    const gravel = smooth01((ramp - 0.35) / 0.3);
    color = mix(color, mix(GRAVEL, VERGE, 0.25 * noise(x, z, 1.5, 3)), gravel);
    color = mix(color, VERGE, 0.7 * 4 * gravel * (1 - gravel));
    // untouched topsoil along the cut edge, going to grass right at it
    const edge = frame.inside(x, z) ? frame.edgeDistance(x, z) : 0;
    color = mix(color, TOPSOIL, 1 - smooth01((edge - 1.5) / 5));
    const grass = 1 - smooth01((edge - 0.5 + 1.5 * noise(x, z, 2, 4)) / 2.5);
    color = mix(color, ROUGH_GRASS, grass);
    return tone(color, lumps);
  });
  painter.blotches({
    seed: 11,
    perM2: 1 / 30,
    radius: [1.2, 4.5],
    colors: [
      [196, 170, 128, 0.16],
      [92, 68, 44, 0.14],
    ],
  });
  // where water stands after rain, at the foot of the banks
  for (const [x, z] of seededPoints(frame, terraces, 3)) puddle(painter, x, z);
  return painter;
};

/** a few spots on the levels near a bank, fixed per site */
const seededPoints = (
  frame: SiteFrame,
  terraces: Terracing,
  count: number
): Point[] => {
  const found: Point[] = [];
  for (let x = frame.minX; x < frame.maxX && found.length < count; x += 7)
    for (let z = frame.minZ; z < frame.maxZ && found.length < count; z += 7) {
      const px = x + hash(x, z, 90) * 5;
      const pz = z + hash(z, x, 91) * 5;
      if (hash(px, pz, 92) > 0.08) continue;
      if (terraces.isLevel(px, pz, 1) && !terraces.isLevel(px, pz, 5))
        found.push([px, pz]);
    }
  return found;
};

const puddle = (painter: GroundPainter, x: number, z: number) => {
  const { ctx } = painter;
  for (let i = 0; i < 4; i++) {
    const px = x + (hash(x, z, 93 + i) - 0.5) * 2.4;
    const pz = z + (hash(z, x, 97 + i) - 0.5) * 1.4;
    const r = 0.6 + hash(px, pz, 101) * 0.7;
    for (const [reach, color] of [
      [1.6, "rgba(92, 70, 46, 0.35)"],
      [1, "rgba(112, 122, 126, 0.8)"],
    ] as const) {
      const gradient = ctx.createRadialGradient(px, pz, 0, px, pz, r * reach);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.7, color);
      gradient.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, pz, r * reach, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

/** loose material round the foot of a heap */
const spill = (
  painter: GroundPainter,
  x: number,
  z: number,
  r: number,
  color: string
) => {
  const { ctx } = painter;
  const gradient = ctx.createRadialGradient(x, z, r * 0.6, x, z, r + 1.6);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, z, r + 1.6, 0, Math.PI * 2);
  ctx.fill();
};

/** a polyline moved `d` metres to its right */
const offsetLine = (points: readonly Point[], d: number): Point[] =>
  points.map(([x, z], i) => {
    const [ax, az] = points[Math.max(0, i - 1)];
    const [bx, bz] = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    return [x - ((bz - az) / length) * d, z + ((bx - ax) / length) * d];
  });

/**
 * Tyre tracks: up and down every ramp, and from the ramps out to where the
 * machines work, each a pair of wheel lines on a gently bending course.
 */
const paintTracks = (
  painter: GroundPainter,
  terraces: Terracing,
  targets: readonly Point[]
) => {
  const ends: Point[] = [];
  for (const ramp of terraces.ramps) {
    const half = ramp.length / 2 + 2;
    const bottom: Point = [ramp.x - ramp.dx * half, ramp.z - ramp.dz * half];
    const top: Point = [ramp.x + ramp.dx * half, ramp.z + ramp.dz * half];
    ends.push(bottom, top);
    drive(painter, [bottom, [ramp.x, ramp.z], top]);
  }
  if (!ends.length) return;
  targets.forEach(([tx, tz], i) => {
    let best = ends[0];
    for (const end of ends)
      if (
        Math.hypot(end[0] - tx, end[1] - tz) <
        Math.hypot(best[0] - tx, best[1] - tz)
      )
        best = end;
    const [bx, bz] = best;
    // a bend half way, to one side or the other
    const side = hash(tx, tz, 96 + i) - 0.5;
    const mx = (bx + tx) / 2 - (tz - bz) * side * 0.35;
    const mz = (bz + tz) / 2 + (tx - bx) * side * 0.35;
    drive(painter, [best, [mx, mz], [tx, tz]]);
  });
};

const drive = (painter: GroundPainter, course: readonly Point[]) => {
  const line = GroundPainter.smooth(course, 10);
  for (const side of [-1, 1])
    painter.line(offsetLine(line, side * 1.0), 0.55, TRACK);
};
