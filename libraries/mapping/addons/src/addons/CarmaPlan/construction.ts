import { LowPolyBuilder, type Paint, type V3 } from "./lowpoly";
import {
  bulldozer,
  dumpTruck,
  excavator,
  fence,
  portableToilet,
  siteContainer,
} from "./models";
import {
  Footprints,
  candidates,
  edgeRuns,
  finishScenario,
  offsetBy,
  yawTowards,
  type CarmaPlanScenario,
} from "./scenario";
import { hash, smoothstep, type SiteFrame } from "./site-frame";
import { createTerracing } from "./terracing";

/**
 * Scenario "Baustelle": everything on the site is gone and the ground is
 * graded into a few slight terraces, with ramps between them the machines can
 * drive. On the levels: heaps of spoil, gravel and sand, an excavator loading
 * a tipper, dozers pushing heaps, a second tipper on its way up a ramp, a site
 * office with its toilet, and site fencing along the cut edge.
 */

/** lift over the DGM so the map's own terrain never shows through */
const LIFT = 0.15;
/** facet relief of the churned soil, metres up and down */
const ROUGHNESS = 0.12;
const CELL = 2;
const EDGE_BLEND = 10;

const SOIL = ["#8a6d4b", "#7f6343", "#967955", "#a3865f", "#866848"];
const CUT = ["#6f5539", "#765b3e", "#684f35"];
const GRAVEL = ["#9b8b6f", "#a39477", "#93856a"];
const SPOIL_HEAP = ["#6e5336", "#7a5d3d", "#654b31"];
const GRAVEL_HEAP = ["#9a9a94", "#a7a6a0", "#8d8d87"];
const SAND_HEAP = ["#d2b77a", "#c9ad70", "#dcc286"];

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
  const surface = (x: number, z: number) => {
    const settle = terraces.zoneAt(x, z) === "ramp" ? 0.3 : 1;
    const w = smoothstep(EDGE_BLEND, frame.edgeDistance(x, z));
    return graded(x, z) + (hash(x, z) - 0.5) * 2 * ROUGHNESS * w * settle;
  };

  const b = new LowPolyBuilder();
  b.ground(
    frame,
    CELL,
    surface,
    (x, z, level) => {
      if (terraces.zoneAt(x, z) === "ramp") return GRAVEL;
      return level < 0.97 ? CUT : SOIL;
    },
    { depth: 3, paint: "#5f4a33" }
  );

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
    drawHeap(b, surface, x, z, r, 1.6 + hash(x, z, 4) * 1.6, paint);
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
      const [ox, oz] = offsetBy(yaw, 0.7, -6.0);
      const tx = ex + ox;
      const tz = ez + oz;
      if (!fits(ex, ez, 3.2) || !fits(tx, tz, 4.3)) continue;
      place(ex, ez, yaw, 3.2, () => excavator(b, Math.PI / 2));
      place(tx, tz, yaw, 4.3, () =>
        dumpTruck(b, "#f2f2ef", "#a5a7a8", SPOIL_HEAP)
      );
      machines += 2;
      break;
    }
  }

  // dozers push the next heaps, blade first
  for (const heap of heaps.slice(1, 3)) {
    const turn = hash(heap.x, heap.z, 5) * Math.PI * 2;
    for (let i = 0; i < 12; i++) {
      const angle = turn + (i / 12) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const x = heap.x + dx * (heap.r + 3.4);
      const z = heap.z + dz * (heap.r + 3.4);
      if (!fits(x, z, 3)) continue;
      place(x, z, yawTowards(-dx, -dz), 3, () => bulldozer(b));
      machines += 1;
      break;
    }
  }

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
    const [ox, oz] = offsetBy(yaw, 4.4, 0.3);
    place(x + ox, z + oz, yaw, 1, () => portableToilet(b));
  }

  for (const run of edgeRuns(frame, 3.5, 0.3, graded))
    fence(b, run, {
      height: 2.0,
      rails: [0.15, 1.0, 1.95],
      paint: "#a3a9ae",
      post: 0.06,
      foot: "#c96a32",
    });

  return finishScenario(frame, b, "construction site", {
    levels: terraces.levels.length,
    ramps: terraces.ramps.length,
    heaps: heaps.length,
    machines,
  });
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
